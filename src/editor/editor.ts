/**
 * The editor: toolbar across the top, step strip down the left, the drawing
 * in the middle in a pannable, zoomable viewport, properties on the right,
 * save status at the bottom. Plain DOM, no framework.
 *
 * One state, one pipeline: every history change runs `compute` on the plan,
 * redraws the tracks at the view's scale, re-places the sprites for the
 * current step, and refills the strip and the properties. The view (zoom and
 * pan) is kept across plan changes so the drawing holds still while you work.
 */

import type { Command, CommandResult } from "../core/commands/commands";
import { createHistory, type History } from "../core/commands/history";
import { placeUnits } from "../core/layout/place";
import { cloneJson } from "../core/schema/clone";
import type { Id, PlanReading, WorkStep } from "../core/schema/types";
import { createPlayer, type Player } from "../player/player";
import type { DrawPoint } from "../core/layout/layout";
import { fitPxPerFt, renderDrawing, renderOptions, renderSprites, frameOf, toScreen, type RenderOptions } from "../render/render";
import { attachCarTools } from "./carTools";
import { button, clear, closeDialog, el, showDialog } from "./dom";
import { attachKeys } from "./keys";
import { compute, stepIndexOf, type Computed, type EditorState, type Selection } from "./model";
import { attachMoveTools } from "./moveTools";
import { createProperties } from "./properties";
import { createStepStrip } from "./stepStrip";
import { attachAutosave, SAVE_STATUS_TEXT } from "./store/autosave";
import { downloadJson, readPlanFile } from "./store/file";
import { listPlans, loadPlan, newLocalId, savePlan, setLastOpenedId } from "./store/storage";
import { TEMPLATES } from "./templates";
import { createToolbar, type Toolbar } from "./toolbar";
import { attachTrackTools } from "./trackTools";
import { fitView, panBy, screenToDrawing, viewBoxOf, zoomAt, ZOOM_STEP, type View } from "./viewport";

const DRAG_TOOL_HINTS: Record<string, string> = {
  turnout: "Drag Turnout onto a track to add a branch there.",
  "track-end": "Drag Track end onto a branch to end it with a buffer stop.",
  facility: "Drag Facility onto a track to place it."
};

export interface EditorOptions {
  /** The browser-storage id to autosave under. Without one nothing is saved. */
  localId?: string;
  /** The plan to open. Without one, the plan saved under localId, or the demo. */
  plan?: PlanReading;
  storage?: Storage;
}

export interface Editor {
  state(): EditorState;
  readonly history: History;
  dispatch(commands: Command | Command[], label: string): CommandResult;
  select(s: Selection): void;
  showStep(i: number): void;
  view(): View;
  setView(v: View): void;
  fit(): void;
  setStatus(text: string): void;
  canvasSize(): { width: number; height: number };
  /** Open another plan in this editor (a template, a file, a saved plan). */
  open(plan: PlanReading, localId?: string): void;
  /**
   * Show a scratch plan in place of the real one while a drag is in progress,
   * without touching history; `undefined` shows the real plan again. `state()`
   * reports the plan on show.
   */
  preview(plan: PlanReading | undefined, stepIndex?: number): void;
  /** The layer above the sprites for ghosts, handles and drag labels; emptied on every redraw. */
  overlay(): SVGGElement;
  /** Called after every paint (plan, view, step or selection change); tools repaint their overlay here. */
  onDraw(fn: () => void): () => void;
  /** A drawing point in the svg's own units. */
  svgPoint(p: DrawPoint): { x: number; y: number };
  /** The drawing point under a pointer event. */
  drawingAt(e: { clientX: number; clientY: number }): DrawPoint;
  /** The client coordinates of a drawing point (the inverse of drawingAt). */
  clientPoint(p: DrawPoint): { clientX: number; clientY: number };
  /** What the Delete key does to the selection. */
  deleteSelection(): void;
  /** Handle a toolbar button's click; returns the unregister. */
  registerTool(tool: string, fn: () => void): () => void;
  destroy(): void;
  root: HTMLElement;
  /** The canvas the svg sits in; pointer positions are measured against it. */
  canvas: HTMLElement;
  /** The svg the drawing is in. */
  svg: SVGSVGElement;
  toolbar: Toolbar;
}

const FALLBACK_WIDTH_PX = 960;
const FALLBACK_HEIGHT_PX = 480;
const SVG_NS = "http://www.w3.org/2000/svg";

