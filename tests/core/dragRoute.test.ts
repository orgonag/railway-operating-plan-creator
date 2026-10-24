import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { applyCommand } from "../../src/core/commands/commands";
import { followDrag, REVERSAL_FT, snapToSpot, type DragStart } from "../../src/core/editing/dragRoute";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import { layout, type DrawPoint } from "../../src/core/layout/layout";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;
const g = buildGraph(demo);
const d = layout(demo, g);

/** The arriving train on MAIN 100 to 480, rear to head, grabbed by its head car. */
const train: DragStart = { groupPath: [{ track: "MAIN", fromFt: 100, toFt: 480 }], grabbed: "C1", units: ["L1", "C5", "C4", "C3", "C2", "C1"] };

function pts(...xy: Array<[number, number]>): DrawPoint[] {
  return xy.map(([xFt, lane]) => ({ xFt, lane }));
}

describe("followDrag", () => {
  test("the demo's arrival state is the train on MAIN 100 to 480", () => {
    const sim = simulate(demo, g);
    expect(sim.states[0]!.places["L1"]).toEqual({ occupies: [{ track: "MAIN", fromFt: 100, toFt: 180 }] });
    expect(sim.states[0]!.places["C1"]).toEqual({ occupies: [{ track: "MAIN", fromFt: 420, toFt: 480 }] });
  });

  test("dragging the train 400 ft along the main gives one leg on MAIN with the lead at 880", () => {
    const r = followDrag(d, g, train, pts([450, 0], [650, 0], [850, 0]));
    expect(r).toEqual({ legs: [{ stop: { track: "MAIN", ft: 880, end: "lead" }, via: ["S1"], lead: "high" }], reversed: false });
  });

  test("dragging up into SPUR1 records via S1 and snaps to spot 5 of RACKS when dropped at the racks", () => {
    // Up the main to the points at 580, onto the diagonal, then along the spur to ft 1010.
    const r = followDrag(d, g, train, pts([450, 0], [580, 0], [700, 0.5], [1000, 1], [1590, 1]));
    expect(r).toEqual({
      legs: [{ stop: { track: "SPUR1", ft: 1030, end: "lead" }, via: ["S1"], lead: "high", to: "RACKS", spot: 5 }],
      reversed: false
    });
  });

  test("a 40 ft wobble back is not a reversal; a 100 ft turn-back splits into two legs", () => {
    expect(REVERSAL_FT).toBe(60);
    const wobble = followDrag(d, g, train, pts([450, 0], [650, 0], [850, 0], [810, 0]));
    expect(wobble).toEqual({ legs: [{ stop: { track: "MAIN", ft: 840, end: "lead" }, via: ["S1"], lead: "high" }], reversed: false });
    const back = followDrag(d, g, train, pts([450, 0], [650, 0], [850, 0], [750, 0]));
    // Out 400 ft to a head at 880, then the loco leads 100 ft back from 500 to 400.
    expect(back).toEqual({
      legs: [
        { stop: { track: "MAIN", ft: 880, end: "lead" }, via: ["S1"], lead: "high" },
        { stop: { track: "MAIN", ft: 400, end: "lead" }, via: [], lead: "low" }
      ],
      reversed: true
    });
  });

  test("a drag out past S1 on the main and back into a second spur lists via S1 then S2", () => {
    const plan = applyCommand(demo, { name: "addTurnout", trackId: "MAIN", distanceFt: 820, side: "left", approach: "facing" }).plan;
    const g2 = buildGraph(plan);
    const d2 = layout(plan, g2);
    expect(g2.switches.get("S2")?.atFt).toBe(1400);
    // Past S1 at 580, on to the S2 points at 1400, then up the new spur T1 (on lane 2) to ft 400.
    const r = followDrag(d2, g2, train, pts([450, 0], [1000, 0], [1400, 0], [1500, 0.8], [1800, 2]));
    expect(r).toEqual({ legs: [{ stop: { track: "T1", ft: 430, end: "lead" }, via: ["S1", "S2"], lead: "high" }], reversed: false });
    // The engine plays that route.
    const sim = simulate(
      applyCommand(plan, {
        name: "addStep",
        step: { actor: "railroad", do: "shove", cars: ["LOADS"], to: "T1", via: ["S1", "S2"], text: "", stop: { track: "T1", ft: 430, end: "lead" } },
        index: 0
      }).plan,
      g2
    );
    expect(sim.steps[1]!.status).toBe("ok");
    expect(sim.states[1]!.places["C1"]).toEqual({ occupies: [{ track: "T1", fromFt: 370, toFt: 430 }] });
  });

  test("a reversal through a switch starts the second leg from the far point", () => {
    // Up into the spur to ft 300, then back out onto the main: the loco leads the second leg.
    const r = followDrag(d, g, train, pts([450, 0], [580, 0], [880, 1], [700, 0.5], [500, 0]));
    expect(r!.reversed).toBe(true);
    // The head car at 480 is 100 ft from the points, so 430 ft of travel puts it at SPUR1 330.
    expect(r!.legs[0]).toEqual({ stop: { track: "SPUR1", ft: 330, end: "lead" }, via: ["S1"], lead: "high" });
    // The group then stands from MAIN 530 up to SPUR1 330; the loco at 530 leads 380 ft back to 150.
    expect(r!.legs[1]).toEqual({ stop: { track: "MAIN", ft: 150, end: "lead" }, via: [], lead: "low" });
  });

  test("a drag off the arrival edge gives offstage arrival_end; a drag back in gives a stop on the main", () => {
    const out = followDrag(d, g, train, pts([450, 0], [200, 0], [-50, 0]));
    expect(out).toEqual({ legs: [{ stop: { offstage: "arrival_end" }, via: [], lead: "low", to: "offstage" }], reversed: false });
    // A loco standing off the arrival end, grabbed at the edge and dragged in.
    const offstage: DragStart = { groupPath: [{ track: "MAIN", fromFt: -80, toFt: 0 }], grabbed: "L1", units: ["L1"] };
    const back = followDrag(d, g, offstage, pts([-30, 0], [10, 0], [200, 0], [400, 0]));
    expect(back).toEqual({ legs: [{ stop: { track: "MAIN", ft: 390, end: "lead" }, via: [], lead: "high" }], reversed: false });
  });

  test("a drag off the far edge along the main passes S1 and leaves by the far_end boundary", () => {
    const r = followDrag(d, g, train, pts([450, 0], [900, 0], [1600, 0], [1700, 0]));
    expect(r).toEqual({ legs: [{ stop: { offstage: "far_end" }, via: ["S1"], lead: "high", to: "offstage" }], reversed: false });
  });

  test("samples that never hit a track return null; a drag that goes nowhere has no legs", () => {
    expect(followDrag(d, g, train, pts([300, 2], [500, 2.5]))).toBeNull();
    expect(followDrag(d, g, train, pts([450, 0], [453, 0]))).toEqual({ legs: [], reversed: false });
  });
});

describe("snapToSpot", () => {
  test("a position within the racks snaps to the spot whose far edge is nearest", () => {
    expect(snapToSpot(g, { track: "SPUR1", ft: 1040 })).toEqual({ facility: "RACKS", spot: 5 });
    expect(snapToSpot(g, { track: "SPUR1", ft: 800 })).toEqual({ facility: "RACKS", spot: 1 });
    expect(snapToSpot(g, { track: "SPUR1", ft: 700 })).toBeNull();
    expect(snapToSpot(g, { track: "MAIN", ft: 800 })).toBeNull();
  });
});

test("jitter near the grab point does not change which way the first leg goes", () => {
  const r = followDrag(d, g, train, pts([450, 0], [452, 0], [454, 0], [580, 0], [880, 1], [700, 0.5], [500, 0]));
  expect(r!.legs[0]).toEqual({ stop: { track: "SPUR1", ft: 330, end: "lead" }, via: ["S1"], lead: "high" });
});
