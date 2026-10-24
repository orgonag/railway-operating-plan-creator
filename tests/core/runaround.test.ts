import { describe, expect, test } from "vitest";

import spurJson from "../../docs/schema/examples/spur-with-runaround.reading.json";
import twoJson from "../../docs/schema/examples/two-customers.reading.json";
import spurExpected from "../fixtures/spur-with-runaround-expected.json";
import twoExpected from "../fixtures/two-customers-expected.json";
import { expandRunaround, NO_SIDING_REASON } from "../../src/core/editing/runaround";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate, type Simulation } from "../../src/core/engine/simulate";
import type { Place } from "../../src/core/engine/state";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

interface Expected {
  step: number;
  status: string;
  units: Record<string, Place>;
  facing: Record<string, "up" | "down">;
  coupled: string[][];
  loaded: Record<string, boolean>;
}

function open(raw: unknown): PlanReading {
  const checked = validateFile(raw);
  expect(checked.problems).toEqual([]);
  return materialize(checked.plan!).plan;
}

function run(plan: PlanReading): Simulation {
  return simulate(plan, buildGraph(plan));
}

function occupies(place: Place | undefined): { track: string; fromFt: number; toFt: number }[] {
  if (!place || !("occupies" in place)) throw new Error("not on the drawing");
  return place.occupies;
}

describe("expandRunaround", () => {
  test("expandRunaround from the arrival state names the siding and both switches in via", () => {
    const plan = open(spurJson);
    const g = buildGraph(plan);
    const sim = run(plan);
    // The arrival stops the train between the siding's switches; the runaround is the first work step.
    const r = expandRunaround(plan, g, sim.states[0]!, "L1");
    expect(r).not.toBeNull();
    expect(r!.sidingId).toBe("SIDING");
    const dos = r!.steps.map((s) => s.do);
    expect(dos[0]).toBe("cut_off");
    expect(dos[dos.length - 1]).toBe("couple");
    expect(dos.slice(1, -1).every((d) => d === "run_light")).toBe(true);
    const through = r!.steps.find((s) => s.via && s.via.length === 2);
    expect(through?.via).toEqual(["S2", "S3"]);
    expect(through?.cars).toEqual(["L1"]);
    for (const s of r!.steps) {
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.text).not.toMatch(/[–—]/);
    }
  });

  test("expandRunaround is null when no siding joins the loco's track at both ends", () => {
    const plan = open(twoJson);
    const sim = run(plan);
    expect(expandRunaround(plan, buildGraph(plan), sim.states[0]!, "L1")).toBeNull();
    expect(NO_SIDING_REASON).toContain("siding");
  });
});

describe("the tier 2 examples", () => {
  function check(plan: PlanReading, expected: Expected[]): Simulation {
    const sim = run(plan);
    expect(sim.steps.every((s) => s.status === "ok"), sim.steps.map((s) => `${s.stepId}:${s.status}:${s.reason ?? ""}`).join("\n")).toBe(true);
    expect(sim.states.length).toBe(expected.length);
    expected.forEach((e, i) => {
      expect(sim.states[i]!.places, `step ${i}`).toEqual(e.units);
      expect(sim.states[i]!.facing).toEqual(e.facing);
      expect(sim.states[i]!.coupled).toEqual(e.coupled);
      expect(sim.states[i]!.loaded).toEqual(e.loaded);
      expect(sim.steps[i]!.status).toBe(e.status);
    });
    return sim;
  }

  test("spur_with_runaround and two-customers validate, simulate with every step ok, and match their expected fixtures", () => {
    const spur = open(spurJson);
    const sim = check(spur, spurExpected as Expected[]);
    // After the runaround the loco stands at the other end of the cars, coupled, on the main.
    const ra = spur.work.find((w) => w.do === "runaround")!;
    const firstIndex = sim.steps.findIndex((s) => s.stepId === `${ra.id}a`);
    const lastIndex = sim.steps.findIndex((s) => s.stepId === `${ra.id}e`);
    expect(firstIndex).toBeGreaterThan(0);
    expect(lastIndex).toBe(firstIndex + 4);
    const before = sim.states[firstIndex - 1]!;
    const after = sim.states[lastIndex]!;
    const locoBefore = occupies(before.places["L1"])[0]!;
    const locoAfter = occupies(after.places["L1"])[0]!;
    expect(locoAfter.track).toBe("MAIN");
    expect(locoAfter.fromFt).toBeGreaterThan(locoBefore.toFt);
    expect(after.coupled.some((grp) => grp.includes("L1") && grp.length > 1)).toBe(true);
    // The spur's facility is served after the runaround: the cars end up on SPUR1.
    const last = sim.states[sim.states.length - 2]!;
    expect(occupies(last.places["C1"])[0]!.track).toBe("SPUR1");

    const two = open(twoJson);
    const sim2 = check(two, twoExpected as Expected[]);
    const spotted = sim2.states.find((s) => {
      const p = s.places["C5"];
      return p !== undefined && "occupies" in p && p.occupies[0]?.track === "SPUR2";
    });
    expect(spotted).toBeDefined();
  });

  test("the runaround's results carry the step id with suffixes a to e and the single verbs", () => {
    const spur = open(spurJson);
    const sim = run(spur);
    const ra = spur.work.find((w) => w.do === "runaround")!;
    const mine = sim.steps.filter((s) => String(s.stepId).startsWith(ra.id));
    expect(mine.map((s) => s.stepId)).toEqual(["a", "b", "c", "d", "e"].map((x) => ra.id + x));
    expect(mine.map((s) => s.verb)).toEqual(["cut_off", "run_light", "run_light", "run_light", "couple"]);
  });
});