export function createEditor(mount: HTMLElement, options: EditorOptions = {}): Editor {
  const storage = options.storage;
  let localId = options.localId;
  const initial = options.plan ?? (localId ? loadPlan(localId, storage) : null) ?? TEMPLATES.find((t) => t.id === "demo")!.make();
  const history = createHistory(initial);

  // ---- state ----
  let computed: Computed = compute(history.plan);
  let stepIndex = 0;
  let selection: Selection = { kind: "none" };
  let showSpots = false;
  let view: View | undefined;
  let renderOpts: RenderOptions = renderOptions();
  let clipboard: WorkStep | undefined;
  let player: Player | undefined;
  /** A scratch plan on show during a drag; computed follows it while set. */
  let previewPlan: PlanReading | undefined;
  const drawListeners = new Set<() => void>();

  function shownPlan(): PlanReading {
    return previewPlan ?? history.plan;
  }

  function state(): EditorState {
    return { plan: shownPlan(), computed, stepIndex, selection, showSpots };
  }

  // ---- DOM ----
  const root = el("div", "editor");
  const toolbar = createToolbar(onTool);
  const strip = createStepStrip(
    (i) => {
      stepIndex = i;
      selection = { kind: "step", id: computed.sim.steps[i]!.stepId };
      paintSprites();
      refreshPanels();
    },
    (from, to) => reorderCard(from, to)
  );

  /** Drop the card at sim index `from` before the card at sim index `to`; the arrival and departure stay put. */
  function reorderCard(from: number, to: number): void {
    const steps = computed.sim.steps;
    const id = steps[from]?.stepId;
    if (id === undefined || id === "arrival" || id === "departure") return;
    const work = history.plan.work;
    const fromWork = work.findIndex((w) => w.id === id);
    if (fromWork < 0) return;
    let index: number;
    if (to <= 0) index = 0;
    else if (to >= steps.length - 1) index = work.length - 1;
    else index = fromWork < to - 1 ? to - 2 : to - 1;
    if (index === fromWork) return;
    dispatch({ name: "reorderStep", stepId: id, index }, "reorder step");
    select({ kind: "step", id });
  }
  const canvas = el("div", "canvas");
  const stage = el("div", "stage");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "plan");
  stage.appendChild(svg);
  canvas.appendChild(stage);
  /** True while a change from the properties form is being applied; the form is not rebuilt under the person's fingers. */
  let fromPanel = false;
  const props = createProperties({
    dispatch(cmd, label) {
      fromPanel = true;
      try {
        dispatch(cmd, label);
      } finally {
        fromPanel = false;
      }
    },
    setShowSpots(on) {
      showSpots = on;
      drawAll();
      refreshPanels();
    },
    flip(switchId, axis) {
      dispatch({ name: "flipTurnout", switchId, axis }, axis === "up_down" ? "flip up/down" : "flip left/right");
    }
  });
  const status = el("div", "status");
  const saveStatus = el("span", "save-status", localId ? SAVE_STATUS_TEXT.saved : "Not saved in this browser");
  const message = el("span", "message");
  status.append(saveStatus, message);
  root.append(toolbar.root, strip.root, canvas, props.root, status);
  mount.appendChild(root);

  // ---- drawing ----

  function canvasSize(): { width: number; height: number } {
    const width = canvas.clientWidth > 0 ? canvas.clientWidth : FALLBACK_WIDTH_PX;
    const height = canvas.clientHeight > 0 ? canvas.clientHeight : FALLBACK_HEIGHT_PX;
    return { width, height };
  }

  function currentView(): View {
    if (!view) {
      const { width, height } = canvasSize();
      view = fitView(computed.drawing, width, height);
    }
    return view;
  }

  function applyViewBox(): void {
    const v = currentView();
    const { width, height } = canvasSize();
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", viewBoxOf(v, frameOf(computed.drawing, renderOpts), width, height));
  }

  /** Redraw tracks and sprites at the view's scale. */
  function drawAll(): void {
    const v = currentView();
    renderOpts = renderOptions({ pxPerFt: v.pxPerFt, laneGapPx: v.laneGapPx, showSpots });
    renderDrawing(svg, computed.drawing, renderOpts);
    const over = document.createElementNS(SVG_NS, "g");
    over.setAttribute("class", "overlay");
    svg.appendChild(over);
    applyViewBox();
    paintSprites();
  }

  function spriteLayer(): SVGGElement {
    const layer = svg.querySelector("g.sprites");
    if (!layer) throw new Error("the drawing has no sprite layer");
    return layer as SVGGElement;
  }

  function overlay(): SVGGElement {
    const layer = svg.querySelector("g.overlay");
    if (!layer) throw new Error("the drawing has no overlay layer");
    return layer as SVGGElement;
  }

  function paintSprites(): void {
    const step = computed.sim.steps[stepIndex];
    const world = computed.sim.states[stepIndex] ?? computed.sim.initial;
    renderSprites(spriteLayer(), placeUnits(computed.drawing, computed.g, world, computed.units), renderOpts, step?.status);
    for (const fn of drawListeners) fn();
  }

  function onDraw(fn: () => void): () => void {
    drawListeners.add(fn);
    return () => drawListeners.delete(fn);
  }

  // ---- coordinates ----

  function svgPoint(p: DrawPoint): { x: number; y: number } {
    return toScreen(p, renderOpts, frameOf(computed.drawing, renderOpts));
  }

  function drawingAt(e: { clientX: number; clientY: number }): DrawPoint {
    const r = canvas.getBoundingClientRect();
    return screenToDrawing(currentView(), frameOf(computed.drawing, renderOpts), { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  function clientPoint(p: DrawPoint): { clientX: number; clientY: number } {
    const r = canvas.getBoundingClientRect();
    const v = currentView();
    const s = svgPoint(p);
    return { clientX: s.x - v.panX + r.left, clientY: s.y - v.panY + r.top };
  }

  /** The step on show before a preview moved it, restored when the preview ends. */
  let stepBeforePreview: number | undefined;
  function preview(plan: PlanReading | undefined, atStep?: number): void {
    if (plan === undefined && previewPlan === undefined) return;
    if (plan !== undefined && previewPlan === undefined) stepBeforePreview = stepIndex;
    previewPlan = plan;
    computed = compute(shownPlan());
    if (plan === undefined && stepBeforePreview !== undefined) {
      stepIndex = stepBeforePreview;
      stepBeforePreview = undefined;
    }
    if (atStep !== undefined) stepIndex = atStep;
    stepIndex = Math.min(stepIndex, Math.max(0, computed.sim.steps.length - 1));
    drawAll();
    refreshPanels();
  }

  /**
   * The properties form is rebuilt only when the selection changes or when
   * the change came from somewhere else. A change from the form itself (a
   * field's change event, which Chrome fires after focus has already moved
   * on) leaves the form in place, so tabbing to the next field works; the
   * form is refreshed once focus leaves the panel.
   */
  let propsKey = "";
  let propsStale = false;
  function refreshPanels(): void {
    const s = state();
    strip.render(s);
    const key = JSON.stringify(s.selection);
    if (key !== propsKey || !fromPanel) {
      props.render(s);
      propsKey = key;
      propsStale = false;
    } else propsStale = true;
    toolbar.setEnabled("undo", history.canUndo);
    toolbar.setEnabled("redo", history.canRedo);
  }
  props.root.addEventListener("focusout", (e) => {
    const next = e.relatedTarget;
    if (propsStale && !(next instanceof Node && props.root.contains(next))) {
      props.render(state());
      propsStale = false;
    }
  });

  // ---- plan changes ----

  function afterPlanChange(): void {
    previewPlan = undefined;
    stepBeforePreview = undefined;
    computed = compute(history.plan);
    stepIndex = Math.min(stepIndex, Math.max(0, computed.sim.steps.length - 1));
    selection = stillValid(selection) ? selection : { kind: "none" };
    drawAll();
    refreshPanels();
  }

  function stillValid(s: Selection): boolean {
    const plan = history.plan;
    switch (s.kind) {
      case "none":
        return true;
      case "track":
        return plan.tracks.some((t) => t.id === s.id);
      case "switch":
        return plan.switches.some((x) => x.id === s.id);
      case "facility":
        return plan.facilities.some((f) => f.id === s.id);
      case "units":
        return s.ids.every((id) => computed.units.has(id));
      case "step":
        return stepIndexOf(computed, s.id) !== undefined;
    }
  }

  const unsubscribe = history.subscribe(() => afterPlanChange());

  let detachAutosave: (() => void) | undefined;
  function startAutosave(): void {
    detachAutosave?.();
    detachAutosave = undefined;
    if (!localId) return;
    detachAutosave = attachAutosave(history, localId, (s) => (saveStatus.textContent = SAVE_STATUS_TEXT[s]), storage);
  }
  startAutosave();

  function dispatch(commands: Command | Command[], label: string): CommandResult {
    const r = history.dispatch(commands, label);
    if (r.problems.length > 0) setStatus(r.problems.map((p) => p.message).join("; "));
    return r;
  }

  function open(plan: PlanReading, id?: string): void {
    localId = id;
    history.reset(plan);
    stepIndex = 0;
    selection = { kind: "none" };
    view = undefined;
    startAutosave();
    if (id) {
      try {
        savePlan(id, plan, storage);
        setLastOpenedId(id, storage);
        saveStatus.textContent = SAVE_STATUS_TEXT.saved;
      } catch {
        saveStatus.textContent = SAVE_STATUS_TEXT.failed;
      }
    } else saveStatus.textContent = "Not saved in this browser";
    afterPlanChange();
  }

  // ---- selection and steps ----

  function select(s: Selection): void {
    selection = s;
    if (s.kind === "step") {
      const i = stepIndexOf(computed, s.id);
      if (i !== undefined) stepIndex = i;
    }
    paintSprites();
    refreshPanels();
  }

  function showStep(i: number): void {
    stepIndex = Math.min(computed.sim.steps.length - 1, Math.max(0, Math.floor(i)));
    paintSprites();
    refreshPanels();
  }

  function workIndexOfSelection(): number | undefined {
    const sel = selection;
    if (sel.kind !== "step") return undefined;
    const i = history.plan.work.findIndex((w) => w.id === sel.id);
    return i < 0 ? undefined : i;
  }

  function deleteSelection(): void {
    const plan = history.plan;
    const sel = selection;
    switch (sel.kind) {
      case "step": {
        const id = sel.id;
        if (id === "arrival" || id === "departure") return;
        dispatch({ name: "deleteStep", stepId: id }, "delete step");
        break;
      }
      case "units": {
        const cars = sel.ids.filter((id) => computed.units.get(id)?.kind === "car");
        if (cars.length > 0) dispatch(cars.map((carId) => ({ name: "deleteCar", carId }) as Command), "delete cars");
        break;
      }
      case "facility":
        dispatch({ name: "deleteFacility", facilityId: sel.id }, "delete facility");
        break;
      case "track": {
        const t = plan.tracks.find((x) => x.id === sel.id);
        if (!t || t.id === plan.arrival.on) return;
        if (window.confirm(`Delete ${t.name ?? t.id} and everything on it?`)) dispatch({ name: "deleteTrack", trackId: t.id }, "delete track");
        break;
      }
      case "switch":
      case "none":
        break;
    }
  }

  function copyStep(): void {
    const i = workIndexOfSelection();
    if (i !== undefined) clipboard = cloneJson(history.plan.work[i]!);
  }

  function pasteStep(): void {
    if (!clipboard) return;
    const { id: _dropped, ...rest } = clipboard;
    const after = workIndexOfSelection();
    const r = dispatch({ name: "addStep", step: rest, index: after === undefined ? undefined : after + 1 }, "paste step");
    const id = r.created[0];
    if (id) select({ kind: "step", id });
  }

  const detachKeys = attachKeys(document, {
    undo: () => void history.undo(),
    redo: () => void history.redo(),
    deleteSelection,
    escape: () => select({ kind: "none" }),
    copy: copyStep,
    paste: pasteStep
  });

  // ---- view ----

  function setView(v: View): void {
    const scaleChanged = !view || v.pxPerFt !== view.pxPerFt || v.laneGapPx !== view.laneGapPx;
    view = v;
    if (scaleChanged) drawAll();
    else applyViewBox();
  }

  function fit(): void {
    const { width, height } = canvasSize();
    setView(fitView(computed.drawing, width, height));
  }

  function zoomBy(factor: number, anchor?: { x: number; y: number }): void {
    const { width, height } = canvasSize();
    const usable = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) ? anchor : { x: width / 2, y: height / 2 };
    setView(zoomAt(currentView(), factor, usable));
  }

  function pointerPos(e: MouseEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, pointerPos(e));
    },
    { passive: false }
  );

  let pan: { x: number; y: number } | undefined;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // Pan from anywhere on the drawing except the sprites and the tools' handles.
    if (e.target instanceof Element && e.target !== svg && (e.target.closest("g.sprites") || e.target.closest("g.overlay"))) return;
    e.preventDefault();
    pan = pointerPos(e);
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pan) return;
    const p = pointerPos(e);
    setView(panBy(currentView(), pan.x - p.x, pan.y - p.y));
    pan = p;
  });
  const endPan = (): void => {
    pan = undefined;
  };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);

  const onResize = (): void => applyViewBox();
  window.addEventListener("resize", onResize);

  // ---- toolbar ----

  const toolHandlers = new Map<string, () => void>();
  function registerTool(tool: string, fn: () => void): () => void {
    toolHandlers.set(tool, fn);
    return () => {
      if (toolHandlers.get(tool) === fn) toolHandlers.delete(tool);
    };
  }

  function onTool(tool: string): void {
    const handler = toolHandlers.get(tool);
    if (handler) {
      handler();
      return;
    }
    switch (tool) {
      case "new":
        openNewDialog();
        break;
      case "open":
        pickFile();
        break;
      case "download":
        downloadJson(history.plan);
        break;
      case "undo":
        history.undo();
        break;
      case "redo":
        history.redo();
        break;
      case "zoom-in":
        zoomBy(ZOOM_STEP);
        break;
      case "zoom-out":
        zoomBy(1 / ZOOM_STEP);
        break;
      case "fit":
        fit();
        break;
      case "play":
        openPlayer();
        break;
      default: {
        const hint = DRAG_TOOL_HINTS[tool];
        setStatus(hint ?? "This tool comes in a later step.");
      }
    }
  }

  function setStatus(text: string): void {
    message.textContent = text;
  }

  function openNewDialog(): void {
    const dialog = el("dialog", "new-plan");
    dialog.appendChild(el("h2", undefined, "New plan"));
    dialog.appendChild(el("p", undefined, "Start from a template"));
    const templates = el("div", "choices");
    for (const t of TEMPLATES) {
      templates.appendChild(
        button("choice", t.label, () => {
          closeDialog(dialog);
          dialog.remove();
          open(t.make(), newLocalId());
        })
      );
    }
    dialog.appendChild(templates);
    const saved = listPlans(storage);
    if (saved.length > 0) {
      dialog.appendChild(el("p", undefined, "Or open a plan saved in this browser"));
      const list = el("div", "choices");
      for (const m of saved) {
        list.appendChild(
          button("choice saved", m.title || "Untitled plan", () => {
            const plan = loadPlan(m.localId, storage);
            closeDialog(dialog);
            dialog.remove();
            if (plan) open(plan, m.localId);
            else setStatus("That saved plan could not be read.");
          })
        );
      }
      dialog.appendChild(list);
    }
    dialog.appendChild(
      button("close", "Cancel", () => {
        closeDialog(dialog);
        dialog.remove();
      })
    );
    root.appendChild(dialog);
    showDialog(dialog);
  }

  function pickFile(): void {
    const input = el("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      const r = await readPlanFile(file);
      if (!r.plan) {
        setStatus(`This file could not be opened. ${r.problems[0]?.message ?? ""}`.trim());
        return;
      }
      open(r.plan, newLocalId());
      if (r.problems.length > 0) setStatus(`Opened with ${r.problems.length} thing${r.problems.length > 1 ? "s" : ""} to check.`);
    });
    root.appendChild(input);
    input.click();
  }

  function openPlayer(): void {
    const dialog = el("dialog", "play");
    const holder = el("div", "play-holder");
    dialog.appendChild(holder);
    dialog.appendChild(
      button("close", "Close", () => {
        player?.destroy();
        player = undefined;
        closeDialog(dialog);
        dialog.remove();
      })
    );
    root.appendChild(dialog);
    showDialog(dialog);
    player = createPlayer(holder, history.plan);
    player.show(stepIndex);
  }

  // ---- first paint ----
  drawAll();
  refreshPanels();

  function destroy(): void {
    detachTools.forEach((d) => d());
    strip.destroy();
    unsubscribe();
    detachAutosave?.();
    detachKeys();
    player?.destroy();
    window.removeEventListener("resize", onResize);
    root.remove();
  }

  const editor: Editor = {
    state,
    history,
    dispatch,
    select,
    showStep,
    view: () => currentView(),
    setView,
    fit,
    setStatus,
    canvasSize,
    open,
    preview,
    overlay,
    onDraw,
    svgPoint,
    drawingAt,
    clientPoint,
    deleteSelection,
    registerTool,
    destroy,
    root,
    canvas,
    svg,
    toolbar
  };

  // ---- tools ----
  const detachTools = [attachTrackTools(editor), attachCarTools(editor), attachMoveTools(editor)];
  paintSprites();

  return editor;
}

export { fitPxPerFt };
export type { Id };
