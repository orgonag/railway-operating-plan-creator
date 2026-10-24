/**
 * Making steps on the canvas: select units (click, shift-click, a shift-drag
 * marquee), drag them along the track to make a move, and use the small
 * buttons on the train (scissors, link, Load, Unload) and the Stop and Note
 * toolbar buttons for the other kinds of step.
 *
 * A drag shows a preview on every pointer move by applying the would-be
 * commands to a scratch plan; release dispatches them as one history entry
 * labelled "move"; Esc discards. The arithmetic (following the route, the
 * cuts a selection needs, the caption) lives in src/core/editing.
 */

import type { Command, StepInput } from "../core/commands/commands";
import { applyCommands } from "../core/commands/commands";
import { autoCaption, type CaptionVerb } from "../core/editing/caption";
import { planCut } from "../core/editing/cuts";
import { followDrag, type DragResult, type DragStart } from "../core/editing/dragRoute";
import type { Segment } from "../core/engine/graph";
import { cleanPath, type WorldState } from "../core/engine/state";
import { placeUnits } from "../core/layout/place";
import { pointAt, type DrawPoint } from "../core/layout/layout";
import type { Id, PlanReading, RailroadStep } from "../core/schema/types";
import { SVG_NS } from "../render/silhouettes";
import { theme } from "../render/theme";
import type { Editor } from "./editor";
import type { Computed } from "./model";

export const NOT_A_RUN_TEXT = "Select cars that are coupled together in a row.";
export const STOP_CALLOUT_TEXT = "Stop here";
export const NOTE_TEXT = "Note";
/** Two free couplers this close show a link button. */
export const LINK_REACH_FT = 100;
const BUTTON_R = 9;

type Drag =
  | {
      kind: "units";
      start: DragStart;
      uncouples: [Id, Id][];
      world: WorldState;
      base: PlanReading;
      computed: Computed;
      insertAt: number;
      samples: DrawPoint[];
      commands: Command[];
    }
  | { kind: "marquee"; from: DrawPoint; to: DrawPoint };

