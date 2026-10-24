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

function open(template: "demo" | "single_spur" = "demo"): Editor {
  editor = createEditor(mount, { plan: templateById(template).make() });
  return editor;
}

function tool(name: string): HTMLButtonElement {
  return mount.querySelector<HTMLButtonElement>(`button.tool[data-tool="${name}"]`)!;
}

function pointer(target: EventTarget, type: string, e: Editor, p: DrawPoint): void {
  const c = e.clientPoint(p);
  target.dispatchEvent(new MouseEvent(type, { clientX: c.clientX, clientY: c.clientY, bubbles: true, button: 0 }));
}

function key(k: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

function spurLength(e: Editor): number | undefined {
  return e.state().plan.tracks.find((t) => t.id === "SPUR1")?.lengthFt;
}

test("dropping Turnout on the main at 1400 ft adds a trailing right switch when dragged down and back", () => {
  const e = open();
  tool("turnout").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 1450, lane: -0.2 });
  expect(e.svg.querySelector("g.overlay .ghost")).not.toBeNull();
  pointer(document, "pointermove", e, { xFt: 1400, lane: -0.2 });
  pointer(document, "pointerup", e, { xFt: 1400, lane: -0.2 });
  const s2 = e.state().plan.switches.find((s) => s.id !== "S1");
  expect(s2).toMatchObject({ on: "MAIN", side: "right", approach: "trailing", distanceFt: 820 });
  expect(e.state().computed.g.switches.get(s2!.id)?.atFt).toBe(1400);
  expect(e.state().selection).toEqual({ kind: "switch", id: s2!.id });
  expect(e.history.entries().map((x) => x.label)).toEqual(["add turnout"]);
  expect(mount.querySelector('.properties button.flip[data-flip="left_right"]')).not.toBeNull();
  expect(e.svg.querySelector("g.overlay .ghost")).toBeNull();
});

test("dropping Turnout with no track under the pointer does nothing", () => {
  const e = open();
  tool("turnout").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 300, lane: 2 });
  pointer(document, "pointerup", e, { xFt: 300, lane: 2 });
  expect(e.state().plan.switches).toHaveLength(1);
  expect(e.history.canUndo).toBe(false);
});

test("flip left/right of a facing switch gives a trailing switch; the engine states are unchanged", () => {
  const e = open("single_spur");
  e.dispatch(
    { name: "addStep", step: { actor: "railroad", do: "run_light", to: "MAIN", text: "Ease ahead", stop: { track: "MAIN", ft: 500, end: "lead" } } },
    "step"
  );
  const before = JSON.parse(JSON.stringify(e.state().computed.sim.states));
  e.select({ kind: "switch", id: "S1" });
  mount.querySelector<HTMLButtonElement>('.properties button.flip[data-flip="left_right"]')!.click();
  expect(e.state().plan.switches[0]!.approach).toBe("trailing");
  expect(e.state().computed.sim.states).toEqual(before);
  mount.querySelector<HTMLButtonElement>('.properties button.flip[data-flip="up_down"]')!.click();
  expect(e.state().plan.switches[0]!.side).toBe("right");
  expect(e.state().computed.sim.states).toEqual(before);
});

test("stretching SPUR1's end to 650 ft commits one entry and shows '650 ft' during the drag", () => {
  const e = open();
  const handle = e.svg.querySelector<SVGCircleElement>('g.overlay circle.track-end-handle[data-track="SPUR1"]');
  expect(handle).not.toBeNull();
  pointer(handle!, "pointerdown", e, { xFt: 1670, lane: 1 });
  // The spur's usable length starts 290 ft past the points at x 580, so 650 ft ends at x 1520.
  pointer(document, "pointermove", e, { xFt: 1523, lane: 1.1 });
  expect(e.svg.querySelector("g.overlay text.drag-label")?.textContent).toBe("650 ft");
  expect(spurLength(e)).toBe(650);
  expect(e.history.entries()).toHaveLength(0);
  pointer(document, "pointerup", e, { xFt: 1523, lane: 1.1 });
  expect(e.history.entries().map((x) => x.label)).toEqual(["stretch Customer siding"]);
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.lengthFt).toBe(650);
  expect(e.svg.querySelector("g.overlay text.drag-label")).toBeNull();
});

