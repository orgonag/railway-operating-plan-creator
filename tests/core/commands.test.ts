import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { applyCommand, applyCommands, type Command } from "../../src/core/commands/commands";
import { newId } from "../../src/core/commands/ids";
import { COMMANDS } from "../../src/core/commands/schemas";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import { cloneJson } from "../../src/core/schema/clone";
import type { PlanReading, RailroadStep } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

const ALL_COMMAND_NAMES: Command["name"][] = [
  "setTitle",
  "setArrival",
  "setDeparture",
  "setLocos",
  "addTurnout",
  "flipTurnout",
  "setSwitchDistance",
  "setTrack",
  "deleteTrack",
  "addFacility",
  "setFacility",
  "deleteFacility",
  "addCars",
  "placeCars",
  "setCar",
  "deleteCar",
  "addStep",
  "setStep",
  "deleteStep",
  "reorderStep"
];

const EXAMPLES: Record<Command["name"], Command> = {
  setTitle: { name: "setTitle", title: "A plan", description: "What it shows" },
  setArrival: { name: "setArrival", direction: "westbound", enters: "right", locos: "head", text: "Arrives", stop: null },
  setDeparture: { name: "setDeparture", direction: "eastbound", text: "Leaves", cars: ["LOADS"] },
  setLocos: { name: "setLocos", count: 2, type: "four_axle", lengthFt: 70 },
  addTurnout: { name: "addTurnout", trackId: "MAIN", distanceFt: 1400, side: "right", approach: "trailing" },
  flipTurnout: { name: "flipTurnout", switchId: "S1", axis: "up_down" },
  setSwitchDistance: { name: "setSwitchDistance", switchId: "S1", distanceFt: 600 },
  setTrack: { name: "setTrack", trackId: "SPUR1", label: "Spur", role: "siding", lengthFt: 700, end: "buffer_stop" },
  deleteTrack: { name: "deleteTrack", trackId: "SPUR1" },
  addFacility: { name: "addFacility", trackId: "SPUR1", startFt: 300, lengthFt: 300, label: "Dock", kind: "warehouse" },
  setFacility: { name: "setFacility", facilityId: "RACKS", label: "Racks", kind: "unloading_racks", startFt: 700, lengthFt: 360, spots: 6 },
  deleteFacility: { name: "deleteFacility", facilityId: "RACKS" },
  addCars: { name: "addCars", count: 3, type: "covered_hopper_large", state: "loaded", for: "RACKS" },
  placeCars: { name: "placeCars", count: 2, type: "boxcar_60", state: "empty", at: "RACKS", spot: 1 },
  setCar: { name: "setCar", carId: "C1", type: "tank_general", state: "empty", mark: "ABCX", number: "1", lengthFt: null },
  deleteCar: { name: "deleteCar", carId: "C1" },
  addStep: { name: "addStep", step: { actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", text: "Shove" }, index: 0 },
  setStep: { name: "setStep", stepId: "W1", patch: { text: "New text", spot: 4 } },
  deleteStep: { name: "deleteStep", stepId: "W1" },
  reorderStep: { name: "reorderStep", stepId: "W1", index: 3 }
};

function stepTo(w: PlanReading["work"][number]): string | undefined {
  return (w as RailroadStep).to;
}

describe("applyCommand", () => {
  test("addTurnout on the demo adds S2 and T1 with a 400 ft spur and a buffer stop", () => {
    const r = applyCommand(demo, { name: "addTurnout", trackId: "MAIN", distanceFt: 1400, side: "right", approach: "trailing" });
    expect(r.created).toEqual(["T1", "S2"]);
    expect(r.plan.switches[1]).toMatchObject({
      id: "S2",
      on: "MAIN",
      to: "T1",
      side: "right",
      approach: "trailing",
      order: 2,
      distanceFt: 1400
    });
    expect(r.plan.tracks[2]).toEqual({ id: "T1", role: "spur", lengthFt: 400, end: "buffer_stop" });
    expect(r.problems).toEqual([]);
    expect(demo.switches).toHaveLength(1);
  });

  test("flipTurnout up_down toggles side; left_right toggles approach", () => {
    const a = applyCommand(demo, { name: "flipTurnout", switchId: "S1", axis: "up_down" }).plan;
    expect(a.switches[0]).toMatchObject({ side: "right", approach: "facing" });
    const b = applyCommand(a, { name: "flipTurnout", switchId: "S1", axis: "left_right" }).plan;
    expect(b.switches[0]).toMatchObject({ side: "right", approach: "trailing" });
    expect(demo.switches[0]).toMatchObject({ side: "left", approach: "facing" });
  });

  test("setSwitchDistance and setTrack change only the named fields", () => {
    const a = applyCommand(demo, { name: "setSwitchDistance", switchId: "S1", distanceFt: 900 }).plan;
    expect(a.switches[0]!.distanceFt).toBe(900);
    const b = applyCommand(a, { name: "setTrack", trackId: "SPUR1", lengthFt: 650, role: "siding" }).plan;
    expect(b.tracks[1]).toMatchObject({ id: "SPUR1", name: "Customer siding", role: "siding", lengthFt: 650, end: "buffer_stop" });
  });

  test("deleteTrack SPUR1 removes S1 and RACKS and leaves the shove step naming RACKS", () => {
    const r = applyCommand(demo, { name: "deleteTrack", trackId: "SPUR1" });
    expect(r.plan.tracks.map((t) => t.id)).toEqual(["MAIN"]);
    expect(r.plan.switches).toEqual([]);
    expect(r.plan.facilities).toEqual([]);
    expect(r.plan.work.some((w) => stepTo(w) === "RACKS")).toBe(true);
    expect(validateFile(r.plan).plan).not.toBeNull();
  });

  test("deleteTrack leaves steps that name it; the plan still validates and the step is needs_attention", () => {
    const r = applyCommand(demo, { name: "deleteTrack", trackId: "SPUR1" });
    const sim = simulate(r.plan, buildGraph(r.plan));
    expect(sim.steps[1]!.status).toBe("needs_attention");
  });

  test("deleteTrack removes branches reached only through the deleted track", () => {
    const withBranch = applyCommands(demo, [
      { name: "addTurnout", trackId: "SPUR1", distanceFt: 500, side: "left", approach: "facing", branchId: "T9" }
    ]).plan;
    const r = applyCommand(withBranch, { name: "deleteTrack", trackId: "SPUR1" });
    expect(r.plan.tracks.map((t) => t.id)).toEqual(["MAIN"]);
    expect(r.plan.switches).toEqual([]);
  });

  test("addFacility, setFacility and deleteFacility", () => {
    const a = applyCommand(demo, { name: "addFacility", trackId: "SPUR1", startFt: 300, lengthFt: 240, label: "Dock", kind: "warehouse" });
    expect(a.created).toEqual(["F1"]);
    expect(a.plan.facilities[1]).toEqual({ id: "F1", name: "Dock", kind: "warehouse", track: "SPUR1", startFt: 300, lengthFt: 240 });
    const b = applyCommand(a.plan, { name: "setFacility", facilityId: "F1", lengthFt: 300, spots: 4 }).plan;
    expect(b.facilities[1]).toMatchObject({ lengthFt: 300, spots: 4, startFt: 300 });
    const c = applyCommand(b, { name: "deleteFacility", facilityId: "RACKS" }).plan;
    expect(c.facilities.map((f) => f.id)).toEqual(["F1"]);
    expect(c.work.some((w) => stepTo(w) === "RACKS")).toBe(true);
  });

  test("addCars 3 covered hoppers loaded makes CUT1 with C6, C7, C8", () => {
    const r = applyCommand(demo, { name: "addCars", count: 3, type: "covered_hopper_large", state: "loaded" });
    expect(r.created).toEqual(["CUT1", "C6", "C7", "C8"]);
    const cut = r.plan.consist.cuts[1]!;
    expect(cut).toMatchObject({ id: "CUT1", cars: 3, state: "loaded", carType: "covered_hopper_large" });
    expect(cut.list!.map((c) => c.id)).toEqual(["C6", "C7", "C8"]);
    expect(demo.consist.cuts).toHaveLength(1);
  });

  test("placeCars 2 empties at RACKS spot 1 appends an onSite cut", () => {
    const r = applyCommand(demo, { name: "placeCars", count: 2, type: "boxcar_60", state: "empty", at: "RACKS", spot: 1 });
    expect(r.created).toEqual(["CUT1", "C6", "C7"]);
    expect(r.plan.consist.onSite).toHaveLength(1);
    expect(r.plan.consist.onSite![0]).toMatchObject({ id: "CUT1", cars: 2, state: "empty", carType: "boxcar_60", at: "RACKS", spot: 1 });
    expect(r.plan.consist.onSite![0]!.list!.map((c) => c.id)).toEqual(["C6", "C7"]);
  });

  test("deleteCar C3 shrinks LOADS to 4 cars; deleting the last car removes the cut", () => {
    const a = applyCommand(demo, { name: "deleteCar", carId: "C3" }).plan;
    expect(a.consist.cuts[0]!.cars).toBe(4);
    expect(a.consist.cuts[0]!.list!.map((c) => c.id)).toEqual(["C1", "C2", "C4", "C5"]);
    const gone = applyCommands(a, ["C1", "C2", "C4", "C5"].map((carId) => ({ name: "deleteCar", carId }) as Command)).plan;
    expect(gone.consist.cuts).toEqual([]);
  });

  test("setCar lengthFt null deletes the length; other fields set", () => {
    const a = applyCommand(demo, { name: "setCar", carId: "C1", lengthFt: 89, mark: "XYZ", number: "77" }).plan;
    expect(a.consist.cuts[0]!.list![0]).toMatchObject({ id: "C1", lengthFt: 89, mark: "XYZ", number: "77" });
    const b = applyCommand(a, { name: "setCar", carId: "C1", lengthFt: null, state: "empty" }).plan;
    expect(b.consist.cuts[0]!.list![0]).not.toHaveProperty("lengthFt");
    expect(b.consist.cuts[0]!.list![0]!.state).toBe("empty");
  });

  test("setLocos count 2 keeps L1 and adds L2 when materialized", () => {
    const r = applyCommand(demo, { name: "setLocos", count: 2, type: "four_axle" }).plan;
    expect(r.consist.locos).toMatchObject({ count: 2, type: "four_axle" });
    const m = materialize(r).plan;
    expect(m.consist.locos.list!.map((l) => l.id)).toEqual(["L1", "L2"]);
  });

  test("addStep without index appends and allocates ST1; reorderStep moves it to 0", () => {
    const a = applyCommand(demo, { name: "addStep", step: { actor: "railroad", do: "note", text: "Hold" } });
    expect(a.created).toEqual(["ST1"]);
    expect(a.plan.work[a.plan.work.length - 1]).toEqual({ id: "ST1", actor: "railroad", do: "note", text: "Hold" });
    const b = applyCommand(a.plan, { name: "reorderStep", stepId: "ST1", index: 0 }).plan;
    expect(b.work[0]!.id).toBe("ST1");
    expect(b.work).toHaveLength(demo.work.length + 1);
  });

  test("addStep with an index inserts there and keeps a given id", () => {
    const r = applyCommand(demo, { name: "addStep", step: { id: "MINE", actor: "railroad", do: "note", text: "x" }, index: 2 });
    expect(r.created).toEqual(["MINE"]);
    expect(r.plan.work[2]!.id).toBe("MINE");
  });

  test("setStep deletes keys patched to undefined; deleteStep removes", () => {
    const a = applyCommand(demo, { name: "setStep", stepId: "W1", patch: { text: "Shove them in", spot: undefined } }).plan;
    expect(a.work[0]).toMatchObject({ id: "W1", text: "Shove them in" });
    expect(a.work[0]).not.toHaveProperty("spot");
    const b = applyCommand(a, { name: "deleteStep", stepId: "W1" }).plan;
    expect(b.work.map((w) => w.id)).toEqual(["W2", "W3", "W4", "W5", "W6", "W7"]);
  });

  test("setArrival with stop null deletes the stop; setTitle and setDeparture set fields", () => {
    const a = applyCommand(demo, { name: "setArrival", stop: { track: "MAIN", ft: 500, end: "lead" }, enters: "right" }).plan;
    expect(a.arrival.stop).toEqual({ track: "MAIN", ft: 500, end: "lead" });
    expect(a.arrival.enters).toBe("right");
    const b = applyCommand(a, { name: "setArrival", stop: null }).plan;
    expect(b.arrival).not.toHaveProperty("stop");
    const c = applyCommands(b, [
      { name: "setTitle", title: "T", description: "D" },
      { name: "setDeparture", direction: "westbound", text: "Gone" }
    ]).plan;
    expect(c.title).toBe("T");
    expect(c.description).toBe("D");
    expect(c.departure).toMatchObject({ direction: "westbound", text: "Gone" });
  });

  test("unknown ids: plan unchanged, one problem with the command path", () => {
    const r = applyCommand(demo, { name: "setTrack", trackId: "NOPE", lengthFt: 500 });
    expect(r.plan).toEqual(demo);
    expect(r.problems).toEqual([{ path: "setTrack.trackId", message: "no track with id NOPE", repaired: false }]);
    expect(applyCommand(demo, { name: "setCar", carId: "NOPE", state: "empty" }).problems[0]!.path).toBe("setCar.carId");
    expect(applyCommand(demo, { name: "deleteStep", stepId: "NOPE" }).problems[0]!.message).toBe("no step with id NOPE");
  });

  test("applyCommands concatenates created ids and problems", () => {
    const r = applyCommands(demo, [
      { name: "addTurnout", trackId: "MAIN", distanceFt: 1400, side: "right", approach: "trailing" },
      { name: "setTrack", trackId: "NOPE" }
    ]);
    expect(r.created).toEqual(["T1", "S2"]);
    expect(r.problems).toHaveLength(1);
    expect(r.plan.tracks).toHaveLength(3);
  });

  test("newId skips ids already used anywhere in the plan", () => {
    expect(newId(demo, "S")).toBe("S2");
    expect(newId(demo, "C")).toBe("C6");
    expect(newId(demo, "L")).toBe("L2");
    expect(newId(demo, "W")).toBe("W8");
    expect(newId(demo, "F")).toBe("F1");
    const odd = cloneJson(demo);
    odd.tracks.push({ id: "T1", role: "spur" });
    expect(newId(odd, "T")).toBe("T2");
  });
});

describe("command schemas", () => {
  test("every command schema compiles with Ajv and accepts its example", () => {
    const ajv = new Ajv2020({ strict: true });
    expect(COMMANDS.map((c) => c.name).sort()).toEqual([...ALL_COMMAND_NAMES].sort());
    for (const doc of COMMANDS) {
      expect(doc.description.length, doc.name).toBeGreaterThan(10);
      const ok = ajv.validate(doc.schema, EXAMPLES[doc.name]);
      expect(ok, `${doc.name}: ${ajv.errorsText()}`).toBe(true);
    }
  });

  test("a schema rejects a command with the wrong name or a missing field", () => {
    const ajv = new Ajv2020({ strict: true });
    const addTurnout = COMMANDS.find((c) => c.name === "addTurnout")!;
    expect(ajv.validate(addTurnout.schema, { name: "setTitle", title: "x" })).toBe(false);
    expect(ajv.validate(addTurnout.schema, { name: "addTurnout", trackId: "MAIN" })).toBe(false);
  });
});

describe("property: random commands", () => {
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function allCarIds(plan: PlanReading): string[] {
    const out: string[] = [];
    for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) for (const c of cut.list ?? []) out.push(c.id);
    return out;
  }

  test("300 random commands on the demo keep the plan valid and never throw", () => {
    const rng = mulberry32(20261023);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]!;
    const maybeBogus = (ids: string[]): string => (rng() < 0.15 || ids.length === 0 ? "BOGUS" : pick(ids));
    let plan = demo;
    for (let i = 0; i < 300; i++) {
      const tracks = plan.tracks.map((t) => t.id);
      const switches = plan.switches.map((s) => s.id);
      const facilities = plan.facilities.map((f) => f.id);
      const cars = allCarIds(plan);
      const steps = plan.work.map((w) => w.id);
      const makers: (() => Command)[] = [
        () => ({ name: "addTurnout", trackId: maybeBogus(tracks), distanceFt: Math.floor(rng() * 30) * 100, side: pick(["left", "right"]), approach: pick(["facing", "trailing"]) }),
        () => ({ name: "flipTurnout", switchId: maybeBogus(switches), axis: pick(["up_down", "left_right"]) }),
        () => ({ name: "setTrack", trackId: maybeBogus(tracks), lengthFt: 60 + Math.floor(rng() * 100) * 10 }),
        () => ({ name: "deleteTrack", trackId: rng() < 0.3 ? maybeBogus(tracks.filter((t) => t !== "MAIN")) : "BOGUS" }),
        () => ({ name: "addFacility", trackId: maybeBogus(tracks), startFt: Math.floor(rng() * 50) * 10, lengthFt: 60 + Math.floor(rng() * 30) * 10, label: "F", kind: "other" }),
        () => ({ name: "deleteFacility", facilityId: maybeBogus(facilities) }),
        () => ({ name: "addCars", count: 1 + Math.floor(rng() * 4), type: "gondola", state: pick(["loaded", "empty"]) }),
        () => ({ name: "placeCars", count: 1 + Math.floor(rng() * 3), type: "boxcar_50", state: "empty", at: maybeBogus([...tracks, ...facilities]) }),
        () => ({ name: "setCar", carId: maybeBogus(cars), state: pick(["loaded", "empty"]), lengthFt: rng() < 0.5 ? null : 89 }),
        () => ({ name: "deleteCar", carId: maybeBogus(cars) }),
        () => ({ name: "addStep", step: { actor: "railroad", do: pick(["shove", "pull", "run_light"]), cars: [cars.length ? pick(cars) : "L1"], to: maybeBogus([...tracks, ...facilities]), text: "" } }),
        () => ({ name: "setStep", stepId: maybeBogus(steps), patch: { text: "t", via: switches.length ? [pick(switches)] : undefined } }),
        () => ({ name: "deleteStep", stepId: maybeBogus(steps) }),
        () => ({ name: "reorderStep", stepId: maybeBogus(steps), index: Math.floor(rng() * (steps.length + 1)) }),
        () => ({ name: "setLocos", count: 1 + Math.floor(rng() * 3) })
      ];
      const cmd = pick(makers)();
      const r = applyCommand(plan, cmd);
      plan = r.plan;
      const checked = validateFile(plan);
      expect(checked.plan, `after ${i}: ${JSON.stringify(cmd)} -> ${JSON.stringify(checked.problems)}`).not.toBeNull();
      // Reference problems (a step naming a deleted facility) are by design: the file opens as a draft (spec 6.6).
      expect(checked.problems.filter((p) => p.repaired), JSON.stringify(cmd)).toEqual([]);
      const ids = allCarIds(plan);
      expect(new Set(ids).size, JSON.stringify(cmd)).toBe(ids.length);
    }
  });
});

