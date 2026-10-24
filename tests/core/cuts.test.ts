import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { planCut } from "../../src/core/editing/cuts";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;
const arrival = simulate(demo, buildGraph(demo)).states[0]!;

describe("planCut", () => {
  test("the arrival is one group [L1,C5,C4,C3,C2,C1]", () => {
    expect(arrival.coupled).toEqual([["L1", "C5", "C4", "C3", "C2", "C1"]]);
  });

  test("selecting the whole group needs no uncouple", () => {
    expect(planCut(arrival, ["C1", "C2", "C3", "C4", "C5", "L1"])).toEqual({ uncouples: [], movingUnits: ["L1", "C5", "C4", "C3", "C2", "C1"] });
  });

  test("selecting C1 and C2 at the head of [L1,C5,C4,C3,C2,C1] needs one uncouple between C3 and C2", () => {
    expect(planCut(arrival, ["C1", "C2"])).toEqual({ uncouples: [["C3", "C2"]], movingUnits: ["C2", "C1"] });
    expect(planCut(arrival, ["L1"])).toEqual({ uncouples: [["L1", "C5"]], movingUnits: ["L1"] });
  });

  test("selecting C3 alone needs two uncouples", () => {
    expect(planCut(arrival, ["C3"])).toEqual({
      uncouples: [
        ["C4", "C3"],
        ["C3", "C2"]
      ],
      movingUnits: ["C3"]
    });
  });

  test("a non-contiguous selection returns null", () => {
    expect(planCut(arrival, ["C1", "C3"])).toBeNull();
    expect(planCut(arrival, [])).toBeNull();
    expect(planCut(arrival, ["C1", "NOPE"])).toBeNull();
  });

  test("a selection across two groups returns null", () => {
    const cut = { ...arrival, coupled: [["L1"], ["C5", "C4", "C3", "C2", "C1"]] };
    expect(planCut(cut, ["L1", "C5"])).toBeNull();
    expect(planCut(cut, ["C5", "C4"])).toEqual({ uncouples: [["C4", "C3"]], movingUnits: ["C5", "C4"] });
  });
});
