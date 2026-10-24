// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from "vitest";

import { buildGraph } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import type { DrawPoint } from "../../src/core/layout/layout";
import type { RailroadStep } from "../../src/core/schema/types";
import { createEditor, type Editor } from "../../src/editor/editor";
import { loadPlan, savePlan } from "../../src/editor/store/storage";
import { templateById } from "../../src/editor/templates";

let mount: HTMLElement;
let editor: Editor | undefined;

beforeEach(() => {
  localStorage.clear();
  mount = document.createElement("div");
  document.body.appendChild(mount);
});

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  mount.remove();
});

function open(): Editor {
  editor = createEditor(mount, { plan: templateById("demo").make() });
  return editor;
}

const TRAIN = ["L1", "C5", "C4", "C3", "C2", "C1"];

function unit(e: Editor, id: string): SVGGElement {
  const g = e.svg.querySelector<SVGGElement>(`g.sprites g.unit[data-id="${id}"]`);
  if (!g) throw new Error(`no sprite for ${id}`);
  return g;
}

function pointer(target: EventTarget, type: string, e: Editor, p: DrawPoint, init: MouseEventInit = {}): void {
  const c = e.clientPoint(p);
  target.dispatchEvent(new MouseEvent(type, { clientX: c.clientX, clientY: c.clientY, bubbles: true, button: 0, ...init }));
}

function key(k: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
}

/** Grab a unit at a drawing point and drag through the given points, releasing at the last. */
function drag(e: Editor, id: string, from: DrawPoint, ...through: DrawPoint[]): void {
  pointer(unit(e, id), "pointerdown", e, from);
  for (const p of through) pointer(document, "pointermove", e, p);
  pointer(document, "pointerup", e, through[through.length - 1] ?? from);
}

function work(e: Editor): RailroadStep[] {
  return e.history.plan.work as RailroadStep[];
}

test("dragging the arrived train 300 ft along the main adds one step whose stop is MAIN ft 780 lead", () => {
  const e = open();
  e.select({ kind: "units", ids: TRAIN });
  drag(e, "C1", { xFt: 450, lane: 0 }, { xFt: 600, lane: 0 }, { xFt: 750, lane: 0 });
  const step = work(e)[0]!;
  expect(step).toMatchObject({ actor: "railroad", do: "shove", cars: TRAIN, to: "MAIN", via: ["S1"], stop: { track: "MAIN", ft: 780, end: "lead" }, text: "Shove 5 loads to Main line" });
  expect(work(e)).toHaveLength(8);
  expect(e.history.entries().map((x) => x.label)).toEqual(["move"]);
  expect(e.state().stepIndex).toBe(1);
  expect(e.state().selection).toEqual({ kind: "step", id: step.id });
  expect(e.state().computed.sim.steps[1]!.status).toBe("ok");
  expect(e.state().computed.sim.states[1]!.places["C1"]).toEqual({ occupies: [{ track: "MAIN", fromFt: 720, toFt: 780 }] });
});

test("a drag inserts after the step on show; on the departure it inserts before it", () => {
  const e = open();
  e.showStep(8); // the departure: the train is off the arrival end, shown as tabs at the edge
  const tab = e.svg.querySelector<SVGGElement>('g.overlay g.offstage-unit[data-id="C1"]')!;
  pointer(tab, "pointerdown", e, { xFt: -20, lane: 0 });
  pointer(document, "pointermove", e, { xFt: 10, lane: 0 });
  pointer(document, "pointermove", e, { xFt: 300, lane: 0 });
  pointer(document, "pointerup", e, { xFt: 300, lane: 0 });
  expect(work(e)).toHaveLength(8);
  expect(work(e)[7]).toMatchObject({ do: "shove", cars: TRAIN, stop: { track: "MAIN", ft: 290, end: "lead" } });
  expect(e.state().stepIndex).toBe(8);
});

