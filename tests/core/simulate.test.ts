import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import expectedJson from "../fixtures/demo-expected.json";
import type { OnSiteCut, PlanReading, Switch, Track, WorkStep } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { materialize } from "../../src/core/engine/materialize";
import { buildGraph, type Segment } from "../../src/core/engine/graph";
import { simulate, type Simulation } from "../../src/core/engine/simulate";
import { NO_SIDING_REASON } from "../../src/core/editing/runaround";
import type { Place, WorldState } from "../../src/core/engine/state";

interface Expected {
  step: number;
  status: string;
  units: Record<string, Place>;
  facing: Record<string, "up" | "down">;
  coupled: string[][];
  loaded: Record<string, boolean>;
}

const expected = expectedJson as Expected[];
const demo = materialize(validateFile(demoJson).plan as PlanReading).plan;

function run(plan: PlanReading): Simulation {
  return simulate(plan, buildGraph(plan));
}

/** The demo with its work list replaced. */
function demoWith(work: WorkStep[]): PlanReading {
  const plan = cloneJson(demo);
  plan.work = work;
  return materialize(plan).plan;
}

interface PlanOverrides {
  tracks?: Track[];
  switches?: Switch[];
  onSite?: OnSiteCut[];
  locos?: number;
  work?: WorkStep[];
}

/** One loco (80) and five cars (60 each) on the demo geometry, with no facility. */
function plan(o: PlanOverrides = {}): PlanReading {
  const raw: PlanReading = {
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
      locos: { count: o.locos ?? 1 },
      cuts: [{ id: "LOADS", cars: 5, state: "loaded", list: ["C1", "C2", "C3", "C4", "C5"].map((id) => ({ id })) }]
    },
    work: o.work ?? [],
    departure: { direction: "westbound", text: "Departs." }
  };
  if (o.onSite) raw.consist.onSite = o.onSite;
  return materialize(raw).plan;
}

function occupies(state: WorldState, id: string): Segment[] {
  const place = state.places[id];
  if (!place || !("occupies" in place)) throw new Error(`${id} is not on the drawing`);
  return place.occupies;
}

describe("simulate: the demo", () => {
  test("demo matches the expected-state table at every step: places, facing, coupled, loaded, status", () => {
    const sim = run(demo);
    expect(sim.states.length).toBe(expected.length);
    expect(sim.steps.length).toBe(expected.length);
    expected.forEach((e, i) => {
      expect(sim.states[i]!.places).toEqual(e.units);
      expect(sim.states[i]!.facing).toEqual(e.facing);
      expect(sim.states[i]!.coupled).toEqual(e.coupled);
      expect(sim.states[i]!.loaded).toEqual(e.loaded);
      expect(sim.steps[i]!.status).toBe(e.status);
    });
  });

  test("step ids, indexes and verbs follow the plan: arrival, W1..W7, departure", () => {
    const sim = run(demo);
    expect(sim.steps.map((s) => s.stepId)).toEqual(["arrival", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "departure"]);
    expect(sim.steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sim.steps.map((s) => s.verb)).toEqual([
      "arrival",
      "shove",
      "cut_off",
      "run_light",
      "unload",
      "run_light",
      "couple",
      "pull",
      "departure"
    ]);
  });

  test("travel is the path the leading end covered: arrival walks MAIN 0 to 480, the shove walks on into SPUR1", () => {
    const sim = run(demo);
    expect(sim.steps[0]!.travel).toEqual([{ track: "MAIN", fromFt: 0, toFt: 480 }]);
    expect(sim.steps[1]!.travel).toEqual([
      { track: "MAIN", fromFt: 480, toFt: 580 },
      { track: "SPUR1", fromFt: 0, toFt: 1030 }
    ]);
    expect(sim.steps[1]!.moved).toEqual(["L1", "C5", "C4", "C3", "C2", "C1"]);
    expect(sim.steps[2]!.moved).toEqual([]);
    expect(sim.steps[2]!.travel).toEqual([]);
    expect(sim.steps[3]!.moved).toEqual(["L1"]);
  });

  test("the initial state has every unit offstage at the arrival end, coupled as the arriving train in rising-ft order", () => {
    const sim = run(demo);
    for (const id of ["L1", "C1", "C2", "C3", "C4", "C5"]) {
      expect(sim.initial.places[id]).toEqual({ offstage: "arrival_end" });
      expect(sim.initial.facing[id]).toBe("up");
    }
    // Ruling 12: the same rising-ft order as every other state, so it matches the arrival row.
    expect(sim.initial.coupled).toEqual([["L1", "C5", "C4", "C3", "C2", "C1"]]);
    expect(sim.initial.coupled).toEqual(sim.states[0]!.coupled);
    expect(sim.initial.loaded).toEqual({ C1: true, C2: true, C3: true, C4: true, C5: true });
  });

  test("loco leaving and returning keeps its id and facing", () => {
    const sim = run(demo);
    expect(sim.states[3]!.places.L1).toEqual({ offstage: "arrival_end" });
    expect(sim.states[5]!.facing.L1).toBe(sim.states[1]!.facing.L1);
    expect(Object.keys(sim.states[5]!.places).sort()).toEqual(["C1", "C2", "C3", "C4", "C5", "L1"]);
  });
});