describe("commands keep the plan schema-valid (review fixes)", () => {
  test("a command whose inputs break its schema is refused with a problem", () => {
    const r = applyCommand(demo, { name: "setLocos", count: 1.5 });
    expect(r.plan).toEqual(demo);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]!.path).toBe("setLocos.count");
    expect(applyCommand(demo, { name: "setFacility", facilityId: "RACKS", spots: 2.5 }).problems).toHaveLength(1);
    expect(validateFile(applyCommand(demo, { name: "setLocos", count: 2 }).plan).plan).not.toBeNull();
  });

  test("setStep treats null as delete, so JSON commands can remove a field", () => {
    const r = applyCommand(demo, { name: "setStep", stepId: "W1", patch: { spot: null } as never });
    expect(r.problems).toEqual([]);
    expect(r.plan.work[0]).not.toHaveProperty("spot");
    expect(validateFile(r.plan).plan).not.toBeNull();
  });

  test("a stop step without a callout is refused, since the plan schema needs one", () => {
    const r = applyCommand(demo, { name: "addStep", step: { actor: "railroad", do: "stop", text: "Hold" } });
    expect(r.plan).toEqual(demo);
    expect(r.problems[0]!.message).toMatch(/callout/);
    const ok = applyCommand(demo, { name: "addStep", step: { actor: "railroad", do: "stop", text: "Hold", callout: { text: "Wait for the signal" } } });
    expect(ok.problems).toEqual([]);
  });

  test("a command that would leave the plan unreadable is refused", () => {
    // A step id that collides: the second W1 would be dropped on reopen, so the shown plan would differ from the saved one.
    const r = applyCommand(demo, { name: "addStep", step: { id: "W1", actor: "railroad", do: "note", text: "x" } });
    expect(r.plan).toEqual(demo);
    expect(r.problems).toHaveLength(1);
  });
});

