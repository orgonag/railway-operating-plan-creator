/**
 * Track building on the canvas: drag Turnout or Track end from the toolbar
 * onto a track, stretch a branch by its end handle, click a track or a switch
 * to select it, right-click a track for its menu.
 *
 * Every drag shows a preview and commits one history entry on release; Esc
 * puts the picture back. Handles live in the editor's overlay layer and are
 * repainted after every draw.
 */

import { applyCommand, type Command } from "../core/commands/commands";
import { newId } from "../core/commands/ids";
import { ftAtX, guessTurnout, nearestTrackPos, roundFt, type TrackHit } from "../core/editing/hit";
import { CLEAR_FT, SPOT_LENGTH_FT } from "../core/engine/graph";
import { pointAt, type DrawPoint, type Drawing } from "../core/layout/layout";
import type { FacilityInfo } from "../core/engine/graph";
import type { Id, PlanReading, TrackRole } from "../core/schema/types";
import { SVG_NS } from "../render/silhouettes";
import { theme } from "../render/theme";
import { closeContextMenu, openContextMenu } from "./contextMenu";
import type { Editor } from "./editor";

export const MIN_BRANCH_FT = 60;
export const MAIN_CONTINUES_TEXT = "The main line continues off the drawing";
export const FIRST_TURNOUT_TEXT = "The first turnout sits where the arriving train clears it; drop this one further along.";
const HANDLE_R = 7;

export const DEFAULT_FACILITY_FT = 300;
export const MIN_FACILITY_FT = 60;

type Drag =
  | { kind: "tool"; tool: "turnout" | "track-end" | "facility"; path: DrawPoint[]; hit: TrackHit | null }
  | { kind: "stretch"; track: Id; name: string; base: PlanReading; drawing: Drawing; lengthFt: number; at: DrawPoint }
  | { kind: "resize"; facility: Id; end: "start" | "end"; name: string; base: PlanReading; drawing: Drawing; baseInfo: FacilityInfo; startFt: number; lengthFt: number; at: DrawPoint };

/** "420 ft, 7 cars": the length and how many 60 ft cars it holds. */
export function facilityLabel(lengthFt: number): string {
  return `${lengthFt} ft, ${Math.floor(lengthFt / SPOT_LENGTH_FT)} cars`;
}

