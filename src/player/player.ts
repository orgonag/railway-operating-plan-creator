/**
 * Player: plays a plan step by step in one SVG, with a caption, controls,
 * one dot per step and the notes for the current step.
 *
 * Plain DOM, no framework. The player runs the core once (graph, simulation,
 * notes, layout) and reads only that output. Each step is animated over
 * STEP_MS with `ease`, re-placing the sprites from `interpolate` on every
 * frame; the drawing itself is rendered once per size. Every piece of user
 * text goes in with textContent.
 */

import type { PlanReading } from "../core/schema/types";
import { unitsOf } from "../core/engine/materialize";
import { buildGraph } from "../core/engine/graph";
import { simulate } from "../core/engine/simulate";
import { notesFor, type Note } from "../core/engine/notes";
import type { StepResult, WorldState } from "../core/engine/state";
import { layout } from "../core/layout/layout";
import { placeUnits } from "../core/layout/place";
import { fitPxPerFt, renderDrawing, renderOptions, renderSprites, type RenderOptions } from "../render/render";
import { ease, interpolate } from "./interpolate";

export interface Player {
  /** Show a step by its 0-based index, animated from the state before it. */
  show(step: number): void;
  play(): void;
  pause(): void;
  destroy(): void;
}

export const STEP_MS = 1500;
/** Used when the mount has no measurable width yet (a hidden or detached node). */
const FALLBACK_WIDTH_PX = 960;

export function createPlayer(root: HTMLElement, plan: PlanReading): Player {
  const g = buildGraph(plan);
  const sim = simulate(plan, g);
  const notes = notesFor(sim, plan, g);
  const drawing = layout(plan, g);
  const units = new Map(unitsOf(plan).map((u) => [u.id, u]));
  const total = sim.steps.length;

  // ---- DOM ----
  const box = div("player");
  const stage = div("stage");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "plan");
  stage.appendChild(svg);

  const caption = div("caption");
  const count = document.createElement("span");
  count.className = "step-count";
  const text = document.createElement("p");
  text.className = "step-text";
  caption.append(count, text);

  const controls = div("controls");
  const prev = button("prev", "Prev");
  const playPause = button("play", "Play");
  const next = button("next", "Next");
  const dots = div("dots");
  const dotButtons: HTMLButtonElement[] = [];
  sim.steps.forEach((step, i) => {
    const dot = button("dot", "");
    dot.setAttribute("aria-label", `Step ${i + 1}`);
    dot.title = `Step ${i + 1}: ${verbLabel(step.verb)}`;
    dot.addEventListener("click", () => {
      pause();
      show(i);
    });
    dotButtons.push(dot);
    dots.appendChild(dot);
  });
  controls.append(prev, playPause, next, dots);

  const notesList = document.createElement("ul");
  notesList.className = "notes";

  box.append(stage, caption, controls, notesList);
  root.appendChild(box);

  // ---- state ----
  let o: RenderOptions = renderOptions({ pxPerFt: 1 });
  let current = 0;
  let playing = false;
  let frame: number | undefined;
  let shown: WorldState = sim.initial;

  function spriteLayer(): SVGGElement {
    const layer = svg.querySelector("g.sprites");
    if (!layer) throw new Error("the drawing has no sprite layer");
    return layer as SVGGElement;
  }

  function draw(): void {
    const width = root.clientWidth > 0 ? root.clientWidth : FALLBACK_WIDTH_PX;
    o = renderOptions({ pxPerFt: fitPxPerFt(drawing, width) });
    renderDrawing(svg, drawing, o);
    svg.style.width = "100%";
    svg.style.height = "auto";
  }

  function paint(state: WorldState, status: StepResult["status"]): void {
    shown = state;
    renderSprites(spriteLayer(), placeUnits(drawing, g, state, units), o, status);
  }

  function stopAnimation(): void {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  }

  function describe(i: number): void {
    const step = sim.steps[i]!;
    count.textContent = `Step ${i + 1} / ${total}`;
    text.textContent = captionFor(plan, step);
    dotButtons.forEach((dot, n) => dot.classList.toggle("current", n === i));
    prev.disabled = i === 0;
    next.disabled = i >= total - 1;
    clear(notesList);
    for (const note of notes.filter((n) => n.stepId === step.stepId)) notesList.appendChild(noteItem(note));
  }

  function show(step: number): void {
    if (total === 0) return;
    const i = Math.min(total - 1, Math.max(0, Math.floor(step)));
    stopAnimation();
    current = i;
    describe(i);
    const before = i === 0 ? sim.initial : sim.states[i - 1]!;
    const after = sim.states[i]!;
    const result = sim.steps[i]!;
    paint(interpolate(before, after, result, 0), result.status);
    const moves = result.moved.length > 0 && result.travel !== null && result.travel.length > 0;
    const started = now();
    const tick = (): void => {
      const t = Math.min(1, (now() - started) / STEP_MS);
      if (moves) paint(interpolate(before, after, result, ease(t)), result.status);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      frame = undefined;
      if (!moves) paint(after, result.status);
      if (playing) {
        if (current < total - 1) show(current + 1);
        else pause();
      }
    };
    frame = requestAnimationFrame(tick);
  }

  function play(): void {
    if (playing) return;
    playing = true;
    playPause.textContent = "Pause";
    if (frame === undefined) show(current < total - 1 ? current + 1 : 0);
  }

  function pause(): void {
    playing = false;
    playPause.textContent = "Play";
  }

  function onResize(): void {
    draw();
    paint(shown, sim.steps[current]?.status ?? "ok");
  }

  prev.addEventListener("click", () => {
    pause();
    show(current - 1);
  });
  next.addEventListener("click", () => {
    pause();
    show(current + 1);
  });
  playPause.addEventListener("click", () => (playing ? pause() : play()));
  window.addEventListener("resize", onResize);

  function destroy(): void {
    pause();
    stopAnimation();
    window.removeEventListener("resize", onResize);
    box.remove();
  }

  draw();
  show(0);
  return { show, play, pause, destroy };
}

/** The step's authored text, or its verb as plain words when the text is empty. */
export function captionFor(plan: PlanReading, step: StepResult): string {
  let authored: string | undefined;
  if (step.stepId === "arrival") authored = plan.arrival.text;
  else if (step.stepId === "departure") authored = plan.departure.text;
  else authored = plan.work.find((w) => w.id === step.stepId)?.text;
  const trimmed = authored?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : verbLabel(step.verb);
}

/** "run_light" reads "Run light". */
export function verbLabel(verb: string): string {
  const words = verb.replace(/_/g, " ").trim();
  if (words.length === 0) return "Step";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function noteItem(note: Note): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `note ${note.level}`;
  li.dataset.kind = note.kind;
  li.dataset.level = note.level;
  const level = document.createElement("span");
  level.className = "note-level";
  level.textContent = note.level === "heads_up" ? "Heads up" : "Info";
  const body = document.createElement("span");
  body.className = "note-text";
  body.textContent = note.text;
  li.append(level, body);
  return li;
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

function button(cls: string, label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  return b;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
