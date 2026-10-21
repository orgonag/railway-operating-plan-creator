import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { Facility, PlanReading, Switch, Track } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { materialize } from "../../src/core/engine/materialize";
import {
  APPROACH_MARGIN_FT,
  ARRIVAL_SHORT_FT,
  CLEAR_FT,
  DEFAULT_BRANCH_USABLE_FT,
  TURNOUT_FT,
  buildGraph
} from "../../src/core/engine/graph";

const demoM = materialize(validateFile(demoJson).plan as PlanReading).plan;

interface PlanOverrides {
  tracks?: Track[];
  switches?: Switch[];
  facilities?: Facility[];
}

/** One loco (80) and five cars (60 each): a 380 ft train, like the demo. */
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
    facilities: o.facilities ?? [],
    consist: { locos: { count: 1 }, cuts: [{ id: "LOADS", cars: 5, state: "loaded" }] },
    work: [],
    departure: { direction: "westbound", text: "Departs." }
  };
  return materialize(raw).plan;
}

/** MAIN with a facing S1 to SPUR1 at 580 and a trailing S2 to SPUR2 at 980. */
function twoSwitchPlan(): PlanReading {
  return plan({
    tracks: [
      { id: "MAIN", role: "main", end: "continues" },
      { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
      { id: "SPUR2", role: "spur", lengthFt: 500, end: "buffer_stop" }
    ],
    switches: [
      { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
      { id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing", order: 2 }
    ]
  });
}

describe("graph: constants", () => {
  test("the four geometry constants have the agreed values", () => {
    expect(TURNOUT_FT).toBe(240);
    expect(CLEAR_FT).toBe(290);
    expect(APPROACH_MARGIN_FT).toBe(200);
    expect(ARRIVAL_SHORT_FT).toBe(100);
    expect(DEFAULT_BRANCH_USABLE_FT).toBe(400);
  });
});

describe("graph: demo geometry", () => {
  test("demo: S1 at MAIN 580, SPUR1 total 1090, racks 730 to 1090, spot 5 is 970 to 1030", () => {
    const g = buildGraph(demoM);
    expect(g.switches.get("S1")!.atFt).toBe(580);
    expect(g.tracks.get("SPUR1")!.totalFt).toBe(1090);
    const racks = g.facilities.get("RACKS")!;
    expect([racks.startFt, racks.endFt]).toEqual([730, 1090]);
    expect(racks.spots[4]).toEqual({ n: 5, fromFt: 970, toFt: 1030 });
  });

  test("MAIN total is max(580 + 240 + 380, SPUR1's end at 580 + 1090) = 1670, start is arrival_end, end is far_end", () => {
    const main = buildGraph(demoM).tracks.get("MAIN")!;
    expect(main.totalFt).toBe(1670);
    expect(main.role).toBe("main");
    expect(main.ends.start).toEqual({ kind: "boundary", name: "arrival_end" });
    expect(main.ends.end).toEqual({ kind: "boundary", name: "far_end" });
  });

  test("SPUR1 starts at S1 and ends at a buffer; S1 carries its side and approach", () => {
    const g = buildGraph(demoM);
    const spur = g.tracks.get("SPUR1")!;
    expect(spur.ends.start).toEqual({ kind: "switch", switch: "S1" });
    expect(spur.ends.end).toEqual({ kind: "buffer" });
    expect(g.switches.get("S1")).toEqual({ id: "S1", on: "MAIN", to: "SPUR1", atFt: 580, side: "left", approach: "facing" });
  });

  test("racks have five spots, 60 ft each from the facility start, spot 1 nearest the switch", () => {
    const racks = buildGraph(demoM).facilities.get("RACKS")!;
    expect(racks.track).toBe("SPUR1");
    expect(racks.spots).toEqual([
      { n: 1, fromFt: 730, toFt: 790 },
      { n: 2, fromFt: 790, toFt: 850 },
      { n: 3, fromFt: 850, toFt: 910 },
      { n: 4, fromFt: 910, toFt: 970 },
      { n: 5, fromFt: 970, toFt: 1030 }
    ]);
  });
});

describe("graph: routes and walks on the demo", () => {
  test("route from MAIN 480 heading up to SPUR1 1030 goes through S1 and is 1130 ft", () => {
    const r = buildGraph(demoM).route({ track: "MAIN", ft: 480 }, "up", { track: "SPUR1", ft: 1030 })!;
    expect(r.switches).toEqual(["S1"]);
    expect(r.lengthFt).toBe(1130);
    expect(r.segments).toEqual([
      { track: "MAIN", fromFt: 480, toFt: 580 },
      { track: "SPUR1", fromFt: 0, toFt: 1030 }
    ]);
  });

  test("route from SPUR1 730 heading down to MAIN 530 is 780 ft with falling segments", () => {
    const r = buildGraph(demoM).route({ track: "SPUR1", ft: 730 }, "down", { track: "MAIN", ft: 530 })!;
    expect(r.switches).toEqual(["S1"]);
    expect(r.lengthFt).toBe(780);
    expect(r.segments).toEqual([
      { track: "SPUR1", fromFt: 730, toFt: 0 },
      { track: "MAIN", fromFt: 580, toFt: 530 }
    ]);
  });

  test("route that would run off the arrival end before reaching its target is null", () => {
    expect(buildGraph(demoM).route({ track: "MAIN", ft: 480 }, "down", { track: "MAIN", ft: 700 })).toBeNull();
  });

  test("walk 130 ft up from MAIN 480 toward SPUR1 crosses S1 into SPUR1 30", () => {
    const segs = buildGraph(demoM).walk({ track: "MAIN", ft: 480 }, "up", 130, undefined, { track: "SPUR1", ft: 1030 })!;
    expect(segs).toEqual([
      { track: "MAIN", fromFt: 480, toFt: 580 },
      { track: "SPUR1", fromFt: 0, toFt: 30 }
    ]);
  });

  test("walk 130 ft up from MAIN 480 with no target takes the through route", () => {
    const segs = buildGraph(demoM).walk({ track: "MAIN", ft: 480 }, "up", 130)!;
    expect(segs).toEqual([{ track: "MAIN", fromFt: 480, toFt: 610 }]);
  });

  test("walking exactly to the points stays on the main", () => {
    const segs = buildGraph(demoM).walk({ track: "MAIN", ft: 480 }, "up", 100, undefined, { track: "SPUR1", ft: 1030 })!;
    expect(segs).toEqual([{ track: "MAIN", fromFt: 480, toFt: 580 }]);
  });

  test("walking down off SPUR1 ft 0 continues onto MAIN at S1 (ft 0 of a branch is not an end)", () => {
    const segs = buildGraph(demoM).walk({ track: "SPUR1", ft: 30 }, "down", 100)!;
    expect(segs).toEqual([
      { track: "SPUR1", fromFt: 30, toFt: 0 },
      { track: "MAIN", fromFt: 580, toFt: 510 }
    ]);
  });

  test("walking past the buffer stop returns a segment beyond SPUR1's total", () => {
    const segs = buildGraph(demoM).walk({ track: "SPUR1", ft: 1000 }, "up", 200)!;
    expect(segs).toEqual([{ track: "SPUR1", fromFt: 1000, toFt: 1200 }]);
  });

  test("walking past the arrival end returns a segment below MAIN 0", () => {
    const segs = buildGraph(demoM).walk({ track: "MAIN", ft: 100 }, "down", 300)!;
    expect(segs).toEqual([{ track: "MAIN", fromFt: 100, toFt: -200 }]);
  });

  test("starting exactly on SPUR1 ft 0 and walking down goes straight onto the main", () => {
    const segs = buildGraph(demoM).walk({ track: "SPUR1", ft: 0 }, "down", 100)!;
    expect(segs).toEqual([{ track: "MAIN", fromFt: 580, toFt: 480 }]);
  });

  test("starting exactly on the S1 points, a route into SPUR1 takes the switch", () => {
    const r = buildGraph(demoM).route({ track: "MAIN", ft: 580 }, "up", { track: "SPUR1", ft: 1030 })!;
    expect(r.switches).toEqual(["S1"]);
    expect(r.segments).toEqual([{ track: "SPUR1", fromFt: 0, toFt: 1030 }]);
    expect(r.lengthFt).toBe(1030);
  });

  test("starting exactly on the S1 points, a walk toward SPUR1 diverges and one without a target goes through", () => {
    const g = buildGraph(demoM);
    expect(g.walk({ track: "MAIN", ft: 580 }, "up", 30, undefined, { track: "SPUR1", ft: 1030 })).toEqual([{ track: "SPUR1", fromFt: 0, toFt: 30 }]);
    expect(g.walk({ track: "MAIN", ft: 580 }, "up", 30)).toEqual([{ track: "MAIN", fromFt: 580, toFt: 610 }]);
  });

  test("a walk that lands on the points can be routed into the spur from where it ended", () => {
    const g = buildGraph(demoM);
    const first = g.walk({ track: "MAIN", ft: 480 }, "up", 100, undefined, { track: "SPUR1", ft: 1030 })!;
    const lead = first[first.length - 1]!;
    expect(lead).toEqual({ track: "MAIN", fromFt: 480, toFt: 580 });
    const r = g.route({ track: lead.track, ft: lead.toFt }, "up", { track: "SPUR1", ft: 1030 })!;
    expect(r.lengthFt).toBe(1030);
    expect(r.switches).toEqual(["S1"]);
  });

  test("walk with zero or negative distance returns one zero-length segment at the start", () => {
    const g = buildGraph(demoM);
    expect(g.walk({ track: "MAIN", ft: 480 }, "up", 0)).toEqual([{ track: "MAIN", fromFt: 480, toFt: 480 }]);
    expect(g.walk({ track: "SPUR1", ft: 730 }, "down", -50)).toEqual([{ track: "SPUR1", fromFt: 730, toFt: 730 }]);
  });

  test("a required via switch that can't be reached returns null", () => {
    const g = buildGraph(demoM);
    expect(g.walk({ track: "MAIN", ft: 480 }, "down", 100, ["S1"])).toBeNull();
    expect(g.route({ track: "MAIN", ft: 480 }, "down", { track: "MAIN", ft: 100 }, ["S1"])).toBeNull();
    expect(g.route({ track: "MAIN", ft: 480 }, "up", { track: "SPUR1", ft: 1030 }, ["NOPE"])).toBeNull();
  });

  test("a via switch passed on the way is honoured", () => {
    const g = buildGraph(demoM);
    const r = g.route({ track: "MAIN", ft: 480 }, "up", { track: "SPUR1", ft: 1030 }, ["S1"])!;
    expect(r.lengthFt).toBe(1130);
    expect(g.walk({ track: "MAIN", ft: 480 }, "up", 130, ["S1"], { track: "SPUR1", ft: 1030 })).not.toBeNull();
  });
});

describe("graph: fouling zones", () => {
  test("fouling zones: S1 covers MAIN 580 to 870 and SPUR1 0 to 290", () => {
    expect(buildGraph(demoM).foulingZones()).toEqual([
      { switch: "S1", track: "MAIN", fromFt: 580, toFt: 870 },
      { switch: "S1", track: "SPUR1", fromFt: 0, toFt: 290 }
    ]);
  });

  test("a trailing switch fouls the main on the falling side of its points", () => {
    const zones = buildGraph(twoSwitchPlan()).foulingZones();
    expect(zones).toContainEqual({ switch: "S2", track: "MAIN", fromFt: 690, toFt: 980 });
    expect(zones).toContainEqual({ switch: "S2", track: "SPUR2", fromFt: 0, toFt: 290 });
  });
});

describe("graph: trailing switches", () => {
  test("switches on the main are 400 ft apart by default and MAIN runs to the furthest branch end when that is past 240 + train", () => {
    const g = buildGraph(twoSwitchPlan());
    expect(g.switches.get("S1")!.atFt).toBe(580);
    expect(g.switches.get("S2")!.atFt).toBe(980);
    // 240 + train past S2 would be 1600; SPUR1 ends at 580 + 1090 = 1670, further on. SPUR2 runs back and ends at 190.
    expect(g.tracks.get("MAIN")!.totalFt).toBe(1670);
  });

  test("distanceFt spaces a later switch from the one before it", () => {
    const p = twoSwitchPlan();
    p.switches[1]!.distanceFt = 250;
    expect(buildGraph(p).switches.get("S2")!.atFt).toBe(830);
  });

  test("walking down the main toward SPUR2 diverges at the trailing S2 and heads up the branch", () => {
    const segs = buildGraph(twoSwitchPlan()).walk({ track: "MAIN", ft: 1100 }, "down", 200, undefined, { track: "SPUR2", ft: 400 })!;
    expect(segs).toEqual([
      { track: "MAIN", fromFt: 1100, toFt: 980 },
      { track: "SPUR2", fromFt: 0, toFt: 80 }
    ]);
  });

  test("walking up the main past a trailing switch cannot diverge even toward its branch", () => {
    const segs = buildGraph(twoSwitchPlan()).walk({ track: "MAIN", ft: 900 }, "up", 200, undefined, { track: "SPUR2", ft: 400 })!;
    expect(segs).toEqual([{ track: "MAIN", fromFt: 900, toFt: 1100 }]);
  });

  test("walking down off a trailing branch's ft 0 continues up the main, away from the branch", () => {
    const segs = buildGraph(twoSwitchPlan()).walk({ track: "SPUR2", ft: 50 }, "down", 100)!;
    expect(segs).toEqual([
      { track: "SPUR2", fromFt: 50, toFt: 0 },
      { track: "MAIN", fromFt: 980, toFt: 1030 }
    ]);
  });

  test("route down the main into the trailing SPUR2 passes S2 only", () => {
    const r = buildGraph(twoSwitchPlan()).route({ track: "MAIN", ft: 1100 }, "down", { track: "SPUR2", ft: 100 })!;
    expect(r.switches).toEqual(["S2"]);
    expect(r.segments).toEqual([
      { track: "MAIN", fromFt: 1100, toFt: 980 },
      { track: "SPUR2", fromFt: 0, toFt: 100 }
    ]);
    expect(r.lengthFt).toBe(220);
  });

  test("SPUR1 to SPUR2 in one heading is null: leaving the facing branch heads away from S2", () => {
    expect(buildGraph(twoSwitchPlan()).route({ track: "SPUR1", ft: 300 }, "down", { track: "SPUR2", ft: 100 })).toBeNull();
  });
});

describe("graph: defaults and odd plans", () => {
  test("a branch with no lengthFt uses the default usable length", () => {
    const g = buildGraph(plan({ tracks: [{ id: "MAIN", role: "main" }, { id: "SPUR1", role: "spur" }] }));
    expect(g.tracks.get("SPUR1")!.totalFt).toBe(290 + DEFAULT_BRANCH_USABLE_FT);
    expect(g.tracks.get("SPUR1")!.ends.end).toEqual({ kind: "buffer" });
  });

  test("a branch that rejoins ends at the second switch leading to it and walks back onto the main", () => {
    const g = buildGraph(
      plan({
        tracks: [
          { id: "MAIN", role: "main" },
          { id: "SIDING", role: "siding", lengthFt: 800, end: "rejoins" }
        ],
        switches: [
          { id: "S1", on: "MAIN", to: "SIDING", side: "left", approach: "facing", order: 1 },
          { id: "S2", on: "MAIN", to: "SIDING", side: "left", approach: "trailing", order: 2 }
        ]
      })
    );
    expect(g.tracks.get("SIDING")!.ends).toEqual({ start: { kind: "switch", switch: "S1" }, end: { kind: "switch", switch: "S2" } });
    expect(g.walk({ track: "SIDING", ft: 1000 }, "up", 100)).toEqual([
      { track: "SIDING", fromFt: 1000, toFt: 1090 },
      { track: "MAIN", fromFt: 980, toFt: 990 }
    ]);
    expect(g.walk({ track: "SIDING", ft: 1090 }, "up", 10)).toEqual([{ track: "MAIN", fromFt: 980, toFt: 990 }]);
  });

  test("a branch that says rejoins but has no second switch gets a buffer end", () => {
    const g = buildGraph(plan({ tracks: [{ id: "MAIN", role: "main" }, { id: "SPUR1", role: "spur", lengthFt: 800, end: "rejoins" }] }));
    expect(g.tracks.get("SPUR1")!.ends.end).toEqual({ kind: "buffer" });
  });

  test("a switch whose track is missing is skipped, not thrown on", () => {
    const g = buildGraph(
      plan({
        switches: [
          { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
          { id: "S9", on: "MAIN", to: "GHOST", side: "left", approach: "facing", order: 2 }
        ]
      })
    );
    expect(g.switches.has("S9")).toBe(false);
    expect(g.switches.get("S1")!.atFt).toBe(580);
    // The skipped switch does not move the last-switch point: the main is still SPUR1's end, 580 + 1090.
    expect(g.tracks.get("MAIN")!.totalFt).toBe(1670);
  });

  test("a branch that ends short of 240 + train past the last switch leaves the main at that default", () => {
    const g = buildGraph(plan({ tracks: [{ id: "MAIN", role: "main" }, { id: "SPUR1", role: "spur", lengthFt: 100, end: "buffer_stop" }] }));
    // SPUR1 ends at 580 + 290 + 100 = 970; the default 580 + 240 + 380 = 1200 is further.
    expect(g.tracks.get("SPUR1")!.totalFt).toBe(390);
    expect(g.tracks.get("MAIN")!.totalFt).toBe(1200);
  });

  test("a nested facing branch that reaches furthest sets the main's length", () => {
    const g = buildGraph(
      plan({
        tracks: [
          { id: "MAIN", role: "main", end: "continues" },
          { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
          { id: "SPUR2", role: "spur", lengthFt: 400, end: "buffer_stop" }
        ],
        switches: [
          { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
          { id: "S2", on: "SPUR1", to: "SPUR2", side: "left", approach: "facing", order: 1, distanceFt: 300 }
        ]
      })
    );
    // S2 sits at SPUR1 ft 290 + 300 = 590, which is main ft 580 + 590 = 1170; SPUR2 is 290 + 400 long and ends at 1860.
    expect(g.switches.get("S2")!.atFt).toBe(590);
    expect(g.tracks.get("SPUR2")!.totalFt).toBe(690);
    expect(g.tracks.get("MAIN")!.totalFt).toBe(1860);
  });

  test("a facility with no spots count gets floor(length / 60) spots and startFt is honoured", () => {
    const g = buildGraph(plan({ facilities: [{ id: "F", name: "Dock", kind: "warehouse", track: "SPUR1", startFt: 400, lengthFt: 150 }] }));
    const f = g.facilities.get("F")!;
    expect([f.startFt, f.endFt]).toEqual([400, 550]);
    expect(f.spots).toEqual([
      { n: 1, fromFt: 400, toFt: 460 },
      { n: 2, fromFt: 460, toFt: 520 }
    ]);
  });

  test("a facility with no lengthFt covers the branch's usable length from the clear point", () => {
    const g = buildGraph(plan({ facilities: [{ id: "F", name: "Yard", kind: "other", track: "SPUR1" }] }));
    const f = g.facilities.get("F")!;
    expect([f.startFt, f.endFt]).toEqual([290, 1090]);
    expect(f.spots.length).toBe(13);
  });

  test("a facility on a missing track is skipped", () => {
    const g = buildGraph(plan({ facilities: [{ id: "F", name: "Lost", kind: "other", track: "GHOST", lengthFt: 120 }] }));
    expect(g.facilities.has("F")).toBe(false);
  });

  test("a main with no switches still has a drawn length", () => {
    const g = buildGraph(plan({ tracks: [{ id: "MAIN", role: "main" }], switches: [] }));
    expect(g.tracks.get("MAIN")!.totalFt).toBe(380 + 200 + 240 + 380);
  });

  test("switches with no order keep their authored order and are spaced 400 ft apart", () => {
    const g = buildGraph(
      plan({
        tracks: [
          { id: "MAIN", role: "main", end: "continues" },
          { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
          { id: "SPUR2", role: "spur", lengthFt: 500, end: "buffer_stop" },
          { id: "SPUR3", role: "spur", lengthFt: 500, end: "buffer_stop" }
        ],
        switches: [
          { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing" },
          { id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing" },
          { id: "S3", on: "MAIN", to: "SPUR3", side: "left", approach: "facing" }
        ]
      })
    );
    expect([g.switches.get("S1")!.atFt, g.switches.get("S2")!.atFt, g.switches.get("S3")!.atFt]).toEqual([580, 980, 1380]);
  });
});
