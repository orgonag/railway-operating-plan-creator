import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { guessTurnout, HIT_LANES, nearestTrackPos } from "../../src/core/editing/hit";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { layout } from "../../src/core/layout/layout";
import { cloneJson } from "../../src/core/schema/clone";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;
const g = buildGraph(demo);
const d = layout(demo, g);

describe("nearestTrackPos", () => {
  test("a point on the demo main at xFt 700 lane 0.1 hits MAIN ft 700", () => {
    const hit = nearestTrackPos(d, g, { xFt: 700, lane: 0.1 });
    expect(hit).toMatchObject({ track: "MAIN", ft: 700, at: { xFt: 700, lane: 0 } });
    expect(hit!.laneDistance).toBeCloseTo(0.1);
  });

  test("a point on SPUR1's parallel stretch hits SPUR1 with ft measured from the points", () => {
    // SPUR1 leaves the main at x 580 and runs on lane 1 from x 820.
    const hit = nearestTrackPos(d, g, { xFt: 1203, lane: 1.05 });
    expect(hit).toMatchObject({ track: "SPUR1", ft: 620, at: { xFt: 1200, lane: 1 } });
  });

  test("a point 0.5 lanes from every track hits nothing", () => {
    expect(HIT_LANES).toBe(0.45);
    expect(nearestTrackPos(d, g, { xFt: 300, lane: 0.5 })).toBeNull();
    expect(nearestTrackPos(d, g, { xFt: 1200, lane: 0.5 })).toBeNull();
  });

  test("ft is clamped to the track and rounded to 10", () => {
    expect(nearestTrackPos(d, g, { xFt: -30, lane: 0 })).toMatchObject({ track: "MAIN", ft: 0 });
    expect(nearestTrackPos(d, g, { xFt: 1234, lane: 0 })).toMatchObject({ track: "MAIN", ft: 1230 });
  });

  test("on a right-entering plan the hit ft is still measured from the arrival end", () => {
    const mirrored = cloneJson(demo);
    mirrored.arrival.enters = "right";
    const gm = buildGraph(mirrored);
    const dm = layout(mirrored, gm);
    expect(nearestTrackPos(dm, gm, { xFt: dm.widthFt - 700, lane: 0 })).toMatchObject({ track: "MAIN", ft: 700 });
    // The spur now hangs below the main and runs toward the left.
    expect(nearestTrackPos(dm, gm, { xFt: dm.widthFt - 1200, lane: -1 })).toMatchObject({ track: "SPUR1", ft: 620 });
  });
});

describe("guessTurnout", () => {
  test("pointer above the main moving toward the far end is left facing; below moving back is right trailing", () => {
    const hit = nearestTrackPos(d, g, { xFt: 1400, lane: 0 })!;
    expect(
      guessTurnout(d, hit, [
        { xFt: 1300, lane: 0.3 },
        { xFt: 1350, lane: 0.3 },
        { xFt: 1400, lane: 0.3 }
      ])
    ).toEqual({ side: "left", approach: "facing" });
    expect(
      guessTurnout(d, hit, [
        { xFt: 1450, lane: -0.3 },
        { xFt: 1400, lane: -0.3 }
      ])
    ).toEqual({ side: "right", approach: "trailing" });
  });

  test("a still pointer gives facing; on a mirrored drawing up the page is the train's right", () => {
    const hit = nearestTrackPos(d, g, { xFt: 1400, lane: 0 })!;
    expect(guessTurnout(d, hit, [{ xFt: 1400, lane: 0.2 }])).toEqual({ side: "left", approach: "facing" });
    const mirrored = cloneJson(demo);
    mirrored.arrival.enters = "right";
    const gm = buildGraph(mirrored);
    const dm = layout(mirrored, gm);
    const hm = nearestTrackPos(dm, gm, { xFt: 300, lane: 0 })!;
    // Toward the far end is now toward the left of the drawing.
    expect(
      guessTurnout(dm, hm, [
        { xFt: 350, lane: 0.3 },
        { xFt: 300, lane: 0.3 }
      ])
    ).toEqual({ side: "right", approach: "facing" });
  });
});