export function attachTrackTools(editor: Editor): () => void {
  const detach: Array<() => void> = [];
  let drag: Drag | undefined;

  function listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): void;
  function listen<K extends keyof HTMLElementEventMap>(target: HTMLElement | SVGElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void;
  function listen(target: EventTarget, type: string, fn: (e: never) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, options);
    detach.push(() => target.removeEventListener(type, fn as EventListener, options));
  }

  // ---- overlay painting ----

  function paint(): void {
    const over = editor.overlay();
    over.querySelector("g.track-tools")?.remove();
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "track-tools");
    const { plan, computed } = editor.state();
    const main = plan.arrival.on;
    for (const t of computed.drawing.tracks) {
      if (t.id === main) continue;
      const end = t.points[t.points.length - 1];
      if (!end) continue;
      const p = editor.svgPoint(end);
      const c = circle(p, HANDLE_R, "track-end-handle");
      c.setAttribute("data-track", t.id);
      const name = plan.tracks.find((x) => x.id === t.id)?.name ?? t.id;
      c.appendChild(title(`Drag to stretch ${name}`));
      g.appendChild(c);
    }
    for (const s of computed.g.switches.values()) {
      const p = editor.svgPoint(pointAt(computed.drawing, computed.g, { track: s.on, ft: s.atFt }).at);
      const c = circle(p, HANDLE_R - 2, "switch-handle");
      c.setAttribute("data-switch", s.id);
      if (editor.state().selection.kind === "switch" && (editor.state().selection as { id: Id }).id === s.id) c.classList.add("selected");
      c.appendChild(title(`Turnout ${s.id}`));
      g.appendChild(c);
    }
    for (const [id, f] of computed.g.facilities) {
      const name = plan.facilities.find((x) => x.id === id)?.name ?? id;
      for (const end of ["start", "end"] as const) {
        const p = editor.svgPoint(pointAt(computed.drawing, computed.g, { track: f.track, ft: end === "start" ? f.startFt : f.endFt }).at);
        const c = circle(p, HANDLE_R, "facility-handle");
        c.setAttribute("data-facility", id);
        c.setAttribute("data-end", end);
        c.appendChild(title(`Drag to size ${name}`));
        g.appendChild(c);
      }
    }
    if (drag?.kind === "tool" && drag.hit) {
      const p = editor.svgPoint(drag.hit.at);
      const ghost = document.createElementNS(SVG_NS, "g");
      ghost.setAttribute("class", `ghost ghost-${drag.tool}`);
      ghost.setAttribute("transform", `translate(${num(p.x)} ${num(p.y)})`);
      const mark = document.createElementNS(SVG_NS, "path");
      const half = (DEFAULT_FACILITY_FT / 2) * editor.view().pxPerFt;
      mark.setAttribute(
        "d",
        drag.tool === "turnout" ? "M -30 0 H 30 M 0 0 L 40 -24" : drag.tool === "track-end" ? "M 0 -12 V 12 M 6 -8 V 8" : `M ${num(-half)} -40 H ${num(half)} V 12 H ${num(-half)} Z`
      );
      mark.setAttribute("fill", "none");
      mark.setAttribute("stroke", theme.gold);
      mark.setAttribute("stroke-width", drag.tool === "facility" ? "1.5" : "3");
      if (drag.tool === "facility") mark.setAttribute("stroke-dasharray", "6 4");
      mark.setAttribute("stroke-linecap", "round");
      ghost.appendChild(mark);
      g.appendChild(ghost);
    }
    if (drag?.kind === "stretch") g.appendChild(dragLabel(editor.svgPoint(drag.at), `${drag.lengthFt} ft`));
    if (drag?.kind === "resize") g.appendChild(dragLabel(editor.svgPoint(drag.at), facilityLabel(drag.lengthFt)));
    over.appendChild(g);
  }
  detach.push(editor.onDraw(paint));

  // ---- toolbar drags: Turnout and Track end ----

  for (const tool of ["turnout", "track-end", "facility"] as const) {
    listen(editor.toolbar.button(tool), "pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { kind: "tool", tool, path: [], hit: null };
    });
  }

  function dropTool(d: Extract<Drag, { kind: "tool" }>): void {
    const hit = d.hit;
    if (!hit) return;
    const { plan, computed } = editor.state();
    if (d.tool === "track-end") {
      if (hit.track === plan.arrival.on) editor.setStatus(MAIN_CONTINUES_TEXT);
      else editor.dispatch({ name: "setTrack", trackId: hit.track, end: "buffer_stop" }, "track end");
      return;
    }
    if (d.tool === "facility") {
      const id = newId(plan, "F");
      const r = editor.dispatch(
        {
          name: "addFacility",
          trackId: hit.track,
          startFt: Math.max(0, hit.ft - DEFAULT_FACILITY_FT / 2),
          lengthFt: DEFAULT_FACILITY_FT,
          label: `Facility ${id.replace(/^F/, "")}`,
          kind: "other",
          facilityId: id
        },
        "add facility"
      );
      if (r.created[0]) editor.select({ kind: "facility", id: r.created[0] });
      return;
    }
    // The schema's distanceFt is the gap from the previous switch on the track (or from the clear point on a branch).
    // A drop between two switches takes its place in order; the next switch keeps its position by taking the rest of the gap.
    const onTrack = [...computed.g.switches.values()].filter((s) => s.on === hit.track).sort((a, b) => a.atFt - b.atFt);
    const before = onTrack.filter((s) => s.atFt < hit.ft);
    const next = onTrack.find((s) => s.atFt >= hit.ft);
    if (hit.track === plan.arrival.on && onTrack.length > 0 && before.length === 0) {
      editor.setStatus(FIRST_TURNOUT_TEXT);
      return;
    }
    const previous = before[before.length - 1];
    const from = previous ? previous.atFt : hit.track === plan.arrival.on ? 0 : CLEAR_FT;
    const distanceFt = Math.max(10, roundFt(hit.ft - from));
    const guess = guessTurnout(computed.drawing, hit, d.path);
    const cmds: Command[] = [{ name: "addTurnout", trackId: hit.track, distanceFt, side: guess.side, approach: guess.approach }];
    if (next) {
      const orderOf = (id: Id): number => plan.switches.find((s) => s.id === id)?.order ?? 0;
      (cmds[0] as Extract<Command, { name: "addTurnout" }>).order = before.reduce((max, s) => Math.max(max, orderOf(s.id)), 0) + 1;
      cmds.push({ name: "setSwitchDistance", switchId: next.id, distanceFt: Math.max(10, roundFt(next.atFt - hit.ft)) });
    }
    const r = editor.dispatch(cmds, "add turnout");
    const switchId = r.created.find((id) => r.plan.switches.some((s) => s.id === id));
    if (switchId) editor.select({ kind: "switch", id: switchId });
  }

  // ---- stretch a branch by its end handle ----

  listen(editor.svg, "pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (!(target instanceof Element)) return;
    const plan = editor.history.plan;
    if (target.classList.contains("track-end-handle")) {
      const trackId = target.getAttribute("data-track");
      const t = plan.tracks.find((x) => x.id === trackId);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      // Measured against the drawing as it was when the drag began: the preview redraws and a mirrored main grows with the branch.
      drag = { kind: "stretch", track: t.id, name: t.name ?? t.id, base: plan, drawing: editor.state().computed.drawing, lengthFt: t.lengthFt ?? 400, at: editor.drawingAt(e) };
    } else if (target.classList.contains("facility-handle")) {
      const id = target.getAttribute("data-facility");
      const end = target.getAttribute("data-end") === "start" ? "start" : "end";
      const f = plan.facilities.find((x) => x.id === id);
      const info = f && editor.state().computed.g.facilities.get(f.id);
      if (!f || !info) return;
      e.preventDefault();
      e.stopPropagation();
      drag = {
        kind: "resize",
        facility: f.id,
        end,
        name: f.name,
        base: plan,
        drawing: editor.state().computed.drawing,
        baseInfo: info,
        startFt: info.startFt,
        lengthFt: info.endFt - info.startFt,
        at: editor.drawingAt(e)
      };
    }
  });

  function resizeTo(d: Extract<Drag, { kind: "resize" }>, p: DrawPoint): void {
    const info = d.baseInfo;
    const baseInfo = d.baseInfo;
    const ft = ftAtX(d.drawing, info.track, p.xFt);
    if (ft === undefined) return;
    if (d.end === "end") {
      d.startFt = baseInfo.startFt;
      d.lengthFt = Math.max(MIN_FACILITY_FT, roundFt(ft) - d.startFt);
    } else {
      const endFt = baseInfo.endFt;
      d.startFt = Math.max(0, Math.min(roundFt(ft), endFt - MIN_FACILITY_FT));
      d.lengthFt = endFt - d.startFt;
    }
    const scratch = applyCommand(d.base, { name: "setFacility", facilityId: d.facility, startFt: d.startFt, lengthFt: d.lengthFt }).plan;
    editor.preview(scratch);
    const after = editor.state().computed;
    d.at = pointAt(after.drawing, after.g, { track: info.track, ft: d.end === "end" ? d.startFt + d.lengthFt : d.startFt }).at;
    paint();
  }

  function stretchTo(d: Extract<Drag, { kind: "stretch" }>, p: DrawPoint): void {
    const ft = ftAtX(d.drawing, d.track, p.xFt);
    if (ft === undefined) return;
    const lengthFt = Math.max(MIN_BRANCH_FT, roundFt(ft - CLEAR_FT));
    d.lengthFt = lengthFt;
    const scratch = applyCommand(d.base, { name: "setTrack", trackId: d.track, lengthFt }).plan;
    editor.preview(scratch);
    const after = editor.state().computed;
    const end = after.drawing.tracks.find((t) => t.id === d.track)?.points.slice(-1)[0];
    d.at = end ?? p;
    paint();
  }

  // ---- shared pointer handling ----

  listen(document, "pointermove", (e: PointerEvent) => {
    if (!drag) return;
    const p = editor.drawingAt(e);
    if (drag.kind === "tool") {
      const { computed } = editor.state();
      drag.path.push(p);
      drag.hit = nearestTrackPos(computed.drawing, computed.g, p);
      paint();
    } else if (drag.kind === "stretch") stretchTo(drag, p);
    else resizeTo(drag, p);
  });

  listen(document, "pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = undefined;
    if (d.kind === "tool") {
      paint();
      dropTool(d);
      return;
    }
    editor.preview(undefined);
    if (d.kind === "stretch") {
      if (d.lengthFt !== (d.base.tracks.find((t) => t.id === d.track)?.lengthFt ?? 400)) {
        editor.dispatch({ name: "setTrack", trackId: d.track, lengthFt: d.lengthFt }, `stretch ${d.name}`);
      }
    } else {
      const info = d.baseInfo;
      if (info.startFt !== d.startFt || info.endFt - info.startFt !== d.lengthFt) {
        editor.dispatch({ name: "setFacility", facilityId: d.facility, startFt: d.startFt, lengthFt: d.lengthFt }, `resize ${d.name}`);
      }
    }
    paint();
  });

  listen(document, "keydown", (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !drag) return;
    drag = undefined;
    editor.preview(undefined);
    paint();
  });

  // ---- select and right-click ----

  listen(editor.svg, "click", (e: MouseEvent) => {
    const track = trackIdAt(e.target);
    if (track) {
      editor.select({ kind: "track", id: track });
      return;
    }
    const target = e.target as Element;
    if (target instanceof Element && target.classList.contains("switch-handle")) {
      const id = target.getAttribute("data-switch");
      if (id) editor.select({ kind: "switch", id });
      return;
    }
    const facility = ancestorWithClass(e.target, "facility-group")?.getAttribute("data-id");
    if (facility) editor.select({ kind: "facility", id: facility });
  });

  listen(editor.svg, "contextmenu", (e: MouseEvent) => {
    const trackId = trackIdAt(e.target);
    if (!trackId) return;
    e.preventDefault();
    editor.select({ kind: "track", id: trackId });
    const setRole = (role: TrackRole) => (): void => {
      editor.dispatch({ name: "setTrack", trackId, role }, "track role");
    };
    openContextMenu(editor.root, { x: e.clientX, y: e.clientY }, [
      {
        action: "rename",
        label: "Rename",
        onPick: () => {
          const t = editor.history.plan.tracks.find((x) => x.id === trackId);
          const name = ask("Track name", t?.name ?? "");
          if (name !== null) editor.dispatch({ name: "setTrack", trackId, label: name }, "track name");
        }
      },
      { action: "main", label: "Main", onPick: setRole("main") },
      { action: "siding", label: "Siding", onPick: setRole("siding") },
      { action: "spur", label: "Spur", onPick: setRole("spur") },
      {
        action: "length",
        label: "Set length",
        onPick: () => {
          const t = editor.history.plan.tracks.find((x) => x.id === trackId);
          const answer = ask("Usable length in feet", String(t?.lengthFt ?? 400));
          if (answer === null) return;
          const n = Number(answer);
          if (!Number.isFinite(n)) return;
          editor.dispatch({ name: "setTrack", trackId, lengthFt: Math.max(MIN_BRANCH_FT, roundFt(n)) }, "track length");
        }
      },
      {
        action: "delete",
        label: "Delete",
        onPick: () => {
          editor.select({ kind: "track", id: trackId });
          editor.deleteSelection();
        }
      }
    ]);
  });

  detach.push(closeContextMenu);
  paint();
  return () => detach.forEach((d) => d());
}

// ---- helpers ----

function ask(message: string, current: string): string | null {
  if (typeof window.prompt !== "function") return null;
  return window.prompt(message, current);
}

function trackIdAt(target: EventTarget | null): Id | undefined {
  const path = ancestorWithClass(target, "track");
  return path?.getAttribute("data-id") ?? undefined;
}

function ancestorWithClass(target: EventTarget | null, cls: string): Element | undefined {
  let node: Element | null = target instanceof Element ? target : null;
  while (node) {
    if (node.classList.contains(cls)) return node;
    node = node.parentElement;
  }
  return undefined;
}

function circle(p: { x: number; y: number }, r: number, cls: string): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("class", cls);
  c.setAttribute("cx", num(p.x));
  c.setAttribute("cy", num(p.y));
  c.setAttribute("r", String(r));
  return c;
}

function title(text: string): SVGTitleElement {
  const t = document.createElementNS(SVG_NS, "title");
  t.textContent = text;
  return t;
}

export function dragLabel(p: { x: number; y: number }, text: string): SVGTextElement {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("class", "drag-label");
  t.setAttribute("x", num(p.x));
  t.setAttribute("y", num(p.y - 18));
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("fill", theme.paper);
  t.textContent = text;
  return t;
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}