describe("simulate: move geometry", () => {
  test("a stop with C1 halfway through S1 keeps C1 at 60 ft across MAIN and SPUR1", () => {
    const p = plan({
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 30, end: "lead" } }]
    });
    const sim = run(p);
    expect(sim.steps[1]!.status).toBe("ok");
    const c1 = (sim.states[1]!.places.C1 as { occupies: Segment[] }).occupies;
    expect(c1).toEqual([
      { track: "MAIN", fromFt: 550, toFt: 580 },
      { track: "SPUR1", fromFt: 0, toFt: 30 }
    ]);
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "MAIN", fromFt: 230, toFt: 310 }]);
    expect(occupies(sim.states[1]!, "C2")).toEqual([{ track: "MAIN", fromFt: 490, toFt: 550 }]);
  });

  test("a 10 ft nudge moves the whole train 10 ft and keeps spacing", () => {
    const p = plan({
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 490, end: "lead" } }]
    });
    const sim = run(p);
    const s = sim.states[1]!;
    expect(sim.steps[1]!.status).toBe("ok");
    expect(occupies(s, "L1")).toEqual([{ track: "MAIN", fromFt: 110, toFt: 190 }]);
    expect(occupies(s, "C5")).toEqual([{ track: "MAIN", fromFt: 190, toFt: 250 }]);
    expect(occupies(s, "C4")).toEqual([{ track: "MAIN", fromFt: 250, toFt: 310 }]);
    expect(occupies(s, "C3")).toEqual([{ track: "MAIN", fromFt: 310, toFt: 370 }]);
    expect(occupies(s, "C2")).toEqual([{ track: "MAIN", fromFt: 370, toFt: 430 }]);
    expect(occupies(s, "C1")).toEqual([{ track: "MAIN", fromFt: 430, toFt: 490 }]);
    expect(sim.steps[1]!.travel).toEqual([{ track: "MAIN", fromFt: 480, toFt: 490 }]);
    expect(sim.steps[1]!.verb).toBe("shove");
  });

  test("three partial moves along one track survive a JSON round trip", () => {
    const move = (id: string, ft: number): WorkStep => ({
      id,
      actor: "railroad",
      do: "shove",
      cars: ["LOADS"],
      to: "MAIN",
      text: "",
      stop: { track: "MAIN", ft, end: "lead" }
    });
    const sim = run(plan({ work: [move("W1", 490), move("W2", 510), move("W3", 540)] }));
    expect(sim.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(occupies(sim.states[3]!, "C1")).toEqual([{ track: "MAIN", fromFt: 480, toFt: 540 }]);
    expect(occupies(sim.states[3]!, "L1")).toEqual([{ track: "MAIN", fromFt: 160, toFt: 240 }]);
    expect(sim.steps[3]!.travel).toEqual([{ track: "MAIN", fromFt: 510, toFt: 540 }]);
    const roundTripped = JSON.parse(JSON.stringify(sim)) as Simulation;
    expect(roundTripped).toEqual(sim);
    expect(roundTripped.states[3]!.places.C1).toEqual({ occupies: [{ track: "MAIN", fromFt: 480, toFt: 540 }] });
  });

  test("a stop with end rear puts the trailing end at the target and the lead a group length past it", () => {
    const sim = run(plan({
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 150, end: "rear" } }]
    }));
    expect(sim.steps[1]!.status).toBe("ok");
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "MAIN", fromFt: 150, toFt: 230 }]);
    expect(occupies(sim.states[1]!, "C1")).toEqual([{ track: "MAIN", fromFt: 470, toFt: 530 }]);
  });

  test("a stop past the buffer is kept as authored with status past_end", () => {
    const sim = run(plan({
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 2000, end: "lead" } }]
    }));
    expect(sim.steps[1]!.status).toBe("past_end");
    const c1 = occupies(sim.states[1]!, "C1");
    expect(c1[c1.length - 1]).toEqual({ track: "SPUR1", fromFt: 1940, toFt: 2000 });
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "SPUR1", fromFt: 1620, toFt: 1700 }]);
    expect(sim.steps[1]!.travel).toEqual([
      { track: "MAIN", fromFt: 480, toFt: 580 },
      { track: "SPUR1", fromFt: 0, toFt: 2000 }
    ]);
  });

  test("an unreachable destination is route_not_established and lands where asked", () => {
    const sim = run(plan({
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
    const step = sim.steps[1]!;
    expect(step.status).toBe("route_not_established");
    expect(step.travel).toBeNull();
    expect(step.moved).toEqual(["L1", "C5", "C4", "C3", "C2", "C1"]);
    expect(occupies(sim.states[1]!, "C1")).toEqual([{ track: "SPUR2", fromFt: 340, toFt: 400 }]);
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "SPUR2", fromFt: 20, toFt: 100 }]);
    expect(sim.states[1]!.coupled).toEqual([["L1", "C5", "C4", "C3", "C2", "C1"]]);
  });

  test("the default stop for a track is 100 ft short of the next switch, and for a facility the last spot", () => {
    const toMain = demoWith([
      { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", text: "" },
      { id: "W2", actor: "railroad", do: "pull", cars: ["LOADS"], to: "MAIN", text: "" }
    ]);
    const sim = run(toMain);
    expect(sim.steps[1]!.status).toBe("ok");
    expect(occupies(sim.states[1]!, "C1")).toEqual([{ track: "SPUR1", fromFt: 970, toFt: 1030 }]);
    expect(sim.steps[2]!.status).toBe("ok");
    expect(occupies(sim.states[2]!, "L1")).toEqual([{ track: "MAIN", fromFt: 100, toFt: 180 }]);
  });
});

