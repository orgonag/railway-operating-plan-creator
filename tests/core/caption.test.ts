import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { autoCaption } from "../../src/core/editing/caption";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;
const arrival = simulate(demo, buildGraph(demo)).states[0]!;
const train = ["L1", "C5", "C4", "C3", "C2", "C1"];

describe("autoCaption", () => {
  test("the demo shove reads 'Shove 5 loads to Unloading racks'", () => {
    expect(autoCaption(demo, arrival, train, { stop: { track: "SPUR1", ft: 1030, end: "lead" }, via: ["S1"], lead: "high", to: "RACKS", spot: 5 }, "shove")).toBe(
      "Shove 5 loads to Unloading racks"
    );
  });

  test("a run light to offstage reads 'Run light off the arrival end'", () => {
    expect(autoCaption(demo, arrival, ["L1"], { stop: { offstage: "arrival_end" }, via: ["S1"], lead: "low", to: "offstage" }, "run_light")).toBe("Run light off the arrival end");
    expect(autoCaption(demo, arrival, ["L1"], { stop: { track: "SPUR1", ft: 730, end: "lead" }, via: ["S1"], lead: "high" }, "run_light")).toBe("Run light to Customer siding");
  });

  test("mixed loads and empties read as cars; empties read as empties; a pull goes onto", () => {
    const mixed = { ...arrival, loaded: { ...arrival.loaded, C1: false } };
    expect(autoCaption(demo, mixed, train, { stop: { track: "SPUR1", ft: 1030, end: "lead" }, via: ["S1"], lead: "high", to: "RACKS", spot: 5 }, "shove")).toBe("Shove 5 cars to Unloading racks");
    const empties = { ...arrival, loaded: { C1: false, C2: false, C3: false, C4: false, C5: false } };
    expect(autoCaption(demo, empties, ["C2", "C1", "L1"], { stop: { track: "MAIN", ft: 530, end: "rear" }, via: ["S1"], lead: "low" }, "pull")).toBe("Pull 2 empties onto Main line");
    expect(autoCaption(demo, empties, ["C3", "C2", "C1"], { stop: { track: "SPUR1", ft: 500, end: "lead" }, via: [], lead: "high" }, "move")).toBe("Move 3 empties to Customer siding");
    expect(autoCaption(demo, arrival, ["C1"], { stop: { offstage: "far_end" }, via: [], lead: "high", to: "offstage" }, "shove")).toBe("Shove 1 load off the far end");
  });
});