describe("addTurnout with an order", () => {
  test("inserts the switch at that order and shifts the later ones up", () => {
    const first = applyCommand(demo, { name: "addTurnout", trackId: "MAIN", distanceFt: 820, side: "left", approach: "facing" }).plan;
    const r = applyCommand(first, { name: "addTurnout", trackId: "MAIN", distanceFt: 420, side: "right", approach: "trailing", order: 2 });
    expect(r.plan.switches.map((s) => [s.id, s.order, s.distanceFt])).toEqual([
      ["S1", 1, undefined],
      ["S2", 3, 820],
      ["S3", 2, 420]
    ]);
    expect(validateFile(r.plan).plan).not.toBeNull();
  });
});

describe("flipTurnout on a rejoining siding", () => {
  test("flip left/right is refused with a message on either switch of a siding that rejoins; flip up/down moves both switches to the other side", async () => {
    const { materialize } = await import("../../src/core/engine/materialize");
    const { applyCommand } = await import("../../src/core/commands/commands");
    const plan = materialize({
      schemaVersion: "1",
      title: "Siding",
      arrival: { direction: "eastbound", enters: "left", on: "MAIN", locos: "rear", text: "" },
      tracks: [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SIDING", role: "siding", lengthFt: 600, end: "rejoins" }
      ],
      switches: [
        { id: "S1", on: "MAIN", to: "SIDING", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "MAIN", to: "SIDING", side: "left", approach: "trailing", order: 2 }
      ],
      facilities: [],
      consist: { locos: { count: 1 }, cuts: [] },
      work: [],
      departure: { direction: "eastbound", text: "" }
    }).plan;
    const r = applyCommand(plan, { name: "flipTurnout", switchId: "S2", axis: "left_right" });
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]!.message).toContain("siding");
    expect(r.plan.switches.map((s) => s.approach)).toEqual(["facing", "trailing"]);
    const up = applyCommand(plan, { name: "flipTurnout", switchId: "S1", axis: "up_down" });
    expect(up.problems).toEqual([]);
    expect(up.plan.switches.map((s) => s.side)).toEqual(["right", "right"]);
  });
});
