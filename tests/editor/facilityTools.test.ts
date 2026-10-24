// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from "vitest";

import type { DrawPoint } from "../../src/core/layout/layout";
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

function pointer(target: EventTarget, type: string, e: Editor, p: DrawPoint): void {
  const c = e.clientPoint(p);
  target.dispatchEvent(new MouseEvent(type, { clientX: c.clientX, clientY: c.clientY, bubbles: true, button: 0 }));
}

function racks(e: Editor) {
  return e.state().plan.facilities.find((f) => f.id === "RACKS");
}

test("dropping Facility on SPUR1 at ft 500 adds a 300 ft facility from 350 named Facility 1", () => {
  const e = open();
  mount.querySelector('button.tool[data-tool="facility"]')!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  // SPUR1's points are at x 580, so ft 500 is x 1080 on lane 1.
  pointer(document, "pointermove", e, { xFt: 1080, lane: 1.1 });
  expect(e.svg.querySelector("g.overlay .ghost-facility")).not.toBeNull();
  pointer(document, "pointerup", e, { xFt: 1080, lane: 1.1 });
  const added = e.state().plan.facilities[1];
  expect(added).toEqual({ id: "F1", name: "Facility 1", kind: "other", track: "SPUR1", startFt: 350, lengthFt: 300 });
  expect(e.history.entries().map((x) => x.label)).toEqual(["add facility"]);
  expect(e.state().selection).toEqual({ kind: "facility", id: "F1" });
  expect(e.state().computed.g.facilities.get("F1")?.spots).toHaveLength(5);
  expect(e.svg.querySelector("g.overlay .ghost-facility")).toBeNull();
});

test("a facility drop near the start of a track starts at 0", () => {
  const e = open();
  mount.querySelector('button.tool[data-tool="facility"]')!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 100, lane: 0 });
  pointer(document, "pointerup", e, { xFt: 100, lane: 0 });
  expect(e.state().plan.facilities[1]).toMatchObject({ track: "MAIN", startFt: 0, lengthFt: 300 });
});

test("dragging the end handle to 420 ft shows '420 ft, 7 cars' and commits one entry", () => {
  const e = open();
  e.dispatch({ name: "setFacility", facilityId: "RACKS", startFt: 400 }, "start");
  const handle = e.svg.querySelector<SVGCircleElement>('g.overlay circle.facility-handle[data-facility="RACKS"][data-end="end"]');
  expect(handle).not.toBeNull();
  // The racks now run from ft 400 to 760 on SPUR1 (x 980 to 1340); 420 ft long ends at ft 820, x 1400.
  expect(Number(handle!.getAttribute("cx"))).toBeCloseTo(e.svgPoint({ xFt: 1340, lane: 1 }).x, 1);
  pointer(handle!, "pointerdown", e, { xFt: 1340, lane: 1 });
  pointer(document, "pointermove", e, { xFt: 1403, lane: 1.1 });
  expect(e.svg.querySelector("g.overlay text.drag-label")?.textContent).toBe("420 ft, 7 cars");
  expect(racks(e)).toMatchObject({ startFt: 400, lengthFt: 420 });
  expect(e.history.entries()).toHaveLength(1);
  pointer(document, "pointerup", e, { xFt: 1403, lane: 1.1 });
  expect(e.history.entries().map((x) => x.label)).toEqual(["start", "resize Unloading racks"]);
  expect(e.history.plan.facilities[0]).toMatchObject({ startFt: 400, lengthFt: 420 });
});

test("dragging the start handle keeps the end where it is; a facility never shrinks below 60 ft", () => {
  const e = open();
  // RACKS has no startFt: it sits at the far end of SPUR1, ft 730 to 1090 (x 1310 to 1670).
  const start = e.svg.querySelector<SVGCircleElement>('g.overlay circle.facility-handle[data-facility="RACKS"][data-end="start"]')!;
  pointer(start, "pointerdown", e, { xFt: 1310, lane: 1 });
  pointer(document, "pointermove", e, { xFt: 1200, lane: 1 });
  expect(e.svg.querySelector("g.overlay text.drag-label")?.textContent).toBe("470 ft, 7 cars");
  expect(racks(e)).toMatchObject({ startFt: 620, lengthFt: 470 });
  pointer(document, "pointermove", e, { xFt: 1690, lane: 1 });
  expect(racks(e)).toMatchObject({ startFt: 1030, lengthFt: 60 });
  pointer(document, "pointerup", e, { xFt: 1690, lane: 1 });
  expect(e.history.plan.facilities[0]).toMatchObject({ startFt: 1030, lengthFt: 60 });
  expect(e.history.entries()).toHaveLength(1);
});

test("Esc during a facility resize restores it and adds no entry", () => {
  const e = open();
  const end = e.svg.querySelector<SVGCircleElement>('g.overlay circle.facility-handle[data-facility="RACKS"][data-end="end"]')!;
  pointer(end, "pointerdown", e, { xFt: 1670, lane: 1 });
  pointer(document, "pointermove", e, { xFt: 1500, lane: 1 });
  expect(racks(e)?.lengthFt).toBe(190);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(racks(e)).toEqual({ id: "RACKS", name: "Unloading racks", kind: "unloading_racks", track: "SPUR1", lengthFt: 360, spots: 5 });
  pointer(document, "pointerup", e, { xFt: 1500, lane: 1 });
  expect(e.history.entries()).toHaveLength(0);
});

test("Show spots re-renders with spot ticks", () => {
  const e = open();
  expect(e.svg.querySelectorAll("rect.spot")).toHaveLength(0);
  e.select({ kind: "facility", id: "RACKS" });
  const box = mount.querySelector<HTMLInputElement>('.properties input[name="showSpots"]')!;
  box.checked = true;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  expect(e.state().showSpots).toBe(true);
  expect(e.svg.querySelectorAll("rect.spot")).toHaveLength(5);
  expect(e.history.canUndo).toBe(false);
});

test("deleting a facility that a step names leaves the step and marks it needs_attention", () => {
  const e = open();
  e.select({ kind: "facility", id: "RACKS" });
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
  expect(e.state().plan.facilities).toEqual([]);
  expect(e.state().plan.work[0]).toMatchObject({ id: "W1", to: "RACKS" });
  expect(e.state().computed.sim.steps[1]?.status).toBe("needs_attention");
  expect(mount.querySelector('li.step[data-index="1"]')?.classList.contains("needs_attention")).toBe(true);
});
