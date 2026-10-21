import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { OnSiteCut, PlanReading, Switch, Track, WorkStep } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { materialize } from "../../src/core/engine/materialize";
import { buildGraph } from "../../src/core/engine/graph";
import { RUNAROUND_REASON, simulate } from "../../src/core/engine/simulate";
import { notesFor, type Note } from "../../src/core/engine/notes";

const demo = materialize(validateFile(demoJson).plan as PlanReading).plan;

function notesOf(plan: PlanReading): Note[] {
  const g = buildGraph(plan);
  return notesFor(simulate(plan, g), plan, g);
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
      locos: { count: 1 },
      cuts: [{ id: "LOADS", cars: 5, state: "loaded", list: ["C1", "C2", "C3", "C4", "C5"].map((id) => ({ id })) }]
    },
    work: o.work ?? [],
    departure: { direction: "westbound", text: "Departs." }
  };
  if (o.onSite) raw.consist.onSite = o.onSite;
  return materialize(raw).plan;
}

const SIX_CARS = "6 cars at 60 ft = 360 ft, plus 10% for slack = 396 ft; the racks have 360 ft. Lengths are the general 60 ft planning length.";

/** The demo shove with its stop replaced by the lead at SPUR1 1090, the far end of the racks. */
function demoShoveTo(ft: number): PlanReading {
  const edited = cloneJson(demo);
  const shove = edited.work[0]!;
  if (shove.do !== "shove") throw new Error("demo W1 should be the shove");
  delete shove.spot;
  shove.stop = { track: "SPUR1", ft, end: "lead" };
  return edited;
}