describe("simulate: coupling and selection", () => {
  test("pickup from different equipment, then cut_off, splits L1 from E1", () => {
    const p = plan({
      onSite: [{ id: "EMPTIES", cars: 1, state: "empty", at: "SPUR1", list: [{ id: "E1" }] }],
      work: [
        { id: "W1", actor: "railroad", do: "cut_off", text: "" },
        { id: "W2", actor: "railroad", do: "run_light", to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 1030, end: "lead" } },
        { id: "W3", actor: "railroad", do: "couple", cars: ["E1"], text: "" },
        { id: "W4", actor: "railroad", do: "cut_off", cars: ["EMPTIES"], text: "" }
      ]
    });
    const sim = run(p);
    expect(sim.states[0]!.places.E1).toEqual({ occupies: [{ track: "SPUR1", fromFt: 1030, toFt: 1090 }] });
    expect(sim.states[0]!.loaded.E1).toBe(false);
    expect(sim.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(sim.states[1]!.coupled).toEqual([["L1"], ["C5", "C4", "C3", "C2", "C1"], ["E1"]]);
    expect(occupies(sim.states[2]!, "L1")).toEqual([{ track: "SPUR1", fromFt: 950, toFt: 1030 }]);
    expect(sim.states[3]!.coupled).toEqual([["L1", "E1"], ["C5", "C4", "C3", "C2", "C1"]]);
    expect(sim.states[4]!.coupled).toEqual([["L1"], ["C5", "C4", "C3", "C2", "C1"], ["E1"]]);
    expect(sim.steps[3]!.verb).toBe("couple");
    expect(sim.steps[4]!.verb).toBe("cut_off");
  });

  test("a step naming deleted equipment is needs_attention; later steps still run", () => {
    const sim = run(demoWith([
      { id: "W1", actor: "railroad", do: "shove", cars: ["GHOST"], to: "RACKS", via: ["S1"], text: "", spot: 5 },
      { id: "W2", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", via: ["S1"], text: "", spot: 5 }
    ]));
    expect(sim.steps[1]!.status).toBe("needs_attention");
    expect(sim.steps[1]!.reason).toContain("GHOST");
    expect(sim.steps[1]!.moved).toEqual([]);
    expect(sim.states[1]!).toEqual(sim.states[0]!);
    expect(sim.steps[2]!.status).toBe("ok");
    expect(occupies(sim.states[2]!, "C1")).toEqual([{ track: "SPUR1", fromFt: 970, toFt: 1030 }]);
  });

  test("editing the shove to stop on MAIN makes the couple step needs_attention", () => {
    const edited = cloneJson(demo);
    const shove = edited.work[0]!;
    if (shove.do !== "shove") throw new Error("demo W1 should be the shove");
    delete shove.spot;
    // The edited move stops short of S1, so the via S1 goes too: a via the route cannot pass is route_not_established.
    delete shove.via;
    shove.to = "MAIN";
    shove.stop = { track: "MAIN", ft: 500, end: "lead" };
    const sim = run(edited);
    expect(sim.steps.map((s) => s.stepId)).toEqual(["arrival", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "departure"]);
    expect(sim.steps[1]!.status).toBe("ok");
    expect(occupies(sim.states[1]!, "C1")).toEqual([{ track: "MAIN", fromFt: 440, toFt: 500 }]);
    expect(sim.steps[6]!.status).toBe("needs_attention");
    expect(sim.states[6]!.coupled).toEqual([["L1"], ["C5", "C4", "C3", "C2", "C1"]]);
    expect(sim.states[6]!.places).toEqual(sim.states[5]!.places);
  });

  test("a stale via the edited shove never reaches is route_not_established, the cars still land where asked, and the couple step is needs_attention", () => {
    const edited = cloneJson(demo);
    const shove = edited.work[0]!;
    if (shove.do !== "shove") throw new Error("demo W1 should be the shove");
    delete shove.spot;
    shove.to = "MAIN";
    shove.stop = { track: "MAIN", ft: 500, end: "lead" };
    expect(shove.via).toEqual(["S1"]);
    const sim = run(edited);
    expect(sim.steps[1]!.status).toBe("route_not_established");
    expect(sim.steps[1]!.travel).toBeNull();
    expect(sim.steps[1]!.moved).toEqual(["L1", "C5", "C4", "C3", "C2", "C1"]);
    expect(occupies(sim.states[1]!, "C1")).toEqual([{ track: "MAIN", fromFt: 440, toFt: 500 }]);
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "MAIN", fromFt: 120, toFt: 200 }]);
    expect(sim.steps[6]!.stepId).toBe("W6");
    expect(sim.steps[6]!.status).toBe("needs_attention");
    expect(sim.states[6]!.coupled).toEqual([["L1"], ["C5", "C4", "C3", "C2", "C1"]]);
  });

  test("two locos: run_light naming L2 moves only L2", () => {
    const sim = run(plan({
      locos: 2,
      work: [
        { id: "W1", actor: "railroad", do: "cut_off", cars: ["L2"], text: "" },
        { id: "W2", actor: "railroad", do: "run_light", cars: ["L2"], to: "offstage", text: "", stop: { offstage: "arrival_end" } }
      ]
    }));
    expect(sim.states[0]!.coupled).toEqual([["L2", "L1", "C5", "C4", "C3", "C2", "C1"]]);
    // Two locos make a 460 ft train, so S1 sits at 660 and the head stops at 560.
    expect(occupies(sim.states[0]!, "L2")).toEqual([{ track: "MAIN", fromFt: 100, toFt: 180 }]);
    expect(occupies(sim.states[0]!, "C1")).toEqual([{ track: "MAIN", fromFt: 500, toFt: 560 }]);
    expect(sim.steps[1]!.status).toBe("ok");
    expect(sim.states[1]!.coupled).toEqual([["L1", "C5", "C4", "C3", "C2", "C1"], ["L2"]]);
    expect(sim.steps[2]!.status).toBe("ok");
    expect(sim.steps[2]!.moved).toEqual(["L2"]);
    expect(sim.steps[2]!.verb).toBe("run_light");
    expect(sim.states[2]!.places.L2).toEqual({ offstage: "arrival_end" });
    expect(occupies(sim.states[2]!, "L1")).toEqual([{ track: "MAIN", fromFt: 180, toFt: 260 }]);
  });

  test("run_light while coupled to cars is needs_attention and nothing moves", () => {
    const sim = run(plan({
      work: [{ id: "W1", actor: "railroad", do: "run_light", to: "offstage", text: "", stop: { offstage: "arrival_end" } }]
    }));
    expect(sim.steps[1]!.status).toBe("needs_attention");
    expect(sim.steps[1]!.moved).toEqual([]);
    expect(sim.states[1]!.places).toEqual(sim.states[0]!.places);
  });

  test("uncouple between two adjacent cars splits there; a pair that is not adjacent is needs_attention", () => {
    const sim = run(plan({
      work: [
        { id: "W1", actor: "railroad", do: "uncouple", between: ["C3", "C2"], text: "" },
        { id: "W2", actor: "railroad", do: "uncouple", between: ["C5", "C1"], text: "" }
      ]
    }));
    expect(sim.steps[1]!.status).toBe("ok");
    expect(sim.states[1]!.coupled).toEqual([["L1", "C5", "C4", "C3"], ["C2", "C1"]]);
    expect(sim.steps[2]!.status).toBe("needs_attention");
    expect(sim.states[2]!.coupled).toEqual(sim.states[1]!.coupled);
  });

  test("departure naming cars that are not coupled to the locos is needs_attention, and the coupled part still leaves", () => {
    const edited = cloneJson(demo);
    edited.work = edited.work.slice(0, 3);
    const sim = run(edited);
    const dep = sim.steps[sim.steps.length - 1]!;
    expect(dep.stepId).toBe("departure");
    expect(dep.status).toBe("needs_attention");
    expect(dep.reason).toContain("LOADS");
    const last = sim.states[sim.states.length - 1]!;
    expect(last.places.L1).toEqual({ offstage: "arrival_end" });
    expect(last.places.C1).toEqual({ occupies: [{ track: "SPUR1", fromFt: 970, toFt: 1030 }] });
  });

  test("departure in the arrival direction leaves by the far end", () => {
    const edited = cloneJson(demo);
    edited.work = [];
    edited.departure = { direction: "eastbound", text: "" };
    const sim = run(edited);
    const dep = sim.steps[1]!;
    expect(dep.status).toBe("ok");
    expect(sim.states[1]!.places.L1).toEqual({ offstage: "far_end" });
    expect(sim.states[1]!.places.C1).toEqual({ offstage: "far_end" });
    // The lead runs from 480 to the main's far end (1670, where SPUR1 ends) plus the 380 ft train: 2050.
    expect(dep.travel).toEqual([{ track: "MAIN", fromFt: 480, toFt: 2050 }]);
  });

  test("a trailing switch flips facing: cars shoved down through S2 onto SPUR2 face down", () => {
    const sim = run(plan({
      tracks: [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR2", role: "spur", lengthFt: 500, end: "buffer_stop" }
      ],
      switches: [{ id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing", order: 1 }],
      work: [
        { id: "W1", actor: "railroad", do: "pull", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 1000, end: "lead" } },
        { id: "W2", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR2", via: ["S2"], text: "", stop: { track: "SPUR2", ft: 400, end: "lead" } }
      ]
    }));
    expect(sim.steps[1]!.status).toBe("ok");
    expect(sim.steps[2]!.status).toBe("ok");
    expect(sim.steps[2]!.verb).toBe("pull");
    expect(occupies(sim.states[2]!, "L1")).toEqual([{ track: "SPUR2", fromFt: 320, toFt: 400 }]);
    expect(occupies(sim.states[2]!, "C1")).toEqual([{ track: "SPUR2", fromFt: 20, toFt: 80 }]);
    expect(sim.states[2]!.facing.L1).toBe("down");
    expect(sim.states[2]!.facing.C1).toBe("down");
    expect(sim.states[2]!.coupled).toEqual([["C1", "C2", "C3", "C4", "C5", "L1"]]);
  });
});