test("a stretch never goes below 60 ft", () => {
  const e = open();
  const handle = e.svg.querySelector<SVGCircleElement>('g.overlay circle.track-end-handle[data-track="SPUR1"]')!;
  pointer(handle, "pointerdown", e, { xFt: 1670, lane: 1 });
  pointer(document, "pointermove", e, { xFt: 600, lane: 1 });
  pointer(document, "pointerup", e, { xFt: 600, lane: 1 });
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.lengthFt).toBe(60);
});

test("Esc during a stretch restores the length and adds no entry", () => {
  const e = open();
  const handle = e.svg.querySelector<SVGCircleElement>('g.overlay circle.track-end-handle[data-track="SPUR1"]')!;
  pointer(handle, "pointerdown", e, { xFt: 1670, lane: 1 });
  pointer(document, "pointermove", e, { xFt: 1400, lane: 1 });
  expect(spurLength(e)).toBe(530);
  key("Escape");
  expect(spurLength(e)).toBe(800);
  expect(e.svg.querySelector("g.overlay text.drag-label")).toBeNull();
  pointer(document, "pointermove", e, { xFt: 1300, lane: 1 });
  pointer(document, "pointerup", e, { xFt: 1300, lane: 1 });
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.lengthFt).toBe(800);
  expect(e.history.entries()).toHaveLength(0);
});

test("Track end dropped on the main is refused with the status message", () => {
  const e = open();
  tool("track-end").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 300, lane: 0.05 });
  pointer(document, "pointerup", e, { xFt: 300, lane: 0.05 });
  expect(mount.querySelector(".status .message")?.textContent).toBe("The main line continues off the drawing");
  expect(e.history.canUndo).toBe(false);
});

test("Track end dropped on a branch sets a buffer stop", () => {
  const e = open();
  e.dispatch({ name: "setTrack", trackId: "SPUR1", end: "continues" }, "end");
  tool("track-end").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 1200, lane: 1 });
  pointer(document, "pointerup", e, { xFt: 1200, lane: 1 });
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.end).toBe("buffer_stop");
  expect(e.history.entries().map((x) => x.label)).toEqual(["end", "track end"]);
});

test("clicking a track selects it; right-click opens the context menu and Siding changes the role", () => {
  const e = open();
  const path = e.svg.querySelector<SVGPathElement>('path.track[data-id="SPUR1"]')!;
  path.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(e.state().selection).toEqual({ kind: "track", id: "SPUR1" });
  path.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  const menu = mount.querySelector(".context-menu");
  expect(menu).not.toBeNull();
  const labels = [...menu!.querySelectorAll("button")].map((b) => b.textContent);
  expect(labels).toEqual(["Rename", "Main", "Siding", "Spur", "Set length", "Delete"]);
  menu!.querySelectorAll("button")[2]!.click();
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.role).toBe("siding");
  expect(mount.querySelector(".context-menu")).toBeNull();
});

test("the context menu Rename and Set length use prompt; Delete uses confirm", () => {
  const e = open();
  // The svg is redrawn after every change, so the path is looked up afresh each time.
  const path = (): SVGPathElement => e.svg.querySelector<SVGPathElement>('path.track[data-id="SPUR1"]')!;
  const prompts: string[] = [];
  window.prompt = (message?: string) => {
    prompts.push(message ?? "");
    return prompts.length === 1 ? "Mill spur" : "755";
  };
  path().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  mount.querySelector<HTMLButtonElement>('.context-menu button[data-action="rename"]')!.click();
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.name).toBe("Mill spur");
  path().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  mount.querySelector<HTMLButtonElement>('.context-menu button[data-action="length"]')!.click();
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.lengthFt).toBe(760);
  let asked = "";
  window.confirm = (message?: string) => {
    asked = message ?? "";
    return true;
  };
  path().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  mount.querySelector<HTMLButtonElement>('.context-menu button[data-action="delete"]')!.click();
  expect(asked).toBe("Delete Mill spur and everything on it?");
  expect(e.history.plan.tracks.map((t) => t.id)).toEqual(["MAIN"]);
});