export function attachMoveTools(editor: Editor): () => void {
  const detach: Array<() => void> = [];
  let drag: Drag | undefined;

  function listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void): void;
  function listen<K extends keyof HTMLElementEventMap>(target: HTMLElement | SVGElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void;
  function listen(target: EventTarget, type: string, fn: (e: never) => void): void {
    target.addEventListener(type, fn as EventListener);
    detach.push(() => target.removeEventListener(type, fn as EventListener));
  }

  function selectedUnits(): Id[] {
    const s = editor.state().selection;
    return s.kind === "units" ? [...s.ids] : [];
  }

  function world(): WorldState {
    const { computed, stepIndex } = editor.state();
    return computed.sim.states[stepIndex] ?? computed.sim.initial;
  }

  /** Steps made now go after the step on show; on the departure, before it. */
  function insertAt(): number {
    return Math.min(editor.state().stepIndex, editor.history.plan.work.length);
  }

  function addStep(step: StepInput, label: string): void {
    const r = editor.dispatch({ name: "addStep", step, index: insertAt() }, label);
    const id = r.created[0];
    if (id) editor.select({ kind: "step", id });
  }

  // ---- overlay: train buttons, offstage tabs, marquee ----

  function paint(): void {
    const over = editor.overlay();
    over.querySelector("g.move-tools")?.remove();
    const g = group("move-tools");
    if (!drag) g.appendChild(trainButtons());
    if (drag?.kind === "marquee") {
      const a = editor.svgPoint(drag.from);
      const b = editor.svgPoint(drag.to);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "marquee");
      rect.setAttribute("x", num(Math.min(a.x, b.x)));
      rect.setAttribute("y", num(Math.min(a.y, b.y)));
      rect.setAttribute("width", num(Math.abs(b.x - a.x)));
      rect.setAttribute("height", num(Math.abs(b.y - a.y)));
      rect.setAttribute("fill", theme.gold);
      rect.setAttribute("fill-opacity", "0.12");
      rect.setAttribute("stroke", theme.gold);
      rect.setAttribute("stroke-dasharray", "4 3");
      g.appendChild(rect);
    }
    over.appendChild(g);
  }
  detach.push(editor.onDraw(paint));

  function trainButtons(): SVGGElement {
    const g = group("train-buttons");
    const { plan, computed } = editor.state();
    const w = world();
    const isLoco = (id: Id): boolean => computed.units.get(id)?.kind === "loco";
    const occupies = (id: Id): Segment[] => {
      const p = w.places[id];
      return p && "occupies" in p ? p.occupies : [];
    };
    const at = (track: Id, ft: number): { x: number; y: number } => editor.svgPoint(pointAt(computed.drawing, computed.g, { track, ft }).at);

    // Scissors between each adjacent pair of a group.
    for (const units of w.coupled) {
      for (let i = 0; i + 1 < units.length; i += 1) {
        const a = units[i]!;
        const b = units[i + 1]!;
        const last = occupies(a).slice(-1)[0];
        if (!last) continue;
        const p = at(last.track, last.toFt);
        const btn = button("scissors", { x: p.x, y: p.y - 28 }, "M -4 -4 L 4 4 M 4 -4 L -4 4 M -4 3 a 2 2 0 1 0 0 .1 M 4 3 a 2 2 0 1 0 0 .1", `Uncouple between ${a} and ${b}`);
        btn.setAttribute("data-a", a);
        btn.setAttribute("data-b", b);
        btn.addEventListener("click", () => addStep({ actor: "railroad", do: "uncouple", between: [a, b], text: `Uncouple ${unitName(plan, a)} from ${unitName(plan, b)}` }, "uncouple"));
        g.appendChild(btn);
      }
    }

    // A link where two groups' free ends stand within reach on the same track.
    const ends = w.coupled.map((units, gi) => {
      const path = cleanPath(units.flatMap(occupies));
      const first = path[0];
      const last = path[path.length - 1];
      if (!first || !last) return [];
      return [
        { gi, units, track: first.track, ft: first.fromFt },
        { gi, units, track: last.track, ft: last.toFt }
      ];
    });
    const linked = new Set<string>();
    ends.forEach((mine, gi) => {
      for (const e of mine) {
        for (const other of ends.slice(gi + 1).flat()) {
          if (other.track !== e.track || Math.abs(other.ft - e.ft) > LINK_REACH_FT) continue;
          const key = `${gi}:${other.gi}`;
          if (linked.has(key)) continue;
          linked.add(key);
          const p = at(e.track, (e.ft + other.ft) / 2);
          const btn = button("link", { x: p.x, y: p.y + 24 }, "M -5 0 a 3 3 0 1 0 0 .1 M 5 0 a 3 3 0 1 0 0 .1 M -2 0 H 2", "Couple these together");
          // The couple step names the cars the loco's group reaches for.
          const withLoco = e.units.some(isLoco);
          const cars = withLoco && !other.units.some(isLoco) ? other.units : e.units;
          btn.addEventListener("click", () => addStep({ actor: "railroad", do: "couple", cars: [...cars], text: `Couple to ${cars.map((id) => unitName(plan, id)).join(", ")}` }, "couple"));
          g.appendChild(btn);
        }
      }
    });

    // Load and Unload over cars standing within a facility.
    for (const [fid, f] of computed.g.facilities) {
      const cars = [...computed.units.keys()].filter(
        (id) => !isLoco(id) && occupies(id).some((s) => s.track === f.track && Math.max(s.fromFt, s.toFt) > f.startFt && Math.min(s.fromFt, s.toFt) < f.endFt)
      );
      if (cars.length === 0) continue;
      const ordered = w.coupled.flat().filter((id) => cars.includes(id));
      const name = plan.facilities.find((x) => x.id === fid)?.name ?? fid;
      const centre = at(f.track, (f.startFt + f.endFt) / 2);
      for (const verb of ["load", "unload"] as const) {
        const btn = button(verb, { x: centre.x + (verb === "load" ? -14 : 14), y: centre.y - 52 }, verb === "load" ? "M 0 -5 V 5 M -4 1 L 0 5 L 4 1" : "M 0 5 V -5 M -4 -1 L 0 -5 L 4 -1", `${verb === "load" ? "Load" : "Unload"} the cars at ${name}`);
        btn.setAttribute("data-facility", fid);
        btn.addEventListener("click", () =>
          addStep({ actor: "customer", do: verb, cars: ordered, to: fid, text: `${verb === "load" ? "Load" : "Unload"} ${ordered.length} ${ordered.length === 1 ? "car" : "cars"} at ${name}` }, verb)
        );
        g.appendChild(btn);
      }
    }

    // Tabs at the edge for units off the drawing, so they can be dragged back in.
    const main = computed.drawing.tracks.find((t) => t.role === "main");
    const lo = main ? Math.min(...main.points.map((p) => p.xFt)) : 0;
    const hi = main ? Math.max(...main.points.map((p) => p.xFt)) : computed.drawing.widthFt;
    let row = 0;
    for (const [id, place] of Object.entries(w.places)) {
      if (!("offstage" in place)) continue;
      const side = computed.drawing.boundaries[place.offstage];
      const p = editor.svgPoint({ xFt: side === "left" ? lo : hi, lane: 0 });
      const x = p.x + (side === "left" ? -22 : 22);
      const tab = group("offstage-unit");
      tab.setAttribute("data-id", id);
      tab.setAttribute("transform", `translate(${num(x)} ${num(p.y - 30 - row * 22)})`);
      const box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("x", "-16");
      box.setAttribute("y", "-9");
      box.setAttribute("width", "32");
      box.setAttribute("height", "18");
      box.setAttribute("rx", "4");
      box.setAttribute("fill", isLoco(id) ? theme.loco : theme.steel);
      tab.appendChild(box);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("y", "4");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", theme.paper);
      label.textContent = id;
      tab.appendChild(label);
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${id} is off the drawing; drag it back in`;
      tab.appendChild(title);
      g.appendChild(tab);
      row += 1;
    }
    return g;
  }

  // ---- selection ----

  listen(editor.svg, "click", (e: MouseEvent) => {
    const id = unitIdAt(e.target);
    if (!id) return;
    const current = selectedUnits();
    if (e.shiftKey) {
      const ids = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      editor.select({ kind: "units", ids });
    } else if (!(current.length === 1 && current[0] === id)) {
      editor.select({ kind: "units", ids: [id] });
    }
  });

  // ---- drags ----

  listen(editor.svg, "pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return;
    const id = unitIdAt(e.target) ?? offstageIdAt(e.target);
    if (id) {
      if (e.shiftKey) return; // shift-click only changes the selection
      e.stopPropagation();
      let ids = selectedUnits();
      if (!ids.includes(id)) {
        ids = [id];
        editor.select({ kind: "units", ids });
      }
      beginUnitDrag(ids, id, editor.drawingAt(e));
      return;
    }
    if (e.shiftKey && (e.target === editor.svg || (e.target instanceof Element && e.target.classList.contains("background")))) {
      e.stopPropagation();
      e.preventDefault();
      const p = editor.drawingAt(e);
      drag = { kind: "marquee", from: p, to: p };
      paint();
    }
  });

  function beginUnitDrag(ids: Id[], grabbed: Id, at: DrawPoint): void {
    const { plan, computed } = editor.state();
    const w = world();
    const cut = planCut(w, ids);
    if (!cut) {
      editor.setStatus(NOT_A_RUN_TEXT);
      return;
    }
    const groupPath = pathOf(plan, computed, w, cut.movingUnits);
    if (!groupPath) return;
    drag = {
      kind: "units",
      start: { groupPath, grabbed, units: cut.movingUnits },
      uncouples: cut.uncouples,
      world: w,
      base: plan,
      computed,
      insertAt: insertAt(),
      samples: [at],
      commands: []
    };
    paint();
  }

  function commandsFor(d: Extract<Drag, { kind: "units" }>, result: DragResult): Command[] {
    const cmds: Command[] = [];
    let index = d.insertAt;
    const units = d.start.units;
    for (const [a, b] of d.uncouples) {
      cmds.push({ name: "addStep", index: index++, step: { actor: "railroad", do: "uncouple", between: [a, b], text: `Uncouple ${unitName(d.base, a)} from ${unitName(d.base, b)}` } });
    }
    for (const leg of result.legs) {
      const verb = verbFor(d.computed, units, leg.lead);
      const step: StepInput = {
        actor: "railroad",
        do: verb === "run_light" ? "run_light" : verb === "pull" ? "pull" : "shove",
        cars: [...units],
        stop: leg.stop,
        text: autoCaption(d.base, d.world, units, leg, verb)
      };
      if (leg.via.length > 0) (step as RailroadStep).via = [...leg.via];
      const to = leg.to ?? ("track" in leg.stop ? leg.stop.track : undefined);
      if (to !== undefined) (step as RailroadStep).to = to;
      if (leg.spot !== undefined) (step as RailroadStep).spot = leg.spot;
      cmds.push({ name: "addStep", index: index++, step });
    }
    return cmds;
  }

  listen(document, "pointermove", (e: PointerEvent) => {
    if (!drag) return;
    const p = editor.drawingAt(e);
    if (drag.kind === "marquee") {
      drag.to = p;
      paint();
      return;
    }
    drag.samples.push(p);
    const result = followDrag(drag.computed.drawing, drag.computed.g, drag.start, drag.samples);
    // A wobble that goes nowhere is a click: no legs means no steps, uncouples included.
    const commands = result && result.legs.length > 0 ? commandsFor(drag, result) : [];
    drag.commands = commands;
    if (commands.length === 0) {
      editor.preview(undefined);
      return;
    }
    const scratch = applyCommands(drag.base, commands).plan;
    editor.preview(scratch, drag.insertAt + commands.length);
  });

  listen(document, "pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = undefined;
    if (d.kind === "marquee") {
      const { computed } = editor.state();
      const sprites = placeUnits(computed.drawing, computed.g, world(), computed.units);
      const a = editor.svgPoint(d.from);
      const b = editor.svgPoint(d.to);
      const within = (p: { x: number; y: number }): boolean => p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
      const order = world().coupled.flat();
      const ids = sprites
        .filter((s) => within(editor.svgPoint(s.centre)))
        .map((s) => s.id)
        .sort((a, b) => order.indexOf(a) - order.indexOf(b));
      editor.select(ids.length > 0 ? { kind: "units", ids } : { kind: "none" });
      paint();
      return;
    }
    editor.preview(undefined);
    if (d.commands.length === 0) {
      paint();
      return;
    }
    const r = editor.dispatch(d.commands, "move");
    const last = r.created[r.created.length - 1];
    if (last) editor.select({ kind: "step", id: last });
  });

  listen(document, "keydown", (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !drag) return;
    drag = undefined;
    editor.preview(undefined);
    paint();
  });

  // ---- Stop and Note ----

  detach.push(
    editor.registerTool("stop", () => addStep({ actor: "railroad", do: "stop", text: STOP_CALLOUT_TEXT, callout: { text: STOP_CALLOUT_TEXT } }, "stop")),
    editor.registerTool("note", () => addStep({ do: "note", text: NOTE_TEXT }, "note"))
  );

  paint();
  return () => detach.forEach((d) => d());
}

// ---- helpers ----

/** The moving run's path, rear to head: its units' places joined, or a stretch just off the edge for an offstage run. */
function pathOf(plan: PlanReading, computed: Computed, w: WorldState, units: Id[]): Segment[] | undefined {
  const segments = units.flatMap((id) => {
    const p = w.places[id];
    return p && "occupies" in p ? p.occupies : [];
  });
  if (segments.length > 0) return cleanPath(segments);
  const first = w.places[units[0]!];
  if (!first || !("offstage" in first)) return undefined;
  const len = units.reduce((sum, id) => sum + (computed.units.get(id)?.lengthFt ?? 0), 0);
  const main = plan.arrival.on;
  const total = computed.g.tracks.get(main)?.totalFt ?? computed.drawing.widthFt;
  return first.offstage === "arrival_end" ? [{ track: main, fromFt: -len, toFt: 0 }] : [{ track: main, fromFt: total, toFt: total + len }];
}

/** A loco alone runs light; power at the trailing end shoves; power at the leading end pulls; no power is a move. */
function verbFor(computed: Computed, units: Id[], lead: "high" | "low"): CaptionVerb {
  const isLoco = (id: Id): boolean => computed.units.get(id)?.kind === "loco";
  if (units.every(isLoco)) return "run_light";
  const leading = lead === "high" ? units[units.length - 1]! : units[0]!;
  const trailing = lead === "high" ? units[0]! : units[units.length - 1]!;
  if (isLoco(trailing)) return "shove";
  if (isLoco(leading)) return "pull";
  return "move";
}

/** "ABCX 1003" when the car has a mark and number, else its id. */
function unitName(plan: PlanReading, id: Id): string {
  for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    const car = cut.list?.find((c) => c.id === id);
    if (car) return [car.mark, car.number].filter((v) => v !== undefined && v !== "").join(" ") || id;
  }
  return id;
}

function unitIdAt(target: EventTarget | null): Id | undefined {
  return ancestorWithClass(target, "unit")?.getAttribute("data-id") ?? undefined;
}

function offstageIdAt(target: EventTarget | null): Id | undefined {
  return ancestorWithClass(target, "offstage-unit")?.getAttribute("data-id") ?? undefined;
}

function ancestorWithClass(target: EventTarget | null, cls: string): Element | undefined {
  let node: Element | null = target instanceof Element ? target : null;
  while (node) {
    if (node.classList.contains(cls)) return node;
    node = node.parentElement;
  }
  return undefined;
}

function group(cls: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", cls);
  return g;
}

function button(cls: string, p: { x: number; y: number }, iconPath: string, tip: string): SVGGElement {
  const g = group(`train-button ${cls}`);
  g.setAttribute("transform", `translate(${num(p.x)} ${num(p.y)})`);
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("r", String(BUTTON_R));
  c.setAttribute("fill", theme.ink);
  c.setAttribute("stroke", theme.gold);
  c.setAttribute("stroke-width", "1.2");
  g.appendChild(c);
  const icon = document.createElementNS(SVG_NS, "path");
  icon.setAttribute("d", iconPath);
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", theme.gold);
  icon.setAttribute("stroke-width", "1.6");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("pointer-events", "none");
  g.appendChild(icon);
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = tip;
  g.appendChild(title);
  return g;
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}