const halfwayThroughS1 = plan({
  work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 30, end: "lead" } }]
});
const rearInZone = plan({
  work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 600, end: "lead" } }]
});
const pastBuffer = plan({
  work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 2000, end: "lead" } }]
});
const noRoute = plan({
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
});
const shoveThatPulls = plan({
  tracks: [
    { id: "MAIN", role: "main", end: "continues" },
    { id: "SPUR2", role: "spur", lengthFt: 500, end: "buffer_stop" }
  ],
  switches: [{ id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing", order: 1 }],
  work: [
    // The loco is at the rear, so W1 up the main is a shove as saved; W2 drops back through the trailing S2 loco first.
    { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "MAIN", text: "", stop: { track: "MAIN", ft: 1000, end: "lead" } },
    { id: "W2", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR2", via: ["S2"], text: "", stop: { track: "SPUR2", ft: 400, end: "lead" } }
  ]
});
const ghost = demoWith([
  { id: "W1", actor: "railroad", do: "shove", cars: ["GHOST"], to: "RACKS", via: ["S1"], text: "", spot: 5 },
  { id: "W2", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", via: ["S1"], text: "", spot: 5 }
]);
const unloadTwice = (() => {
  const edited = cloneJson(demo);
  edited.work.splice(4, 0, { id: "W4b", actor: "customer", do: "unload", cars: ["LOADS"], text: "" });
  return edited;
})();
const leftBehind = (() => {
  const edited = cloneJson(demo);
  edited.work = edited.work.slice(0, 3);
  return edited;
})();
const runaround = demoWith([{ id: "W1", actor: "railroad", do: "runaround", text: "" }]);

describe("notes: fit", () => {
  test("demo shove gives the exact info fit note", () => {
    expect(notesOf(demo).filter((x) => x.kind === "fit")).toEqual([
      {
        stepId: "W1",
        kind: "fit",
        level: "info",
        at: "RACKS",
        text: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft."
      }
    ]);
  });

  test("the demo produces exactly one note in total", () => {
    const notes = notesOf(demo);
    expect(notes.length).toBe(1);
    expect(notes[0]!.stepId).toBe("W1");
    expect(notes[0]!.kind).toBe("fit");
  });

  test("six cars at the racks give a heads-up that states the assumption", () => {
    const edited = demoShoveTo(1090);
    const loads = edited.consist.cuts[0]!;
    loads.cars = 6;
    loads.list!.push({ id: "C6" });
    const notes = notesOf(edited);
    expect(notes.filter((x) => x.kind === "fit")).toEqual([{ stepId: "W1", kind: "fit", level: "heads_up", at: "RACKS", text: SIX_CARS }]);
    expect(notes.length).toBe(1);
  });

  test("six 60 ft cars on a 396 ft facility fit exactly: info, and the text agrees with the level", () => {
    // RACKS becomes 694 to 1090; the lead at 1054 stands the six cars on it and leaves the loco short of it.
    const edited = demoShoveTo(1054);
    edited.facilities[0]!.lengthFt = 396;
    const loads = edited.consist.cuts[0]!;
    loads.cars = 6;
    loads.list!.push({ id: "C6" });
    expect(notesOf(edited).filter((x) => x.kind === "fit")).toEqual([
      {
        stepId: "W1",
        kind: "fit",
        level: "info",
        at: "RACKS",
        text: "6 cars at 60 ft = 360 ft, plus 10% for slack = 396 ft; the racks have 396 ft."
      }
    ]);
  });

  test("fit counts cars already on site", () => {
    const edited = cloneJson(demo);
    edited.consist.onSite = [{ id: "EMPTIES", cars: 1, state: "empty", at: "RACKS", list: [{ id: "E1" }] }];
    const fit = notesOf(materialize(edited).plan).filter((x) => x.kind === "fit" && x.stepId === "W1");
    expect(fit).toEqual([{ stepId: "W1", kind: "fit", level: "heads_up", at: "RACKS", text: SIX_CARS }]);
  });

  test("a 94 ft car changes the fit numbers", () => {
    const edited = cloneJson(demo);
    edited.consist.cuts[0]!.list![0]!.lengthFt = 94;
    const notes = notesOf(edited);
    expect(notes.filter((x) => x.kind === "fit")).toEqual([
      {
        stepId: "W1",
        kind: "fit",
        level: "heads_up",
        at: "RACKS",
        text: "5 cars = 334 ft, plus 10% for slack = 367.4 ft; the racks have 360 ft."
      }
    ]);
  });

  test("the loco counts when it stays coupled and stands on the racks", () => {
    const notes = notesOf(demoShoveTo(1090));
    expect(notes.filter((x) => x.kind === "fit")).toEqual([
      {
        stepId: "W1",
        kind: "fit",
        level: "heads_up",
        at: "RACKS",
        text: "5 cars and the loco = 380 ft, plus 10% for slack = 418 ft; the racks have 360 ft."
      }
    ]);
  });

  test("a move to a track without a facility gives no fit note", () => {
    expect(notesOf(halfwayThroughS1).filter((x) => x.kind === "fit")).toEqual([]);
  });
});

describe("notes: fouling, buffer, route, power", () => {
  test("a car halfway through S1 gives a fouling heads-up at S1", () => {
    const notes = notesOf(halfwayThroughS1).filter((x) => x.stepId === "W1");
    expect(notes).toEqual([{ stepId: "W1", kind: "fouling", level: "heads_up", at: "S1", text: "These cars may be fouling S1." }]);
  });

  test("the far end of a group inside S1's zone gives a fouling heads-up even when the near end is clear", () => {
    const g = buildGraph(rearInZone);
    const sim = simulate(rearInZone, g);
    const c1 = sim.states[1]!.places.C1;
    const l1 = sim.states[1]!.places.L1;
    expect(c1).toEqual({ occupies: [{ track: "SPUR1", fromFt: 540, toFt: 600 }] });
    expect(l1).toEqual({ occupies: [{ track: "SPUR1", fromFt: 220, toFt: 300 }] });
    const notes = notesFor(sim, rearInZone, g).filter((x) => x.stepId === "W1");
    expect(notes).toEqual([{ stepId: "W1", kind: "fouling", level: "heads_up", at: "S1", text: "These cars may be fouling S1." }]);
  });

  test("the demo shove that stands clear of S1 gives no fouling note", () => {
    expect(notesOf(demo).filter((x) => x.kind === "fouling")).toEqual([]);
  });

  test("a past_end step gives a buffer heads-up", () => {
    const notes = notesOf(pastBuffer).filter((x) => x.stepId === "W1");
    expect(notes).toEqual([{ stepId: "W1", kind: "buffer", level: "heads_up", at: "SPUR1", text: "Cars are past the end of SPUR1." }]);
  });

  test("a route_not_established step gives an unclear_route note", () => {
    const notes = notesOf(noRoute).filter((x) => x.stepId === "W1");
    expect(notes).toEqual([
      {
        stepId: "W1",
        kind: "unclear_route",
        level: "heads_up",
        text: "The tool couldn't follow the route for this move. It plays as a straight slide; check it."
      }
    ]);
  });

  test("a saved shove that plays as a pull gives a power_end heads-up", () => {
    const notes = notesOf(shoveThatPulls);
    expect(notes.filter((x) => x.kind === "power_end")).toEqual([
      {
        stepId: "W2",
        kind: "power_end",
        level: "heads_up",
        text: "The loco is on the other end for a shove; this plays as a pull."
      }
    ]);
    expect(notes.filter((x) => x.stepId === "W1" && x.kind === "power_end")).toEqual([]);
  });
});

describe("notes: sequence and runaround", () => {
  test("a needs_attention step gives a sequence heads-up with the reason as a sentence", () => {
    const notes = notesOf(ghost).filter((x) => x.stepId === "W1");
    expect(notes).toEqual([{ stepId: "W1", kind: "sequence", level: "heads_up", text: '"GHOST" is not in this plan.' }]);
  });

  test("unloading cars that are already empty gives a sequence heads-up", () => {
    const notes = notesOf(unloadTwice);
    expect(notes.filter((x) => x.stepId === "W4")).toEqual([]);
    expect(notes.filter((x) => x.stepId === "W4b")).toEqual([
      { stepId: "W4b", kind: "sequence", level: "heads_up", text: "Some of these cars are already empty." }
    ]);
  });

  test("loading cars that are already loaded gives a sequence heads-up", () => {
    const notes = notesOf(demoWith([{ id: "W1", actor: "customer", do: "load", cars: ["LOADS"], text: "" }]));
    expect(notes.filter((x) => x.stepId === "W1")).toEqual([
      { stepId: "W1", kind: "sequence", level: "heads_up", text: "Some of these cars are already loaded." }
    ]);
  });

  test("cars listed for departure that stay behind give one sequence heads-up on the departure", () => {
    const notes = notesOf(leftBehind).filter((x) => x.stepId === "departure");
    expect(notes).toEqual([
      { stepId: "departure", kind: "sequence", level: "heads_up", text: "Some cars listed for departure are not on the train." }
    ]);
  });

  test("a runaround step gives one runaround note with the tier 2 reason and no sequence note", () => {
    const notes = notesOf(runaround).filter((x) => x.stepId === "W1");
    expect(notes).toEqual([{ stepId: "W1", kind: "runaround", level: "heads_up", text: RUNAROUND_REASON }]);
  });
});

describe("notes: text", () => {
  test("no note text contains an em dash or en dash", () => {
    const dashes = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
    const allNotes = [demo, halfwayThroughS1, rearInZone, pastBuffer, noRoute, shoveThatPulls, ghost, unloadTwice, leftBehind, runaround, demoShoveTo(1090)].flatMap(
      (p) => notesOf(p)
    );
    expect(allNotes.length).toBeGreaterThan(10);
    expect(allNotes.every((x) => !dashes.test(x.text))).toBe(true);
    expect(allNotes.every((x) => x.text.length > 0)).toBe(true);
  });
});

describe("notes: moves that go nowhere", () => {
  test("a 0 ft move gives no fit note and no fouling note", () => {
    const repeatToRacks = demoWith([
      { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", via: ["S1"], text: "", spot: 5 },
      { id: "W2", actor: "railroad", do: "shove", cars: ["LOADS"], to: "RACKS", text: "", spot: 5 }
    ]);
    const racks = notesOf(repeatToRacks);
    expect(racks.filter((x) => x.stepId === "W1" && x.kind === "fit").length).toBe(1);
    expect(racks.filter((x) => x.stepId === "W2")).toEqual([]);

    const repeatInZone = plan({
      work: [
        { id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", via: ["S1"], text: "", stop: { track: "SPUR1", ft: 30, end: "lead" } },
        { id: "W2", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", text: "", stop: { track: "SPUR1", ft: 30, end: "lead" } }
      ]
    });
    const zone = notesOf(repeatInZone);
    expect(zone.filter((x) => x.stepId === "W1" && x.kind === "fouling").length).toBe(1);
    expect(zone.filter((x) => x.stepId === "W2")).toEqual([]);
  });

  test("a departure that leaves cars behind keeps its sequence note while the loco goes", () => {
    const edited = materialize({ ...demo, work: demo.work.slice(0, 2) }).plan;
    const g = buildGraph(edited);
    const sim = simulate(edited, g);
    expect(sim.steps[3]!.moved).toEqual(["L1"]);
    const notes = notesFor(sim, edited, g).filter((x) => x.stepId === "departure");
    expect(notes).toEqual([{ stepId: "departure", kind: "sequence", level: "heads_up", text: "Some cars listed for departure are not on the train." }]);
  });
});
