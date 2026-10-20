import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { PlanReading, Switch, Track, WorkStep } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { materialize } from "../../src/core/engine/materialize";
import { buildGraph } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import { metricsFor, type Metrics } from "../../src/core/engine/metrics";

const demo = materialize(validateFile(demoJson).plan as PlanReading).plan;

function metricsOf(plan: PlanReading): Metrics {
  const g = buildGraph(plan);
  return metricsFor(simulate(plan, g), plan, g);
}

interface PlanOverrides {
  tracks?: Track[];
  switches?: Switch[];
  work?: WorkStep[];
}

/** One loco (80) and five cars (60 each) on the demo geometry, with no facility. */
function plan(o: PlanOverrides = {}): PlanReading {
  return materialize({
    schemaVersion: "1",
    title: "Test plan",
    arrival: { direction: "eastbound", enters: "left", on: "MAIN", locos: "rear", text: "Arrives." },
    tracks: o.tracks ?? [
      { id: "MAIN", role: "main", end: "continues" },
      { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" }
    ],
    switches: o.switches ?? [{ id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 }],
    facilities: [],
    consist: {
      locos: { count: 1 },
      cuts: [{ id: "LOADS", cars: 5, state: "loaded", list: ["C1", "C2", "C3", "C4", "C5"].map((id) => ({ id })) }]
    },
    work: o.work ?? [],
    departure: { direction: "westbound", text: "Departs." }
  }).plan;
}

describe("metrics", () => {
  test("demo metrics: 6 moves, 1 switch throw, 1 coupling, complete", () => {
    const m = metricsOf(demo);
    expect(m.moves).toBe(6);
    expect(m.switchThrows).toBe(1);
    expect(m.couplings).toBe(1);
    expect(m.complete).toBe(true);
  });

  test("demo feet travelled: the loco walks every move, the cars only the ones they are in", () => {
    const m = metricsOf(demo);
    // arrival 480, shove 100 + 1030, run light out 650 + 580 + 80, run light back 580 + 730, pull 650 + 430, departure 150 + 380.
    expect(m.feetTravelled.locos).toBe(480 + 1130 + 1310 + 1310 + 1080 + 530);
    expect(m.feetTravelled.cars).toEqual({ C1: 3220, C2: 3220, C3: 3220, C4: 3220, C5: 3220 });
  });

  test("a route_not_established step makes metrics incomplete", () => {
    const m = metricsOf(plan({
      tracks: [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
        { id: "SPUR2", role: "spur", lengthFt: 500, end: "buffer_stop" }
      ],
      switches: [
        { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing", order: 2 }
      ],
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR2", text: "", stop: { track: "SPUR2", ft: 400, end: "lead" } }]
    }));
    expect(m.complete).toBe(false);
    // Only the arrival moved with a route; the slide into SPUR2 counts neither as a move nor as feet.
    expect(m.feetTravelled.locos).toBe(480);
    expect(m.feetTravelled.cars.C1).toBe(480);
  });

  test("switch throws count changes: into the spur, back out, then along the main past S1 make two", () => {
    const m = metricsOf(plan({
      work: [
        { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 600, end: "lead" } },
        { id: "W2", actor: "railroad", do: "pull", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 100, end: "lead" } },
        { id: "W3", actor: "railroad", do: "shove", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 1000, end: "lead" } }
      ]
    }));
    expect(m.switchThrows).toBe(2);
    expect(m.moves).toBe(5);
    expect(m.couplings).toBe(0);
    expect(m.complete).toBe(true);
  });

  test("a plan with no work has two moves and nothing else", () => {
    const m = metricsOf(plan());
    expect(m).toEqual({
      moves: 2,
      // Arrival walks MAIN 0 to 480; departure walks the lead from 100 back to the offstage point at -380.
      feetTravelled: { locos: 480 + 480, cars: { C1: 960, C2: 960, C3: 960, C4: 960, C5: 960 } },
      switchThrows: 0,
      couplings: 0,
      complete: true
    });
  });
});