describe("simulate: final review fixes", () => {
  test("a via naming a switch that is not in the plan is needs_attention with a plain reason, and nothing moves", () => {
    const sim = run(plan({
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S9"], text: "", stop: { track: "SPUR1", ft: 600, end: "lead" } }]
    }));
    expect(sim.steps[1]!.status).toBe("needs_attention");
    expect(sim.steps[1]!.reason).toBe('switch "S9" is not in this plan');
    expect(sim.steps[1]!.moved).toEqual([]);
    expect(sim.states[1]!.places).toEqual(sim.states[0]!.places);
  });

  test("an expanded set_out shoves the cars to the spot and then cuts the loco off", () => {
    const sim = run(demoWith([{ id: "W1", actor: "railroad", do: "set_out", cars: ["LOADS"], to: "RACKS", via: ["S1"], spot: 5, text: "Set out." }]));
    expect(sim.steps.map((s) => s.stepId)).toEqual(["arrival", "W1", "W1b", "departure"]);
    expect(sim.steps.map((s) => s.verb)).toEqual(["arrival", "shove", "cut_off", "departure"]);
    expect(sim.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "needs_attention"]);
    expect(occupies(sim.states[1]!, "C1")).toEqual([{ track: "SPUR1", fromFt: 970, toFt: 1030 }]);
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "SPUR1", fromFt: 650, toFt: 730 }]);
    expect(sim.states[1]!.coupled).toEqual([["L1", "C5", "C4", "C3", "C2", "C1"]]);
    expect(sim.states[2]!.coupled).toEqual([["L1"], ["C5", "C4", "C3", "C2", "C1"]]);
    expect(sim.states[2]!.places).toEqual(sim.states[1]!.places);
  });

  test("an expanded pick_up couples to the on-site car and then pulls it out beyond the switch", () => {
    const sim = run(plan({
      onSite: [{ id: "EMPTIES", cars: 1, state: "empty", at: "SPUR1", list: [{ id: "E1" }] }],
      work: [
        { id: "W1", actor: "railroad", do: "cut_off", text: "" },
        { id: "W2", actor: "railroad", do: "run_light", to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 1030, end: "lead" } },
        { id: "W3", actor: "railroad", do: "pick_up", cars: ["EMPTIES"], to: "MAIN", via: ["S1"], text: "Pick up.", stop: { beyond: "S1", ft: 50, end: "rear" } }
      ]
    }));
    expect(sim.steps.map((s) => s.stepId)).toEqual(["arrival", "W1", "W2", "W3", "W3b", "departure"]);
    expect(sim.steps.map((s) => s.verb)).toEqual(["arrival", "cut_off", "run_light", "couple", "pull", "departure"]);
    expect(sim.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(sim.states[3]!.coupled).toEqual([["L1", "E1"], ["C5", "C4", "C3", "C2", "C1"]]);
    // The rear (E1's far end) stops 50 ft short of S1 on the main; the loco leads 140 ft ahead of it.
    expect(occupies(sim.states[4]!, "E1")).toEqual([{ track: "MAIN", fromFt: 470, toFt: 530 }]);
    expect(occupies(sim.states[4]!, "L1")).toEqual([{ track: "MAIN", fromFt: 390, toFt: 470 }]);
    expect(sim.states[4]!.coupled).toEqual([["L1", "E1"], ["C5", "C4", "C3", "C2", "C1"]]);
  });

  test("an offstage end that cannot be reached in one move says so, naming the end and the main", () => {
    const p = plan({
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 600, end: "lead" } }]
    });
    p.departure = { direction: "eastbound", text: "Departs." };
    const sim = run(p);
    const dep = sim.steps[2]!;
    expect(dep.stepId).toBe("departure");
    expect(dep.status).toBe("route_not_established");
    expect(dep.reason).toBe("no route to the far end of MAIN in one move; a reversal is a separate step");
  });
});