test("one drag that needs a cut and reverses makes three steps and one history entry", () => {
  const e = open();
  const before = JSON.stringify(e.history.plan);
  e.select({ kind: "units", ids: ["C1", "C2"] });
  drag(e, "C1", { xFt: 450, lane: 0 }, { xFt: 600, lane: 0 }, { xFt: 750, lane: 0 }, { xFt: 650, lane: 0 }, { xFt: 550, lane: 0 });
  const steps = work(e).slice(0, 3);
  expect(steps.map((s) => s.do)).toEqual(["uncouple", "shove", "shove"]);
  expect(steps[0]!.between).toEqual(["C3", "C2"]);
  expect(steps[1]).toMatchObject({ cars: ["C2", "C1"], stop: { track: "MAIN", ft: 780, end: "lead" } });
  expect(steps[2]).toMatchObject({ cars: ["C2", "C1"], stop: { track: "MAIN", ft: 460, end: "lead" } });
  expect(e.history.entries()).toHaveLength(1);
  expect(e.state().stepIndex).toBe(3);
  expect(e.history.undo()).toBe(true);
  expect(JSON.stringify(e.history.plan)).toBe(before);
});

test("a middle car moved out survives undo, redo and reopen", () => {
  const e = open();
  e.select({ kind: "units", ids: ["C3"] });
  drag(e, "C3", { xFt: 330, lane: 0 }, { xFt: 430, lane: 0 }, { xFt: 530, lane: 0 });
  const steps = work(e).slice(0, 3);
  expect(steps.map((s) => s.do)).toEqual(["uncouple", "uncouple", "shove"]);
  expect(steps[0]!.between).toEqual(["C4", "C3"]);
  expect(steps[1]!.between).toEqual(["C3", "C2"]);
  expect(steps[2]).toMatchObject({ cars: ["C3"], stop: { track: "MAIN", ft: 560, end: "lead" } });
  const after = e.state().computed.sim.states[3]!;
  e.history.undo();
  expect(e.history.plan.work).toHaveLength(7);
  e.history.redo();
  expect(e.state().computed.sim.states[3]).toEqual(after);
  savePlan("x", e.history.plan);
  const reopened = loadPlan("x")!;
  const sim = simulate(reopened, buildGraph(reopened));
  expect(sim.states[3]!.places).toEqual(after.places);
  expect(sim.states[3]!.coupled).toEqual(after.coupled);
  expect(sim.states[3]!.coupled).toEqual([["L1", "C5", "C4"], ["C3"], ["C2", "C1"]]);
  expect(reopened.consist.cuts[0]!.list!.map((c) => c.id)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
});

test("a selection that is not a contiguous run does not drag and says why", () => {
  const e = open();
  e.select({ kind: "units", ids: ["C1", "C3"] });
  drag(e, "C1", { xFt: 450, lane: 0 }, { xFt: 750, lane: 0 });
  expect(e.history.canUndo).toBe(false);
  expect(mount.querySelector(".status .message")?.textContent).toBe("Select cars that are coupled together in a row.");
});

test("scissors between C3 and C4 adds an uncouple step with between [C4, C3] in rising-ft order", () => {
  const e = open();
  const scissors = e.svg.querySelector<SVGGElement>('g.overlay g.train-buttons g.scissors[data-a="C4"][data-b="C3"]');
  expect(scissors).not.toBeNull();
  expect(e.svg.querySelectorAll("g.train-buttons g.scissors")).toHaveLength(5);
  scissors!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(work(e)[0]).toMatchObject({ actor: "railroad", do: "uncouple", between: ["C4", "C3"] });
  expect(e.state().selection).toEqual({ kind: "step", id: work(e)[0]!.id });
  expect(e.state().computed.sim.states[1]!.coupled).toEqual([["L1", "C5", "C4"], ["C3", "C2", "C1"]]);
});

test("link couples two groups standing within reach", () => {
  const e = open();
  e.showStep(5); // the loco has run back to the cars and stands against them
  const link = e.svg.querySelector<SVGGElement>("g.overlay g.train-buttons g.link");
  expect(link).not.toBeNull();
  link!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(work(e)[5]).toMatchObject({ actor: "railroad", do: "couple" });
  expect(e.state().computed.sim.steps[6]!.status).toBe("ok");
  expect(e.state().computed.sim.states[6]!.coupled).toEqual([TRAIN]);
});

test("Unload over cars at RACKS adds a customer unload step naming those cars", () => {
  const e = open();
  e.showStep(1);
  const unload = e.svg.querySelector<SVGGElement>('g.overlay g.train-buttons g.unload[data-facility="RACKS"]');
  expect(unload).not.toBeNull();
  unload!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(work(e)[1]).toMatchObject({ actor: "customer", do: "unload", cars: ["C5", "C4", "C3", "C2", "C1"], to: "RACKS" });
  expect(e.state().computed.sim.states[2]!.loaded["C1"]).toBe(false);
  e.showStep(0);
  expect(e.svg.querySelector("g.train-buttons g.unload")).toBeNull();
});

test("Stop and Note add a stop with a callout and a plain note after the current step", () => {
  const e = open();
  e.showStep(2);
  mount.querySelector<HTMLButtonElement>('button.tool[data-tool="stop"]')!.click();
  expect(work(e)[2]).toMatchObject({ actor: "railroad", do: "stop", callout: { text: "Stop here" } });
  expect(e.state().selection).toEqual({ kind: "step", id: work(e)[2]!.id });
  mount.querySelector<HTMLButtonElement>('button.tool[data-tool="note"]')!.click();
  expect(work(e)[3]).toMatchObject({ do: "note", text: "Note" });
  expect(e.state().computed.sim.steps.every((s) => s.status === "ok")).toBe(true);
});

test("Esc during a drag discards the preview and adds no entry", () => {
  const e = open();
  e.select({ kind: "units", ids: TRAIN });
  pointer(unit(e, "C1"), "pointerdown", e, { xFt: 450, lane: 0 });
  pointer(document, "pointermove", e, { xFt: 750, lane: 0 });
  expect(e.state().plan.work).toHaveLength(8); // the preview shows the would-be step
  expect(e.state().stepIndex).toBe(1);
  key("Escape");
  expect(e.state().plan.work).toHaveLength(7);
  pointer(document, "pointermove", e, { xFt: 850, lane: 0 });
  pointer(document, "pointerup", e, { xFt: 850, lane: 0 });
  expect(e.history.entries()).toHaveLength(0);
  expect(e.history.plan.work).toHaveLength(7);
});

test("a zoom during a drag does not change the committed stop", () => {
  const e = open();
  e.select({ kind: "units", ids: TRAIN });
  pointer(unit(e, "C1"), "pointerdown", e, { xFt: 450, lane: 0 });
  pointer(document, "pointermove", e, { xFt: 600, lane: 0 });
  const before = e.view().pxPerFt;
  e.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
  expect(e.view().pxPerFt).toBeGreaterThan(before);
  pointer(document, "pointermove", e, { xFt: 750, lane: 0 });
  pointer(document, "pointerup", e, { xFt: 750, lane: 0 });
  expect(work(e)[0]!.stop).toEqual({ track: "MAIN", ft: 780, end: "lead" });
});

test("click selects a unit, shift-click adds one, and a shift-drag marquee selects the units inside", () => {
  const e = open();
  unit(e, "C1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(e.state().selection).toEqual({ kind: "units", ids: ["C1"] });
  unit(e, "C3").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
  expect(e.state().selection).toEqual({ kind: "units", ids: ["C1", "C3"] });
  const background = e.svg.querySelector("rect.background")!;
  pointer(background, "pointerdown", e, { xFt: 380, lane: -0.4 }, { shiftKey: true });
  pointer(document, "pointermove", e, { xFt: 500, lane: 0.4 }, { shiftKey: true });
  expect(e.svg.querySelector("g.overlay rect.marquee")).not.toBeNull();
  pointer(document, "pointerup", e, { xFt: 500, lane: 0.4 }, { shiftKey: true });
  expect(e.state().selection).toEqual({ kind: "units", ids: ["C2", "C1"] });
  expect(e.svg.querySelector("g.overlay rect.marquee")).toBeNull();
  expect(e.history.canUndo).toBe(false);
});

test("an offstage loco can be grabbed at the edge and dragged back in", () => {
  const e = open();
  e.showStep(3); // L1 has run light off the arrival end
  const tab = e.svg.querySelector<SVGGElement>('g.overlay g.offstage-unit[data-id="L1"]');
  expect(tab).not.toBeNull();
  pointer(tab!, "pointerdown", e, { xFt: -20, lane: 0 });
  pointer(document, "pointermove", e, { xFt: 100, lane: 0 });
  pointer(document, "pointermove", e, { xFt: 300, lane: 0 });
  pointer(document, "pointerup", e, { xFt: 300, lane: 0 });
  // Grabbed at MAIN 100 and dragged 200 ft: the loco, whose front stood at the edge, ends at 200.
  expect(work(e)[3]).toMatchObject({ do: "run_light", cars: ["L1"], stop: { track: "MAIN", ft: 200, end: "lead" } });
  expect(e.state().computed.sim.steps[4]!.status).toBe("ok");
});
