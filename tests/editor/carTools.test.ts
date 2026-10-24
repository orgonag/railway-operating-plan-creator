// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from "vitest";

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

function open(): Editor {
  editor = createEditor(mount, { plan: templateById("demo").make() });
  return editor;
}

function tool(name: string): HTMLButtonElement {
  return mount.querySelector<HTMLButtonElement>(`button.tool[data-tool="${name}"]`)!;
}

function set(dialog: Element, name: string, value: string): void {
  const field = dialog.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!field) throw new Error(`no field ${name}`);
  field.value = value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function fitNote(e: Editor): string | undefined {
  return e.state().computed.notes.find((n) => n.stepId === "W1" && n.kind === "fit")?.text;
}

test("Add cars 3 tank_general empty appends three cars to the train and selects them", () => {
  const e = open();
  e.showStep(4);
  tool("add-cars").click();
  const dialog = mount.querySelector("dialog.add-cars")!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute("data-mode")).toBe("add");
  expect([...dialog.querySelectorAll<HTMLOptionElement>('select[name="type"] option')].map((o) => o.textContent)).toContain("Tank car");
  set(dialog, "count", "3");
  set(dialog, "type", "tank_general");
  set(dialog, "state", "empty");
  dialog.querySelector<HTMLButtonElement>("button.ok")!.click();
  const cut = e.state().plan.consist.cuts[1]!;
  expect(cut).toMatchObject({ cars: 3, carType: "tank_general", state: "empty" });
  expect(cut.list!.map((c) => c.id)).toEqual(["C6", "C7", "C8"]);
  expect(e.state().selection).toEqual({ kind: "units", ids: ["C6", "C7", "C8"] });
  expect(e.state().stepIndex).toBe(0);
  expect(e.history.entries().map((x) => x.label)).toEqual(["add cars"]);
  expect(mount.querySelector("dialog.add-cars")).toBeNull();
  expect(e.svg.querySelectorAll("g.sprites g.unit")).toHaveLength(9);
});

test("Cancel in the Add cars dialog adds nothing", () => {
  const e = open();
  tool("add-cars").click();
  const dialog = mount.querySelector("dialog.add-cars")!;
  dialog.querySelector<HTMLButtonElement>("button.close")!.click();
  expect(e.state().plan.consist.cuts).toHaveLength(1);
  expect(mount.querySelector("dialog.add-cars")).toBeNull();
});

test("Place cars 2 boxcar_60 empty at RACKS spot 1 adds an onSite cut and the arrival state shows them at spots 1 and 2", () => {
  const e = open();
  tool("place-cars").click();
  const dialog = mount.querySelector("dialog.add-cars")!;
  expect(dialog.getAttribute("data-mode")).toBe("place");
  const at = [...dialog.querySelectorAll<HTMLOptionElement>('select[name="at"] option')].map((o) => [o.value, o.textContent]);
  expect(at).toEqual([
    ["RACKS", "Unloading racks"],
    ["MAIN", "Main line"],
    ["SPUR1", "Customer siding"]
  ]);
  set(dialog, "count", "2");
  set(dialog, "type", "boxcar_60");
  set(dialog, "state", "empty");
  set(dialog, "at", "RACKS");
  set(dialog, "spot", "1");
  dialog.querySelector<HTMLButtonElement>("button.ok")!.click();
  expect(e.state().plan.consist.onSite?.[0]).toMatchObject({ cars: 2, carType: "boxcar_60", state: "empty", at: "RACKS", spot: 1 });
  const arrival = e.state().computed.sim.states[0]!;
  // RACKS runs from ft 730 on SPUR1; spots are 60 ft from there.
  expect(arrival.places["C6"]).toEqual({ occupies: [{ track: "SPUR1", fromFt: 730, toFt: 790 }] });
  expect(arrival.places["C7"]).toEqual({ occupies: [{ track: "SPUR1", fromFt: 790, toFt: 850 }] });
  expect(e.history.entries().map((x) => x.label)).toEqual(["place cars"]);
  expect(e.state().stepIndex).toBe(0);
  expect(e.state().selection).toEqual({ kind: "units", ids: ["C6", "C7"] });
});

test("the spot field only applies to a facility", () => {
  const e = open();
  tool("place-cars").click();
  const dialog = mount.querySelector("dialog.add-cars")!;
  set(dialog, "at", "SPUR1");
  expect(dialog.querySelector<HTMLInputElement>('input[name="spot"]')!.disabled).toBe(true);
  dialog.querySelector<HTMLButtonElement>("button.ok")!.click();
  expect(e.state().plan.consist.onSite?.[0]).toMatchObject({ at: "SPUR1" });
  expect(e.state().plan.consist.onSite?.[0]).not.toHaveProperty("spot");
});

test("place cars on site; a shove toward them gets a fit note counting both groups", () => {
  const e = open();
  expect(fitNote(e)).toContain("5 cars");
  e.dispatch({ name: "placeCars", count: 2, type: "boxcar_60", state: "empty", at: "RACKS", spot: 1 }, "place cars");
  expect(fitNote(e)).toContain("7 cars");
});

test("setCar lengthFt 89 changes the fit note text", () => {
  const e = open();
  const before = fitNote(e)!;
  expect(before).toContain("300 ft");
  e.select({ kind: "units", ids: ["C1"] });
  const length = mount.querySelector<HTMLInputElement>('.properties input[name="lengthFt"]')!;
  length.value = "89";
  length.dispatchEvent(new Event("change", { bubbles: true }));
  expect(e.state().plan.consist.cuts[0]!.list![0]).toMatchObject({ id: "C1", lengthFt: 89 });
  const after = fitNote(e)!;
  expect(after).not.toBe(before);
  // Four cars at 60 ft and one at 89 ft.
  expect(after).toContain("329 ft");
});

test("changing type on a 3-car selection is one history entry", () => {
  const e = open();
  e.select({ kind: "units", ids: ["C1", "C2", "C3"] });
  const type = mount.querySelector<HTMLSelectElement>('.properties select[name="type"]')!;
  type.value = "gondola";
  type.dispatchEvent(new Event("change", { bubbles: true }));
  expect(e.history.entries().map((x) => x.label)).toEqual(["car type"]);
  expect(e.state().plan.consist.cuts[0]!.list!.slice(0, 3).map((c) => c.type)).toEqual(["gondola", "gondola", "gondola"]);
  expect(e.state().plan.consist.cuts[0]!.list![3]!.type).toBeUndefined();
});

test("setLocos count 2 gives L1 and L2 in the arrival state", () => {
  const e = open();
  const count = mount.querySelector<HTMLInputElement>('.properties input[name="locoCount"]')!;
  count.value = "2";
  count.dispatchEvent(new Event("change", { bubbles: true }));
  const arrival = e.state().computed.sim.states[0]!;
  expect(Object.keys(arrival.places)).toEqual(expect.arrayContaining(["L1", "L2"]));
  expect(arrival.coupled.some((group) => group.includes("L1") && group.includes("L2"))).toBe(true);
  expect(e.svg.querySelectorAll("g.sprites g.unit.loco")).toHaveLength(2);
});
