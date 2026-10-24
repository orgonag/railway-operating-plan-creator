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

function card(index: number): HTMLElement {
  const li = mount.querySelector<HTMLElement>(`li.step[data-index="${index}"]`);
  if (!li) throw new Error(`no card ${index}`);
  return li;
}

function key(k: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
}

test("reordering a step recalculates and highlights needs_attention steps", () => {
  const e = open();
  // Drag the run-light-away card (W3) above the cut-off card (W2): the loco is still coupled when it tries to run light.
  card(3).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  card(2).dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(card(2).classList.contains("drop-before")).toBe(true);
  document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  expect(e.history.plan.work.map((w) => w.id).slice(0, 3)).toEqual(["W1", "W3", "W2"]);
  expect(e.history.entries().map((x) => x.label)).toEqual(["reorder step"]);
  expect(e.state().computed.sim.steps[2]!.status).toBe("needs_attention");
  expect(card(2).classList.contains("needs_attention")).toBe(true);
  expect(card(2).querySelector(".status-word")?.textContent).toBe("Needs attention");
  expect(mount.querySelectorAll("li.step.drop-before")).toHaveLength(0);
});

test("a card dropped where it was, or the arrival and departure cards, change nothing", () => {
  const e = open();
  card(3).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  card(3).dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  card(0).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  card(4).dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  expect(e.history.canUndo).toBe(false);
});

test("dropping a card on the departure moves the step to the end", () => {
  const e = open();
  card(1).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  card(8).dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  expect(e.history.plan.work.map((w) => w.id)).toEqual(["W2", "W3", "W4", "W5", "W6", "W7", "W1"]);
});

test("Ctrl+C then Ctrl+V duplicates the selected step after itself with a new id; Delete removes it", () => {
  const e = open();
  card(2).click();
  key("c", { ctrlKey: true });
  key("v", { ctrlKey: true });
  const ids = e.history.plan.work.map((w) => w.id);
  expect(ids.slice(0, 3)).toEqual(["W1", "W2", "ST1"]);
  expect(e.history.plan.work[2]!.text).toBe(e.history.plan.work[1]!.text);
  expect(e.state().selection).toEqual({ kind: "step", id: "ST1" });
  key("Delete");
  expect(e.history.plan.work.map((w) => w.id)).not.toContain("ST1");
});
