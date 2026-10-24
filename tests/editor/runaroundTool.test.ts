// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from "vitest";

import { NO_SIDING_REASON } from "../../src/core/editing/runaround";
import { createEditor, type Editor } from "../../src/editor/editor";
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

function open(template: "demo" | "spur_with_runaround"): Editor {
  editor = createEditor(mount, { plan: templateById(template).make() });
  return editor;
}

function tool(name: string): HTMLButtonElement {
  return mount.querySelector<HTMLButtonElement>(`button.tool[data-tool="${name}"]`)!;
}

test("spur_with_runaround template: the train arrives between the siding's switches and the Runaround button is enabled on the arrival", () => {
  const e = open("spur_with_runaround");
  const plan = e.state().plan;
  expect(plan.tracks.map((t) => t.id)).toEqual(["MAIN", "SPUR1", "SIDING"]);
  expect(plan.tracks[2]).toMatchObject({ role: "siding", end: "rejoins" });
  expect(plan.switches).toHaveLength(3);
  expect(plan.work).toEqual([]);
  expect(plan.title).toBe("Untitled plan");
  expect(plan.consist.cuts).toHaveLength(1);
  expect(tool("runaround").disabled).toBe(false);
  expect(tool("runaround").title.length).toBeGreaterThan(10);
});

test("Runaround adds the five single steps after the current step as one history entry and selects the last; the loco ends at the other end", () => {
  const e = open("spur_with_runaround");
  tool("runaround").click();
  const work = e.history.plan.work;
  expect(work.map((w) => w.do)).toEqual(["cut_off", "run_light", "run_light", "run_light", "couple"]);
  expect(work.find((w) => w.actor === "railroad" && w.do === "run_light" && w.via?.length === 2)).toMatchObject({ via: ["S2", "S3"] });
  expect(e.history.entries().map((x) => x.label)).toEqual(["runaround"]);
  expect(e.state().selection).toEqual({ kind: "step", id: work[4]!.id });
  expect(e.state().stepIndex).toBe(5);
  const sim = e.state().computed.sim;
  expect(sim.steps.slice(1, 6).every((s) => s.status === "ok")).toBe(true);
  const before = sim.states[0]!.places["L1"]!;
  const after = sim.states[5]!.places["L1"]!;
  expect("occupies" in before && "occupies" in after && after.occupies[0]!.fromFt > before.occupies[0]!.toFt).toBe(true);
  expect(sim.states[5]!.coupled).toHaveLength(1);
  // Saved plans hold single steps only.
  expect(work.some((w) => w.do === "runaround")).toBe(false);
  // One undo takes all five away.
  e.history.undo();
  expect(e.history.plan.work).toEqual([]);
});

test("on the demo, which has no siding, the Runaround button is disabled and clicking it explains why", () => {
  const e = open("demo");
  expect(tool("runaround").disabled).toBe(true);
  tool("runaround").disabled = false;
  tool("runaround").click();
  expect(mount.querySelector(".status .message")!.textContent).toBe(NO_SIDING_REASON);
  expect(e.history.plan.work).toHaveLength(7);
});
