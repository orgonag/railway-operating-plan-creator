import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { PlanReading, Switch, Track } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { materialize, unitsOf, type Unit } from "../../src/core/engine/materialize";
import { buildGraph } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import type { Id } from "../../src/core/schema/types";
import { layout, pointAt, type Drawing } from "../../src/core/layout/layout";
import { placeUnits } from "../../src/core/layout/place";

const demoM = materialize(validateFile(demoJson).plan as PlanReading).plan;
const g = buildGraph(demoM);

function unitMap(plan: PlanReading): Map<Id, Unit> {
  return new Map(unitsOf(plan).map((u) => [u.id, u]));
}

/** The demo geometry with its tracks and switches replaced. */
function demoWith(tracks: Track[], switches: Switch[]): PlanReading {
  const plan = cloneJson(demoM);
  plan.tracks = tracks;
  plan.switches = switches;
  plan.facilities = [];
  plan.work = [];
  return materialize(plan).plan;
}

function track(d: Drawing, id: string) {
  const t = d.tracks.find((x) => x.id === id);
  if (!t) throw new Error(`${id} is not drawn`);
  return t;
}

describe("layout: the demo", () => {
  test("demo: MAIN on lane 0 from x 0 to 1200; SPUR1 rises to lane 1 over 240 ft from x 580, ends at x 1670", () => {
    const d = layout(demoM, g);
    expect(d.widthFt).toBe(1200);
    expect(track(d, "MAIN").points).toEqual([
      { xFt: 0, lane: 0 },
      { xFt: 1200, lane: 0 }
    ]);
    expect(track(d, "MAIN").role).toBe("main");
    expect(track(d, "SPUR1").points).toEqual([
      { xFt: 580, lane: 0 },
      { xFt: 820, lane: 1 },
      { xFt: 1670, lane: 1 }
    ]);
    expect(d.bufferStops).toEqual([{ xFt: 1670, lane: 1 }]);
  });

  test("demo compass West left, East right; arrow Eastbound on the left; arrival_end maps to left", () => {
    const d = layout(demoM, g);
    expect(d.compass).toEqual({ left: "West", right: "East" });
    expect(d.arrivalArrow).toEqual({ side: "left", label: "Eastbound" });
    expect(d.boundaries).toEqual({ arrival_end: "left", far_end: "right" });
  });

  test("entering from the right mirrors x, puts the left-side branch on lane -1, maps arrival_end to right, and simulate gives the same states", () => {
    const mirrored = cloneJson(demoM);
    mirrored.arrival.enters = "right";
    const gm = buildGraph(mirrored);
    const d = layout(mirrored, gm);
    expect(d.widthFt).toBe(1200);
    expect(track(d, "MAIN").points).toEqual([
      { xFt: 1200, lane: 0 },
      { xFt: 0, lane: 0 }
    ]);
    expect(track(d, "SPUR1").points).toEqual([
      { xFt: 620, lane: 0 },
      { xFt: 380, lane: -1 },
      { xFt: -470, lane: -1 }
    ]);
    expect(d.bufferStops).toEqual([{ xFt: -470, lane: -1 }]);
    expect(d.compass).toEqual({ left: "East", right: "West" });
    expect(d.arrivalArrow).toEqual({ side: "right", label: "Eastbound" });
    expect(d.boundaries).toEqual({ arrival_end: "right", far_end: "left" });
    const racks = d.facilities.find((f) => f.id === "RACKS")!;
    expect(racks.lane).toBe(-1);
    expect(racks.fromXFt).toBe(-470);
    expect(racks.toXFt).toBe(-110);
    expect(racks.spots[0]).toEqual({ n: 1, fromXFt: -170, toXFt: -110 });

    // The mirror is a drawing concern only: the engine sees the same plan.
    const left = simulate(demoM, g);
    const right = simulate(mirrored, gm);
    expect(right.states).toEqual(left.states);
    expect(right.initial).toEqual(left.initial);

    // A sprite on the mirrored drawing points the other way.
    const sprite = placeUnits(d, gm, right.states[1]!, unitMap(mirrored)).find((s) => s.id === "C1")!;
    expect(sprite.centre).toEqual({ xFt: -380, lane: -1 });
    expect(sprite.tangent).toEqual({ dxFt: -1, dLane: 0 });
  });

  test("two branches on the same side take lanes 1 and 2", () => {
    const plan = demoWith(
      [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
        { id: "SPUR2", role: "spur", lengthFt: 400, end: "buffer_stop" }
      ],
      [
        { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "MAIN", to: "SPUR2", side: "left", approach: "facing", order: 2, distanceFt: 300 }
      ]
    );
    const gg = buildGraph(plan);
    const d = layout(plan, gg);
    expect(track(d, "SPUR1").points.map((p) => p.lane)).toEqual([0, 1, 1]);
    expect(track(d, "SPUR2").points).toEqual([
      { xFt: 880, lane: 0 },
      { xFt: 1120, lane: 2 },
      { xFt: 1570, lane: 2 }
    ]);
    expect(d.bufferStops).toEqual([
      { xFt: 1670, lane: 1 },
      { xFt: 1570, lane: 2 }
    ]);
  });

  test("a right-side branch takes lane -1 and a trailing branch runs back toward x 0", () => {
    const plan = demoWith(
      [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
        { id: "SPUR2", role: "spur", lengthFt: 400, end: "buffer_stop" }
      ],
      [
        { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing", order: 2, distanceFt: 300 }
      ]
    );
    const gg = buildGraph(plan);
    const d = layout(plan, gg);
    expect(track(d, "SPUR2").points).toEqual([
      { xFt: 880, lane: 0 },
      { xFt: 640, lane: -1 },
      { xFt: 190, lane: -1 }
    ]);
    const p = pointAt(d, gg, { track: "SPUR2", ft: 500 });
    expect(p.at).toEqual({ xFt: 380, lane: -1 });
    expect(p.tangent).toEqual({ dxFt: -1, dLane: 0 });
  });

  test("a branch off a branch takes the next lane beyond its parent on its own side", () => {
    const plan = demoWith(
      [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
        { id: "SPUR2", role: "spur", lengthFt: 400, end: "buffer_stop" }
      ],
      [
        { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "SPUR1", to: "SPUR2", side: "left", approach: "facing", order: 1, distanceFt: 300 }
      ]
    );
    const gg = buildGraph(plan);
    const d = layout(plan, gg);
    // S2 sits at SPUR1 ft 590, which is x 1170 on lane 1.
    expect(track(d, "SPUR2").points).toEqual([
      { xFt: 1170, lane: 1 },
      { xFt: 1410, lane: 2 },
      { xFt: 1860, lane: 2 }
    ]);
  });

  test("racks span x 1310 to 1670 on lane 1 with spot 1 from x 1310 to 1370", () => {
    const d = layout(demoM, g);
    const racks = d.facilities.find((f) => f.id === "RACKS")!;
    expect(racks.name).toBe("Unloading racks");
    expect(racks.lane).toBe(1);
    expect(racks.fromXFt).toBe(1310);
    expect(racks.toXFt).toBe(1670);
    expect(racks.spots).toHaveLength(5);
    expect(racks.spots[0]).toEqual({ n: 1, fromXFt: 1310, toXFt: 1370 });
    expect(racks.spots[4]).toEqual({ n: 5, fromXFt: 1550, toXFt: 1610 });
  });
});

describe("pointAt", () => {
  const d = layout(demoM, g);

  test("on the main: x = ft, lane 0, tangent (1, 0)", () => {
    expect(pointAt(d, g, { track: "MAIN", ft: 300 })).toEqual({ at: { xFt: 300, lane: 0 }, tangent: { dxFt: 1, dLane: 0 } });
  });

  test("a unit on the turnout diagonal has tangent (240, 1) direction", () => {
    const p = pointAt(d, g, { track: "SPUR1", ft: 120 });
    expect(p.at).toEqual({ xFt: 700, lane: 0.5 });
    expect(p.tangent.dxFt).toBe(1);
    expect(p.tangent.dLane * 240).toBeCloseTo(1);
    expect(p.tangent.dxFt / p.tangent.dLane).toBeCloseTo(240);
  });

  test("past the diagonal the branch runs flat on its lane", () => {
    expect(pointAt(d, g, { track: "SPUR1", ft: 240 })).toEqual({ at: { xFt: 820, lane: 1 }, tangent: { dxFt: 1, dLane: 0 } });
    expect(pointAt(d, g, { track: "SPUR1", ft: 1000 })).toEqual({ at: { xFt: 1580, lane: 1 }, tangent: { dxFt: 1, dLane: 0 } });
  });

  test("beyond a track's end the last stretch carries straight on", () => {
    expect(pointAt(d, g, { track: "SPUR1", ft: 1200 }).at).toEqual({ xFt: 1780, lane: 1 });
    expect(pointAt(d, g, { track: "MAIN", ft: 1300 }).at).toEqual({ xFt: 1300, lane: 0 });
    expect(pointAt(d, g, { track: "MAIN", ft: -50 }).at).toEqual({ xFt: -50, lane: 0 });
  });
});

describe("placeUnits", () => {
  const d = layout(demoM, g);
  const sim = simulate(demoM, g);
  const units = unitMap(demoM);

  test("placeUnits for demo step 2: C1 centre at x 1580, lane 1, tangent (1, 0), type covered_hopper_large, mark ABCX", () => {
    const sprites = placeUnits(d, g, sim.states[1]!, units);
    const c1 = sprites.find((s) => s.id === "C1")!;
    expect(c1).toEqual({
      id: "C1",
      kind: "car",
      type: "covered_hopper_large",
      loaded: true,
      lengthFt: 60,
      mark: "ABCX",
      number: "1001",
      centre: { xFt: 1580, lane: 1 },
      tangent: { dxFt: 1, dLane: 0 }
    });
    const l1 = sprites.find((s) => s.id === "L1")!;
    expect(l1.kind).toBe("loco");
    expect(l1.loaded).toBe(false);
    expect(l1.lengthFt).toBe(80);
    expect(l1.centre).toEqual({ xFt: 1270, lane: 1 });
  });

  test("a unit on the turnout diagonal has tangent (240, 1) direction", () => {
    const state = cloneJson(sim.states[1]!);
    state.places.C1 = { occupies: [{ track: "SPUR1", fromFt: 90, toFt: 150 }] };
    const c1 = placeUnits(d, g, state, units).find((s) => s.id === "C1")!;
    expect(c1.centre).toEqual({ xFt: 700, lane: 0.5 });
    expect(c1.tangent.dxFt / c1.tangent.dLane).toBeCloseTo(240);
  });

  test("offstage units are omitted", () => {
    const sprites = placeUnits(d, g, sim.states[3]!, units);
    expect(sprites.map((s) => s.id).sort()).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });

  test("a unit partly beyond the main's boundary is placed by its on-drawing part; one entirely beyond is omitted", () => {
    const state = cloneJson(sim.states[0]!);
    state.places.L1 = { occupies: [{ track: "MAIN", fromFt: -40, toFt: 40 }] };
    state.places.C5 = { occupies: [{ track: "MAIN", fromFt: 1300, toFt: 1360 }] };
    const sprites = placeUnits(d, g, state, units);
    expect(sprites.find((s) => s.id === "L1")!.centre).toEqual({ xFt: 20, lane: 0 });
    expect(sprites.find((s) => s.id === "C5")).toBeUndefined();
  });

  test("a car shoved past a buffer stop is still drawn where it stands", () => {
    const state = cloneJson(sim.states[1]!);
    state.places.C1 = { occupies: [{ track: "SPUR1", fromFt: 1100, toFt: 1160 }] };
    expect(placeUnits(d, g, state, units).find((s) => s.id === "C1")!.centre).toEqual({ xFt: 1710, lane: 1 });
  });
});
