// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import crossingJson from "../fixtures/extra-crossing.reading.json";
import pickupJson from "../fixtures/extra-pickup-cutoff.reading.json";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { materialize } from "../../src/core/engine/materialize";
import { buildGraph } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import { notesFor } from "../../src/core/engine/notes";
import { ROUTE_NOT_ESTABLISHED_TEXT } from "../../src/render/render";
import { captionFor, createPlayer, verbLabel } from "../../src/player/player";

function open(raw: unknown): PlanReading {
  const checked = validateFile(raw);
  if (!checked.plan) throw new Error(checked.problems.map((p) => p.message).join("; "));
  expect(checked.problems.filter((p) => !p.repaired)).toEqual([]);
  return materialize(checked.plan).plan;
}

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

function textOf(root: HTMLElement, selector: string): string {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`no ${selector}`);
  return node.textContent ?? "";
}

describe("createPlayer with the demo", () => {
  const demo = open(demoJson);

  test("mounts one SVG, a caption, controls, one dot per step and the notes for step 1", () => {
    const root = mount();
    const player = createPlayer(root, demo);
    expect(root.querySelectorAll("svg").length).toBe(1);
    expect(root.querySelectorAll("svg path.track").length).toBe(2);
    expect(textOf(root, ".step-count")).toBe("Step 1 / 9");
    expect(textOf(root, ".step-text")).toBe(demo.arrival.text);
    expect(root.querySelectorAll(".dots .dot").length).toBe(9);
    expect(root.querySelector(".dot.current")).toBe(root.querySelectorAll(".dot")[0]);
    expect(textOf(root, "button.prev")).toBe("Prev");
    expect(textOf(root, "button.play")).toBe("Play");
    expect(textOf(root, "button.next")).toBe("Next");
    expect((root.querySelector("button.prev") as HTMLButtonElement).disabled).toBe(true);
    expect(root.querySelectorAll(".notes li").length).toBe(0);
    // The first frame of the arrival is painted at once, at progress 0: the train is still offstage.
    expect(root.querySelectorAll("g.sprites g.unit").length).toBe(0);
    // The shove's first frame is the state after the arrival: all six units on the drawing.
    player.show(1);
    expect(root.querySelectorAll("g.sprites g.unit").length).toBe(6);
    player.destroy();
    expect(root.querySelector(".player")).toBeNull();
  });

  test("show(1) captions the shove and lists its info fit note", () => {
    const root = mount();
    const player = createPlayer(root, demo);
    player.show(1);
    expect(textOf(root, ".step-count")).toBe("Step 2 / 9");
    expect(textOf(root, ".step-text")).toBe(demo.work[0]!.text);
    const items = root.querySelectorAll(".notes li");
    expect(items.length).toBe(1);
    expect(items[0]!.getAttribute("data-level")).toBe("info");
    expect(items[0]!.getAttribute("data-kind")).toBe("fit");
    expect(items[0]!.querySelector(".note-text")!.textContent).toBe("5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft.");
    expect(root.querySelector(".dot.current")).toBe(root.querySelectorAll(".dot")[1]);
    player.destroy();
  });

  test("Next and Prev move one step and clamp at the ends; the last step disables Next", () => {
    const root = mount();
    const player = createPlayer(root, demo);
    (root.querySelector("button.next") as HTMLButtonElement).click();
    expect(textOf(root, ".step-count")).toBe("Step 2 / 9");
    (root.querySelector("button.prev") as HTMLButtonElement).click();
    expect(textOf(root, ".step-count")).toBe("Step 1 / 9");
    player.show(-5);
    expect(textOf(root, ".step-count")).toBe("Step 1 / 9");
    player.show(99);
    expect(textOf(root, ".step-count")).toBe("Step 9 / 9");
    expect((root.querySelector("button.next") as HTMLButtonElement).disabled).toBe(true);
    expect(textOf(root, ".step-text")).toBe(demo.departure.text);
    player.destroy();
  });

  test("play toggles the button to Pause and pause brings Play back", () => {
    const root = mount();
    const player = createPlayer(root, demo);
    player.play();
    expect(textOf(root, "button.play")).toBe("Pause");
    player.pause();
    expect(textOf(root, "button.play")).toBe("Play");
    player.destroy();
  });

  test("step text is inserted as text, never parsed as markup", () => {
    const plan = cloneJson(demo);
    plan.arrival.text = "<b>bold</b> & <img src=x onerror=alert(1)>";
    const root = mount();
    const player = createPlayer(root, plan);
    expect(textOf(root, ".step-text")).toBe(plan.arrival.text);
    expect(root.querySelector(".step-text b")).toBeNull();
    expect(root.querySelector(".step-text img")).toBeNull();
    player.destroy();
  });
});

