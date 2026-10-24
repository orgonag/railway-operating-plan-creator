// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createEditor, type Editor } from "../../src/editor/editor";
import { templateById } from "../../src/editor/templates";
import { fitView } from "../../src/editor/viewport";

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
  const b = mount.querySelector<HTMLButtonElement>(`button.tool[data-tool="${name}"]`);
  if (!b) throw new Error(`no tool ${name}`);
  return b;
}

function key(k: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
}

describe("createEditor", () => {
  test("mounts toolbar, strip, canvas, properties and status", () => {
    open();
    for (const cls of [".toolbar", ".step-strip", ".canvas", ".stage", "svg.plan", ".properties", ".status", ".save-status"]) {
      expect(mount.querySelector(cls), cls).not.toBeNull();
    }
    const names = [...mount.querySelectorAll<HTMLButtonElement>("button.tool")].map((b) => b.dataset.tool);
    expect(names).toEqual([
      "new",
      "open",
      "download",
      "share",
      "undo",
      "redo",
      "turnout",
      "track-end",
      "facility",
      "add-cars",
      "place-cars",
      "zoom-in",
      "zoom-out",
      "fit",
      "play"
    ]);
    for (const b of mount.querySelectorAll<HTMLButtonElement>("button.tool")) {
      expect(b.title.length, b.dataset.tool).toBeGreaterThan(3);
      expect(b.querySelector("svg"), b.dataset.tool).not.toBeNull();
      expect(b.textContent?.trim().length, b.dataset.tool).toBeGreaterThan(1);
    }
    expect(tool("share").disabled).toBe(true);
  });

  test("the strip has one card per sim step and the current one is marked", () => {
    const e = open();
    const cards = mount.querySelectorAll("li.step");
    expect(cards).toHaveLength(9);
    expect(cards[0]!.classList.contains("current")).toBe(true);
    expect(cards[1]!.querySelector(".note-dot")).not.toBeNull(); // the shove has a fit note
    expect(cards[0]!.querySelector(".note-dot")).toBeNull();
    (cards[3] as HTMLElement).click();
    expect(e.state().stepIndex).toBe(3);
    expect(mount.querySelectorAll("li.step.current")).toHaveLength(1);
    expect(mount.querySelector("li.step.current")?.getAttribute("data-index")).toBe("3");
    expect(e.state().selection).toEqual({ kind: "step", id: "W3" });
  });

  test("the canvas shows the sprites of the current step", () => {
    const e = open();
    expect(mount.querySelectorAll("svg.plan g.sprites g.unit")).toHaveLength(6);
    e.showStep(3); // L1 ran light offstage
    expect(mount.querySelectorAll("svg.plan g.sprites g.unit")).toHaveLength(5);
  });

  test("Undo and Redo buttons are disabled on a fresh plan and enable after a dispatch", () => {
    const e = open();
    expect(tool("undo").disabled).toBe(true);
    expect(tool("redo").disabled).toBe(true);
    e.dispatch({ name: "setTitle", title: "New" }, "rename");
    expect(tool("undo").disabled).toBe(false);
    tool("undo").click();
    expect(e.state().plan.title).not.toBe("New");
    expect(tool("redo").disabled).toBe(false);
    tool("redo").click();
    expect(e.state().plan.title).toBe("New");
  });

  test("changing the title input dispatches setTitle and the strip follows the plan", () => {
    const e = open();
    const input = mount.querySelector<HTMLInputElement>('.properties input[name="title"]');
    expect(input).not.toBeNull();
    input!.value = "Renamed";
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(e.state().plan.title).toBe("Renamed");
    expect(e.history.entries().map((x) => x.label)).toEqual(["title"]);
    e.dispatch({ name: "deleteStep", stepId: "W7" }, "delete");
    expect(mount.querySelectorAll("li.step")).toHaveLength(8);
  });

  test("a plan change does not change the view; Fit plan resets it", () => {
    const e = open();
    const start = e.view();
    e.setView({ ...start, pxPerFt: start.pxPerFt * 2, panX: start.panX + 50 });
    const zoomed = e.view();
    e.dispatch({ name: "setTitle", title: "Other" }, "rename");
    expect(e.view()).toEqual(zoomed);
    tool("fit").click();
    expect(e.view()).toEqual(fitView(e.state().computed.drawing, e.canvasSize().width, e.canvasSize().height));
    tool("zoom-in").click();
    expect(e.view().pxPerFt).toBeGreaterThan(start.pxPerFt);
  });

  test("Ctrl+Z undoes; Delete on a selected step removes it; keys are ignored in inputs", () => {
    const e = open();
    e.dispatch({ name: "setTitle", title: "New" }, "rename");
    key("z", { ctrlKey: true });
    expect(e.state().plan.title).not.toBe("New");
    key("y", { ctrlKey: true });
    expect(e.state().plan.title).toBe("New");
    e.select({ kind: "step", id: "W2" });
    key("Delete");
    expect(e.state().plan.work.map((w) => w.id)).not.toContain("W2");
    const input = mount.querySelector<HTMLInputElement>('.properties input[name="title"]')!;
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(e.state().plan.work).toHaveLength(6);
    key("Escape");
    expect(e.state().selection).toEqual({ kind: "none" });
  });

  test("Ctrl+C and Ctrl+V duplicate the selected step after itself with a new id", () => {
    const e = open();
    e.select({ kind: "step", id: "W1" });
    key("c", { ctrlKey: true });
    key("v", { ctrlKey: true });
    const ids = e.state().plan.work.map((w) => w.id);
    expect(ids[0]).toBe("W1");
    expect(ids[1]).toMatch(/^ST\d+$/);
    expect(e.state().plan.work[1]!.text).toBe(e.state().plan.work[0]!.text);
  });

  test("the step properties edit the step text", () => {
    const e = open();
    e.select({ kind: "step", id: "W1" });
    const text = mount.querySelector<HTMLTextAreaElement>('.properties textarea[name="text"]')!;
    text.value = "Shove them in";
    text.dispatchEvent(new Event("change", { bubbles: true }));
    expect(e.state().plan.work[0]!.text).toBe("Shove them in");
    expect(mount.querySelector("li.step[data-index='1'] .caption")?.textContent).toBe("Shove them in");
  });

  test("autosave writes the plan under the local id and shows the status", async () => {
    editor = createEditor(mount, { plan: templateById("single_spur").make(), localId: "abc" });
    editor.dispatch({ name: "setTitle", title: "Saved one" }, "rename");
    await new Promise((r) => setTimeout(r, 400));
    expect(JSON.parse(localStorage.getItem("ropc:plan:abc")!).title).toBe("Saved one");
    expect(mount.querySelector(".save-status")?.textContent).toBe("Saved in this browser");
  });
});