test("stretching a branch on a right-entering plan follows the pointer and holds still", () => {
  const plan = templateById("demo").make();
  plan.arrival.enters = "right";
  editor = createEditor(mount, { plan });
  const e = editor;
  const d = e.state().computed.drawing;
  // The spur's points sit at x widthFt - 580 and it runs toward the left; its usable length starts 290 ft from the points.
  const points = d.tracks.find((t) => t.id === "SPUR1")!.points[0]!.xFt;
  const handle = e.svg.querySelector<SVGCircleElement>('g.overlay circle.track-end-handle[data-track="SPUR1"]')!;
  pointer(handle, "pointerdown", e, { xFt: points - 1090, lane: -1 });
  pointer(document, "pointermove", e, { xFt: points - 290 - 650, lane: -1 });
  expect(spurLength(e)).toBe(650);
  pointer(document, "pointermove", e, { xFt: points - 290 - 650, lane: -1 });
  expect(spurLength(e)).toBe(650);
  pointer(document, "pointerup", e, { xFt: points - 290 - 650, lane: -1 });
  expect(e.history.plan.tracks.find((t) => t.id === "SPUR1")?.lengthFt).toBe(650);
});

test("a turnout dropped between two switches takes its place in order and leaves the others where they were", () => {
  const e = open();
  e.dispatch({ name: "addTurnout", trackId: "MAIN", distanceFt: 820, side: "left", approach: "facing" }, "second");
  expect(e.state().computed.g.switches.get("S2")?.atFt).toBe(1400);
  tool("turnout").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 950, lane: -0.2 });
  pointer(document, "pointermove", e, { xFt: 1000, lane: -0.2 });
  pointer(document, "pointerup", e, { xFt: 1000, lane: -0.2 });
  const g = e.state().computed.g;
  expect(g.switches.get("S1")?.atFt).toBe(580);
  expect(g.switches.get("S3")?.atFt).toBe(1000);
  expect(g.switches.get("S2")?.atFt).toBe(1400);
  expect(e.history.plan.switches.map((s) => [s.id, s.order])).toEqual([
    ["S1", 1],
    ["S2", 3],
    ["S3", 2]
  ]);
  expect(e.history.entries().map((x) => x.label)).toEqual(["second", "add turnout"]);
});

test("a turnout dropped on the main before its first switch is refused with a message", () => {
  const e = open();
  tool("turnout").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  pointer(document, "pointermove", e, { xFt: 300, lane: -0.2 });
  pointer(document, "pointerup", e, { xFt: 300, lane: -0.2 });
  expect(e.history.canUndo).toBe(false);
  expect(mount.querySelector(".status .message")?.textContent).toBe("The first turnout sits where the arriving train clears it; drop this one further along.");
});

test("the track-end handle is drawn above a facility handle at the same point, so a facility at the far end does not hide it", () => {
  const e = open("single_spur");
  const handles = [...e.svg.querySelectorAll<SVGCircleElement>("g.overlay circle")];
  const trackEnd = handles.findIndex((c) => c.classList.contains("track-end-handle"));
  const facilityEnd = handles.findIndex((c) => c.classList.contains("facility-handle") && c.getAttribute("data-end") === "end");
  expect(trackEnd).toBeGreaterThan(facilityEnd);
  expect(handles[trackEnd]!.getAttribute("cx")).toBe(handles[facilityEnd]!.getAttribute("cx"));
});
