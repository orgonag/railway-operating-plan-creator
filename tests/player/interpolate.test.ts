import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { materialize } from "../../src/core/engine/materialize";
import { buildGraph, type Segment } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import type { StepResult, WorldState } from "../../src/core/engine/state";
import { ease, interpolate } from "../../src/player/interpolate";

const demo = materialize(validateFile(demoJson).plan as PlanReading).plan;
const sim = simulate(demo, buildGraph(demo));

function occupies(state: WorldState, id: string): Segment[] {
  const place = state.places[id];
  if (!place || !("occupies" in place)) throw new Error(`${id} is not on the drawing`);
  return place.occupies;
}

describe("ease", () => {
  test("ease(0) = 0, ease(1) = 1, ease(0.5) = 0.875", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.875);
  });
});

describe("interpolate: the demo shove (step 2)", () => {
  const before = sim.states[0]!;
  const after = sim.states[1]!;
  const step = sim.steps[1]!;

  test("progress 0 gives before and progress 1 gives after", () => {
    const at0 = interpolate(before, after, step, 0);
    const at1 = interpolate(before, after, step, 1);
    expect(at0.places).toEqual(before.places);
    expect(at1.places).toEqual(after.places);
    expect(at1.coupled).toEqual(after.coupled);
    expect(at1.facing).toEqual(after.facing);
    expect(at1.loaded).toEqual(after.loaded);
    // Fresh objects, not the inputs themselves.
    expect(at0).not.toBe(before);
    expect(at1).not.toBe(after);
  });

  test("at progress 0.5 of the demo shove, C1's head is at SPUR1 465", () => {
    // The leading end travels 1130 ft: 100 on MAIN to S1, then 1030 on SPUR1; half is 565, so 465 into SPUR1.
    const mid = interpolate(before, after, step, 0.5);
    const c1 = occupies(mid, "C1");
    expect(c1.at(-1)).toEqual({ track: "SPUR1", fromFt: 405, toFt: 465 });
    expect(c1).toEqual([{ track: "SPUR1", fromFt: 405, toFt: 465 }]);
    // The rest of the train follows end to end: the group is 380 ft long, its rear is 565 - 380 = 185 behind the head.
    expect(occupies(mid, "C2")).toEqual([{ track: "SPUR1", fromFt: 345, toFt: 405 }]);
    expect(occupies(mid, "C5")).toEqual([{ track: "SPUR1", fromFt: 165, toFt: 225 }]);
    expect(occupies(mid, "L1")).toEqual([{ track: "SPUR1", fromFt: 85, toFt: 165 }]);
  });

  test("at progress 130/1130 of the demo shove, C1 spans MAIN 550-580 and SPUR1 0-30", () => {
    const part = interpolate(before, after, step, 130 / 1130);
    expect(occupies(part, "C1")).toEqual([
      { track: "MAIN", fromFt: 550, toFt: 580 },
      { track: "SPUR1", fromFt: 0, toFt: 30 }
    ]);
    expect(occupies(part, "C2")).toEqual([{ track: "MAIN", fromFt: 490, toFt: 550 }]);
    expect(occupies(part, "L1")).toEqual([{ track: "MAIN", fromFt: 230, toFt: 310 }]);
  });

  test("the interpolated state keeps the step's coupling and loads", () => {
    const mid = interpolate(before, after, step, 0.3);
    expect(mid.coupled).toEqual(after.coupled);
    expect(mid.loaded).toEqual(after.loaded);
  });
});

describe("interpolate: what does not move", () => {
  test("units not in step.moved never move", () => {
    // Step 6 (W5): L1 runs light back in to the cars, which stay where the shove left them.
    const before = sim.states[4]!;
    const after = sim.states[5]!;
    const step = sim.steps[5]!;
    expect(step.verb).toBe("run_light");
    expect(step.moved).toEqual(["L1"]);
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const state = interpolate(before, after, step, progress);
      for (const id of ["C1", "C2", "C3", "C4", "C5"]) {
        expect(state.places[id]).toEqual(before.places[id]);
        expect(state.places[id]).toEqual(after.places[id]);
      }
    }
    // And the loco does move: at 0.5 it is partway along its travel, somewhere other than either end.
    const half = occupies(interpolate(before, after, step, 0.5), "L1");
    expect(half).not.toEqual(occupies(after, "L1"));
    expect(half.reduce((sum, s) => sum + Math.abs(s.toFt - s.fromFt), 0)).toBe(80);
  });

  test("a step with no movement (cut_off) gives after at every progress", () => {
    const before = sim.states[1]!;
    const after = sim.states[2]!;
    const step = sim.steps[2]!;
    expect(step.verb).toBe("cut_off");
    expect(step.moved).toEqual([]);
    expect(interpolate(before, after, step, 0.5).places).toEqual(after.places);
    expect(interpolate(before, after, step, 0.5).coupled).toEqual(after.coupled);
  });
});

describe("interpolate: offstage and status", () => {
  test("the arrival brings the train in from offstage: at 0.5 the head is halfway to its stop", () => {
    // The train stands offstage behind MAIN 0; the lead (C1's head) walks 480 ft to MAIN 480.
    const before = sim.initial;
    const after = sim.states[0]!;
    const step = sim.steps[0]!;
    expect(before.places.C1).toEqual({ offstage: "arrival_end" });
    const mid = interpolate(before, after, step, 0.5);
    expect(occupies(mid, "C1")).toEqual([{ track: "MAIN", fromFt: 180, toFt: 240 }]);
    expect(occupies(mid, "L1")).toEqual([{ track: "MAIN", fromFt: -140, toFt: -60 }]);
  });

  test("the departure runs the train out: at 1 every moved unit is offstage as in after", () => {
    const i = sim.steps.length - 1;
    const before = sim.states[i - 1]!;
    const after = sim.states[i]!;
    const step = sim.steps[i]!;
    expect(step.verb).toBe("departure");
    const end = interpolate(before, after, step, 1);
    expect(end.places).toEqual(after.places);
    const mid = interpolate(before, after, step, 0.5);
    // Partway out, the units are still drawn, further toward the arrival end than before.
    const c1Before = occupies(before, "C1")[0]!;
    const c1Mid = occupies(mid, "C1")[0]!;
    expect(c1Mid.track).toBe("MAIN");
    expect(Math.max(c1Mid.fromFt, c1Mid.toFt)).toBeLessThan(Math.max(c1Before.fromFt, c1Before.toFt));
  });

  test("route_not_established returns after at every progress", () => {
    // The engine's own no-route case: the cars are drawn as authored and travel is null.
    const plan = cloneJson(demo);
    plan.work = [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 500, end: "lead" } }];
    const m = materialize(plan).plan;
    const s = simulate(m, buildGraph(m));
    const step: StepResult = { ...s.steps[1]!, status: "route_not_established", travel: null };
    const before = s.states[0]!;
    const after = s.states[1]!;
    expect(after.places).not.toEqual(before.places);
    for (const progress of [0, 0.5, 1]) {
      const state = interpolate(before, after, step, progress);
      expect(state.places).toEqual(after.places);
    }
  });

  test("needs_attention returns after", () => {
    const step: StepResult = { ...sim.steps[1]!, status: "needs_attention", moved: [], travel: [] };
    expect(interpolate(sim.states[0]!, sim.states[1]!, step, 0.5).places).toEqual(sim.states[1]!.places);
  });
});