describe("review fixes", () => {
  test("editing one field and tabbing to the next keeps the form in place", () => {
    const e = open();
    const title = mount.querySelector<HTMLInputElement>('.properties input[name="title"]')!;
    const description = mount.querySelector<HTMLInputElement>('.properties input[name="description"]')!;
    title.focus();
    title.value = "Renamed";
    title.blur(); // Chrome fires change after focus has left the field and before the next field gets it
    title.dispatchEvent(new Event("change", { bubbles: true }));
    expect(e.state().plan.title).toBe("Renamed");
    expect(mount.querySelector('.properties input[name="description"]')).toBe(description);
    description.focus();
    expect(document.activeElement).toBe(description);
    // Once focus leaves the panel, the form refreshes from the plan.
    description.blur();
    document.body.focus();
    description.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    expect(mount.querySelector('.properties input[name="description"]')).not.toBe(description);
  });

  test("a fractional count typed into Locomotives is rounded, not saved as 1.5", () => {
    const e = open();
    const count = mount.querySelector<HTMLInputElement>('.properties input[name="locoCount"]')!;
    count.value = "1.5";
    count.dispatchEvent(new Event("change", { bubbles: true }));
    expect(e.state().plan.consist.locos.count).toBe(2);
  });

  test("a pending autosave is written when the page hides", async () => {
    editor = createEditor(mount, { plan: templateById("single_spur").make(), localId: "hide" });
    editor.dispatch({ name: "setTitle", title: "Before hide" }, "rename");
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem("ropc:plan:hide")!).title).toBe("Before hide");
  });
});