describe("animation frames", () => {
  /** Drive the player's requestAnimationFrame loop by hand with a controlled clock. */
  function stubFrames(): { advance(ms: number): void; restore(): void } {
    let clock = 0;
    let nextId = 0;
    const pending = new Map<number, FrameRequestCallback>();
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      nextId += 1;
      pending.set(nextId, cb);
      return nextId;
    });
    const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      pending.delete(id);
    });
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    return {
      advance(ms: number): void {
        clock += ms;
        const run = [...pending.values()];
        pending.clear();
        for (const cb of run) cb(clock);
      },
      restore(): void {
        raf.mockRestore();
        caf.mockRestore();
        nowSpy.mockRestore();
      }
    };
  }

  test("a non-moving step is painted once: its sprite nodes survive the end of the 1.5 s timer", () => {
    const demo = open(demoJson);
    const frames = stubFrames();
    try {
      const root = mount();
      const player = createPlayer(root, demo);
      player.show(2);
      expect(textOf(root, ".step-text")).toBe(demo.work[1]!.text);
      const before = root.querySelector('g.unit[data-id="C1"]');
      expect(before).not.toBeNull();
      frames.advance(800);
      frames.advance(800);
      expect(root.querySelector('g.unit[data-id="C1"]')).toBe(before);
      // The same holds when a stale frame from the previous step is still delivered (a cancel that was missed).
      player.show(1);
      player.show(2);
      const again = root.querySelector('g.unit[data-id="C1"]');
      frames.advance(1600);
      expect(root.querySelector('g.unit[data-id="C1"]')).toBe(again);
      player.destroy();
    } finally {
      frames.restore();
    }
  });

  test("a moving step repaints each frame and lands on the after state at the end", () => {
    const demo = open(demoJson);
    const frames = stubFrames();
    try {
      const root = mount();
      const player = createPlayer(root, demo);
      player.show(1);
      const first = root.querySelector('g.unit[data-id="C1"]');
      frames.advance(750);
      const mid = root.querySelector('g.unit[data-id="C1"]');
      expect(mid).not.toBe(first);
      expect(mid!.getAttribute("transform")).not.toBe(first!.getAttribute("transform"));
      frames.advance(800);
      const end = root.querySelector('g.unit[data-id="C1"]');
      expect(end!.getAttribute("transform")).not.toBe(mid!.getAttribute("transform"));
      player.destroy();
    } finally {
      frames.restore();
    }
  });
});

describe("captions", () => {
  test("a missing caption falls back to the verb in plain words", () => {
    const demo = open(demoJson);
    const plan = cloneJson(demo);
    plan.work[2]!.text = "";
    const sim = simulate(plan, buildGraph(plan));
    expect(sim.steps[3]!.verb).toBe("run_light");
    expect(captionFor(plan, sim.steps[3]!)).toBe("Run light");
    expect(captionFor(plan, sim.steps[1]!)).toBe(plan.work[0]!.text);
    expect(verbLabel("shove")).toBe("Shove");
    expect(verbLabel("cut_off")).toBe("Cut off");
  });
});

describe("the extra fixtures", () => {
  test("extra-crossing validates, stands C1 across S1 with a fouling note, and plays to the end", () => {
    const plan = open(crossingJson);
    const g = buildGraph(plan);
    const sim = simulate(plan, g);
    expect(sim.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok"]);
    expect(sim.states[1]!.places.C1).toEqual({
      occupies: [
        { track: "MAIN", fromFt: 550, toFt: 580 },
        { track: "SPUR1", fromFt: 0, toFt: 30 }
      ]
    });
    const notes = notesFor(sim, plan, g).filter((n) => n.stepId === "W1");
    expect(notes.some((n) => n.kind === "fouling" && n.at === "S1")).toBe(true);

    const root = mount();
    const player = createPlayer(root, plan);
    player.show(1);
    expect(textOf(root, ".step-count")).toBe("Step 2 / 3");
    expect([...root.querySelectorAll(".notes li")].some((li) => li.textContent?.includes("fouling S1"))).toBe(true);
    expect(root.querySelector('g.unit[data-id="C1"]')).not.toBeNull();
    player.destroy();
  });

  test("extra-pickup-cutoff validates, couples E1, and leaves E1 behind on the cut-off step", () => {
    const plan = open(pickupJson);
    const g = buildGraph(plan);
    const sim = simulate(plan, g);
    expect(sim.steps.map((s) => s.verb)).toEqual(["arrival", "run_light", "couple", "pull", "cut_off", "departure"]);
    expect(sim.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(sim.states[2]!.coupled).toContainEqual(["L1", "E1"]);
    // After the cut-off E1 stands on its own, on the main, and the departure leaves it there.
    const cutOff = sim.states[4]!;
    expect(cutOff.coupled).toContainEqual(["E1"]);
    const e1 = cutOff.places.E1;
    expect(e1 && "occupies" in e1 && e1.occupies.every((s) => s.track === "MAIN")).toBe(true);
    const end = sim.states[5]!;
    expect(end.places.L1).toEqual({ offstage: "arrival_end" });
    expect(end.places.E1).toEqual(e1);

    const root = mount();
    const player = createPlayer(root, plan);
    player.show(5);
    expect(textOf(root, ".step-count")).toBe("Step 6 / 6");
    const ids = [...root.querySelectorAll("g.sprites g.unit")].map((u) => u.getAttribute("data-id"));
    expect(ids).toContain("E1");
    player.destroy();
  });
});

describe("route not established", () => {
  test("a no-route step shows the label and marks every unit route-unclear", () => {
    const demo = open(demoJson);
    // The engine's stale-via case: the shove stops short of S1 on the main but still asks for via S1.
    const plan = cloneJson(demo);
    const shove = plan.work[0]!;
    if (shove.do !== "shove") throw new Error("demo W1 should be the shove");
    delete shove.spot;
    shove.to = "MAIN";
    shove.stop = { track: "MAIN", ft: 500, end: "lead" };
    const sim = simulate(plan, buildGraph(plan));
    expect(sim.steps[1]!.status).toBe("route_not_established");

    const root = mount();
    const player = createPlayer(root, plan);
    player.show(1);
    expect(textOf(root, "g.sprites text.status-label")).toBe(ROUTE_NOT_ESTABLISHED_TEXT);
    expect(root.querySelectorAll("g.unit.route-unclear").length).toBe(6);
    expect([...root.querySelectorAll(".notes li")].some((li) => li.getAttribute("data-kind") === "unclear_route")).toBe(true);
    player.show(0);
    expect(root.querySelector("g.sprites text.status-label")).toBeNull();
    expect(root.querySelectorAll("g.unit.route-unclear").length).toBe(0);
    player.destroy();
  });
});