describe("tier 2: runaround", () => {
  /** The test geometry plus a siding that rejoins between S2 and S3, past the spur. */
  function sidingPlan(work: WorkStep[]): PlanReading {
    return plan({
      tracks: [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
        { id: "SIDING", role: "siding", lengthFt: 600, end: "rejoins" }
      ],
      switches: [
        { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "MAIN", to: "SIDING", side: "right", approach: "facing", order: 2 },
        { id: "S3", on: "MAIN", to: "SIDING", side: "right", approach: "trailing", order: 3 }
      ],
      work
    });
  }

  test("runaround on the spur-with-runaround example plays as cut_off, run_light via both switches, couple and ends with the loco at the other end", () => {
    // S1 at 580, S2 at 980, S3 at 980 + 1180 = 2160. The train (380 ft) pulls up to stand between S2 and S3, then runs around.
    const sim = run(
      sidingPlan([
        { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 1900, end: "lead" } },
        { id: "W2", actor: "railroad", do: "runaround", text: "" }
      ])
    );
    const ids = sim.steps.map((s) => String(s.stepId));
    expect(ids).toEqual(["arrival", "W1", "W2a", "W2b", "W2c", "W2d", "W2e", "departure"]);
    expect(sim.steps.slice(2, 7).map((s) => s.verb)).toEqual(["cut_off", "run_light", "run_light", "run_light", "couple"]);
    expect(sim.steps.slice(2, 7).map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    // The through leg passes both of the siding's switches and runs along the siding.
    const through = sim.steps[4]!;
    expect(through.travel!.some((s) => s.track === "SIDING")).toBe(true);
    // Before: loco 1520..1600 behind the cars 1600..1900. After: coupled at the other end, 1900..1980.
    expect(occupies(sim.states[1]!, "L1")).toEqual([{ track: "MAIN", fromFt: 1520, toFt: 1600 }]);
    expect(occupies(sim.states[6]!, "L1")).toEqual([{ track: "MAIN", fromFt: 1900, toFt: 1980 }]);
    expect(sim.states[6]!.coupled).toEqual([["C5", "C4", "C3", "C2", "C1", "L1"]]);
    expect(sim.steps[7]!.status).toBe("ok");
  });

  test("runaround with no siding is needs_attention with NO_SIDING_REASON", () => {
    const sim = run(demoWith([{ id: "W1", actor: "railroad", do: "runaround", text: "" }]));
    expect(sim.steps.map((s) => s.stepId)).toEqual(["arrival", "W1", "departure"]);
    expect(sim.steps[1]!.status).toBe("needs_attention");
    expect(sim.steps[1]!.reason).toBe(NO_SIDING_REASON);
    expect(sim.states[1]!).toEqual(sim.states[0]!);
  });
});
