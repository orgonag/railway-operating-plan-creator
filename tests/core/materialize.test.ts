import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { cloneJson } from "../../src/core/schema/clone";
import type { Car, Cut, OnSiteCut, PlanReading, RailroadStep, WorkStep } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { groupsOf, initialOrder, materialize, unitsOf } from "../../src/core/engine/materialize";

const demo = validateFile(demoJson).plan as PlanReading;

function c(id: string, extra: Partial<Car> = {}): Car {
  return { id, ...extra };
}

interface PlanOverrides {
  cuts?: Cut[];
  onSite?: OnSiteCut[];
  work?: WorkStep[];
  locos?: PlanReading["consist"]["locos"];
  arrivalLocos?: "head" | "rear";
  carLength?: PlanReading["carLength"];
  locoLength?: PlanReading["locoLength"];
}

function plan(o: PlanOverrides = {}): PlanReading {
  return {
    schemaVersion: "1",
    title: "Test plan",
    arrival: {
      direction: "eastbound",
      enters: "left",
      on: "MAIN",
      locos: o.arrivalLocos ?? "rear",
      text: "Arrives."
    },
    ...(o.carLength ? { carLength: o.carLength } : {}),
    ...(o.locoLength ? { locoLength: o.locoLength } : {}),
    tracks: [
      { id: "MAIN", role: "main", end: "continues" },
      { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" }
    ],
    switches: [{ id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 }],
    facilities: [{ id: "RACKS", name: "Racks", kind: "unloading_racks", track: "SPUR1", lengthFt: 360, spots: 5 }],
    consist: {
      locos: o.locos ?? { count: 1 },
      cuts: o.cuts ?? [{ id: "LOADS", cars: 3, state: "loaded", for: "RACKS" }],
      ...(o.onSite ? { onSite: o.onSite } : {})
    },
    work: o.work ?? [
      { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", via: ["S1"], text: "Shove.", spot: 3 },
      { id: "W2", actor: "railroad", do: "cut_off", cars: ["LOADS"], text: "Cut off." },
      { id: "W3", actor: "railroad", do: "run_light", to: "offstage", via: ["S1"], text: "Leave.", stop: { offstage: "arrival_end" } }
    ],
    departure: { direction: "westbound", cars: ["LOADS"], text: "Departs." }
  };
}

describe("materialize: equipment ids", () => {
  test("counted cars get explicit ids in head-to-rear order", () => {
    const m = materialize(plan({ cuts: [{ id: "LOADS", cars: 3, state: "loaded" }] })).plan;
    expect(m.consist.cuts[0]!.list!.map((x) => x.id)).toEqual(["LOADS-1", "LOADS-2", "LOADS-3"]);
    expect(m.consist.cuts[0]!.cars).toBe(3);
  });

  test("locos get ids L1..Ln and count equals the list length", () => {
    const m = materialize(plan({ locos: { count: 2, type: "four_axle" } })).plan;
    expect(m.consist.locos.list!.map((l) => l.id)).toEqual(["L1", "L2"]);
    expect(m.consist.locos.count).toBe(2);
  });

  test("materialize is idempotent", () => {
    for (const p of [plan(), demo, plan({ locos: { count: 2 }, onSite: [{ id: "EMPTIES", cars: 2, state: "empty", at: "RACKS" }] })]) {
      const once = materialize(p).plan;
      expect(materialize(once).plan).toEqual(once);
      expect(materialize(cloneJson(once)).plan).toEqual(once);
    }
  });

  test("materialize does not mutate its input", () => {
    const p = plan();
    const before = cloneJson(p);
    materialize(p);
    expect(p).toEqual(before);
  });

  test("remove a middle car and reorder two steps, save, reopen: ids survive", () => {
    const m = materialize(plan()).plan;
    m.consist.cuts[0]!.list!.splice(1, 1);
    [m.work[0], m.work[1]] = [m.work[1]!, m.work[0]!];
    const reopened = materialize(JSON.parse(JSON.stringify(m))).plan;
    expect(reopened.consist.cuts[0]!.list!.map((x) => x.id)).toEqual(["LOADS-1", "LOADS-3"]);
    expect(reopened.consist.cuts[0]!.cars).toBe(2);
    expect(reopened.work.map((w) => w.id)).toEqual(["W2", "W1", "W3"]);
  });

  test("removing L1 keeps L2 as L2", () => {
    const m = materialize(plan({ locos: { count: 2 } })).plan;
    m.consist.locos.list!.splice(0, 1);
    const reopened = materialize(cloneJson(m)).plan;
    expect(reopened.consist.locos.list!.map((l) => l.id)).toEqual(["L2"]);
    expect(reopened.consist.locos.count).toBe(1);
  });

  test("list wins over count and the mismatch is a problem", () => {
    const r = materialize(plan({ cuts: [{ id: "A", cars: 5, state: "empty", list: [c("X1"), c("X2"), c("X3"), c("X4")] }] }));
    expect(r.plan.consist.cuts[0]!.list!.map((x) => x.id)).toEqual(["X1", "X2", "X3", "X4"]);
    expect(r.plan.consist.cuts[0]!.cars).toBe(4);
    expect(r.problems[0]!.path).toBe("consist.cuts[0].cars");
    expect(r.problems[0]!.repaired).toBe(true);
  });

  test("locos list wins over locos count and the mismatch is a problem", () => {
    const r = materialize(plan({ locos: { count: 3, list: [{ id: "GP1" }] } }));
    expect(r.plan.consist.locos.list!.map((l) => l.id)).toEqual(["GP1"]);
    expect(r.plan.consist.locos.count).toBe(1);
    expect(r.problems.map((p) => p.path)).toContain("consist.locos.count");
  });

  test("new ids never collide with existing ones", () => {
    const r = materialize(
      plan({
        cuts: [
          { id: "OTHER", cars: 1, state: "empty", list: [c("LOADS-1")] },
          { id: "LOADS", cars: 2, state: "loaded" }
        ]
      })
    );
    const loads = r.plan.consist.cuts[1]!.list!.map((x) => x.id);
    expect(loads).toEqual(["LOADS-2", "LOADS-3"]);
    const all = unitsOf(r.plan).map((u) => u.id);
    expect(new Set(all).size).toBe(all.length);
  });

  test("a loco id already in use is skipped when allocating", () => {
    const r = materialize(plan({ locos: { count: 2 }, cuts: [{ id: "L1", cars: 1, state: "empty" }] }));
    const locoIds = r.plan.consist.locos.list!.map((l) => l.id);
    expect(locoIds).toEqual(["L2", "L3"]);
    const all = unitsOf(r.plan).map((u) => u.id);
    expect(new Set(all).size).toBe(all.length);
  });

  test("on-site cars are materialized too", () => {
    const m = materialize(plan({ onSite: [{ id: "EMPTIES", cars: 2, state: "empty", at: "RACKS" }] })).plan;
    expect(m.consist.onSite![0]!.list!.map((x) => x.id)).toEqual(["EMPTIES-1", "EMPTIES-2"]);
  });
});

describe("materialize: step ids and shortcut expansion", () => {
  test("a step without an id gets one that collides with nothing", () => {
    const steps = plan().work;
    const bare = { ...steps[1]! } as Partial<WorkStep>;
    delete bare.id;
    const p = plan({ work: [steps[0]!, bare as WorkStep, steps[2]!] });
    const m = materialize(p).plan;
    expect(m.work.map((w) => w.id)).toEqual(["W1", "S2", "W3"]);
  });

  test("set_out is saved as a move then a cut_off, each with its own id", () => {
    const p = plan({
      work: [
        { id: "W1", actor: "railroad", do: "set_out", cars: ["LOADS"], to: "RACKS", via: ["S1"], spot: 3, text: "Set out the loads." },
        { id: "W2", actor: "railroad", do: "run_light", to: "offstage", via: ["S1"], text: "Leave.", stop: { offstage: "arrival_end" } }
      ]
    });
    const m = materialize(p).plan;
    expect(m.work.map((w) => w.id)).toEqual(["W1", "W1b", "W2"]);
    expect(m.work[0]).toEqual({
      id: "W1",
      actor: "railroad",
      do: "shove",
      cars: ["LOADS"],
      to: "RACKS",
      via: ["S1"],
      spot: 3,
      text: "Set out the loads."
    });
    expect(m.work[1]).toEqual({ id: "W1b", actor: "railroad", do: "cut_off", cars: ["LOADS"], text: "" });
  });

  test("set_out keeps stop and callout on the move", () => {
    const p = plan({
      work: [
        {
          id: "W1",
          actor: "railroad",
          do: "set_out",
          cars: ["LOADS"],
          to: "SPUR1",
          stop: { track: "SPUR1", ft: 400, end: "lead" },
          callout: { text: "Here", at: "S1" },
          text: "Set out."
        }
      ]
    });
    const m = materialize(p).plan;
    const move = m.work[0] as RailroadStep;
    expect(move.do).toBe("shove");
    expect(move.stop).toEqual({ track: "SPUR1", ft: 400, end: "lead" });
    expect(move.callout).toEqual({ text: "Here", at: "S1" });
    expect(m.work[1]!.callout).toBeUndefined();
  });

  test("pick_up is saved as a couple then a move", () => {
    const p = plan({
      work: [
        {
          id: "W1",
          actor: "railroad",
          do: "pick_up",
          cars: ["LOADS"],
          to: "MAIN",
          via: ["S1"],
          stop: { beyond: "S1", ft: 50, end: "rear" },
          text: "Pick up the empties."
        }
      ]
    });
    const m = materialize(p).plan;
    expect(m.work.map((w) => w.id)).toEqual(["W1", "W1b"]);
    expect(m.work[0]).toEqual({ id: "W1", actor: "railroad", do: "couple", cars: ["LOADS"], text: "Pick up the empties." });
    expect(m.work[1]).toEqual({
      id: "W1b",
      actor: "railroad",
      do: "pull",
      cars: ["LOADS"],
      to: "MAIN",
      via: ["S1"],
      stop: { beyond: "S1", ft: 50, end: "rear" },
      text: ""
    });
  });

  test("an expanded step id that collides takes the next suffix", () => {
    const p = plan({
      work: [
        { id: "W1", actor: "railroad", do: "set_out", cars: ["LOADS"], to: "RACKS", text: "Set out." },
        { id: "W1b", actor: "railroad", do: "run_light", to: "offstage", text: "Leave.", stop: { offstage: "arrival_end" } }
      ]
    });
    const m = materialize(p).plan;
    expect(m.work.map((w) => w.id)).toEqual(["W1", "W1c", "W1b"]);
  });

  test("expanded steps share no arrays: editing the first leaves the second untouched", () => {
    const setOut = materialize(
      plan({ work: [{ id: "W1", actor: "railroad", do: "set_out", cars: ["LOADS"], to: "RACKS", via: ["S1"], text: "Set out." }] })
    ).plan;
    const [first, second] = setOut.work as [RailroadStep, RailroadStep];
    first.cars!.push("EXTRA");
    expect(second.cars).toEqual(["LOADS"]);

    const pickUp = materialize(
      plan({
        work: [
          {
            id: "W1",
            actor: "railroad",
            do: "pick_up",
            cars: ["LOADS"],
            to: "MAIN",
            via: ["S1"],
            stop: { beyond: "S1", ft: 50, end: "rear" },
            callout: { text: "Here" },
            text: "Pick up."
          }
        ]
      })
    ).plan;
    const [couple, move] = pickUp.work as [RailroadStep, RailroadStep];
    couple.cars!.push("EXTRA");
    expect(move.cars).toEqual(["LOADS"]);
    move.cars!.push("MORE");
    expect(couple.cars).toEqual(["LOADS", "EXTRA"]);
    expect(move.via).not.toBe(couple.via);
    expect(move.stop).toEqual({ beyond: "S1", ft: 50, end: "rear" });
  });

  test("runaround is left as one step", () => {
    const p = plan({ work: [{ id: "W1", actor: "railroad", do: "runaround", cars: ["LOADS"], text: "Run around." }] });
    const m = materialize(p).plan;
    expect(m.work).toEqual([{ id: "W1", actor: "railroad", do: "runaround", cars: ["LOADS"], text: "Run around." }]);
  });

  test("customer and note steps pass through untouched", () => {
    const work: WorkStep[] = [
      { id: "W1", actor: "customer", do: "unload", cars: ["LOADS"], text: "Unload." },
      { id: "W2", do: "note", text: "A note." }
    ];
    const m = materialize(plan({ work })).plan;
    expect(m.work).toEqual(work);
  });
});

describe("unitsOf, initialOrder, groupsOf", () => {
  test("demo: initial order is C1..C5 then L1; loco is L1 at 80 ft; cars 60 ft", () => {
    const m = materialize(demo).plan;
    expect(initialOrder(m)).toEqual(["C1", "C2", "C3", "C4", "C5", "L1"]);
    const units = unitsOf(m);
    const l1 = units.find((u) => u.id === "L1")!;
    expect(l1.lengthFt).toBe(80);
    expect(l1.kind).toBe("loco");
    expect(l1.type).toBe("six_axle");
    const c1 = units.find((u) => u.id === "C1")!;
    expect(c1).toEqual({ id: "C1", kind: "car", type: "covered_hopper_large", lengthFt: 60, mark: "ABCX", number: "1001" });
  });

  test("locos at the head come first in the initial order", () => {
    const m = materialize(plan({ arrivalLocos: "head", locos: { count: 2 } })).plan;
    expect(initialOrder(m)).toEqual(["L1", "L2", "LOADS-1", "LOADS-2", "LOADS-3"]);
  });

  test("cuts follow list order and on-site cars are not in the initial order", () => {
    const m = materialize(
      plan({
        cuts: [
          { id: "A", cars: 1, state: "loaded" },
          { id: "B", cars: 2, state: "empty" }
        ],
        onSite: [{ id: "ON", cars: 1, state: "empty", at: "RACKS" }]
      })
    ).plan;
    expect(initialOrder(m)).toEqual(["A-1", "B-1", "B-2", "L1"]);
    expect(unitsOf(m).map((u) => u.id)).toContain("ON-1");
  });

  test("length defaults: unit, then group, then plan, then 60 or 80", () => {
    const m = materialize(
      plan({
        carLength: { ft: 70 },
        locoLength: { ft: 90 },
        locos: { count: 2, list: [{ id: "L1", lengthFt: 85 }, { id: "L2" }] },
        cuts: [
          { id: "A", cars: 2, state: "loaded", carLengthFt: 50, list: [c("A1", { lengthFt: 55 }), c("A2")] },
          { id: "B", cars: 1, state: "empty" }
        ]
      })
    ).plan;
    const by = Object.fromEntries(unitsOf(m).map((u) => [u.id, u.lengthFt]));
    expect(by).toEqual({ L1: 85, L2: 90, A1: 55, A2: 50, "B-1": 70 });

    const bare = materialize(plan({ locos: { count: 1 }, cuts: [{ id: "A", cars: 1, state: "loaded" }] })).plan;
    const bareBy = Object.fromEntries(unitsOf(bare).map((u) => [u.id, u.lengthFt]));
    expect(bareBy).toEqual({ L1: 80, "A-1": 60 });
  });

  test("type defaults: unit, then group, then generic or six_axle", () => {
    const m = materialize(
      plan({
        locos: { count: 2, type: "switcher", list: [{ id: "L1", type: "four_axle" }, { id: "L2" }] },
        cuts: [
          { id: "A", cars: 2, state: "loaded", carType: "gondola", list: [c("A1", { type: "boxcar_50" }), c("A2")] },
          { id: "B", cars: 1, state: "empty" }
        ]
      })
    ).plan;
    const by = Object.fromEntries(unitsOf(m).map((u) => [u.id, u.type]));
    expect(by).toEqual({ L1: "four_axle", L2: "switcher", A1: "boxcar_50", A2: "gondola", "B-1": "generic" });

    const bare = materialize(plan({ locos: { count: 1 }, cuts: [{ id: "A", cars: 1, state: "loaded" }] })).plan;
    expect(unitsOf(bare).map((u) => u.type)).toEqual(["six_axle", "generic"]);
  });

  test("groupsOf maps each cut and on-site cut to its car ids", () => {
    const m = materialize(
      plan({
        cuts: [
          { id: "A", cars: 2, state: "loaded" },
          { id: "B", cars: 1, state: "empty", list: [c("X9")] }
        ],
        onSite: [{ id: "ON", cars: 1, state: "empty", at: "RACKS" }]
      })
    ).plan;
    expect(groupsOf(m)).toEqual({ A: ["A-1", "A-2"], B: ["X9"], ON: ["ON-1"] });
  });
});
