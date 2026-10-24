// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";

import spurJson from "../../docs/schema/examples/spur-with-runaround.reading.json";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import { validateFile } from "../../src/core/schema/validateFile";
import { captionFor } from "../../src/player/player";

describe("captions for an expanded runaround", () => {
  test("captionFor gives the authored text for the first expanded step and the engine's own text for the rest", () => {
    const plan = materialize(validateFile(spurJson).plan!).plan;
    const sim = simulate(plan, buildGraph(plan));
    const ra = plan.work.find((w) => w.do === "runaround")!;
    const mine = sim.steps.filter((s) => String(s.stepId).startsWith(ra.id));
    expect(mine).toHaveLength(5);
    expect(captionFor(plan, mine[0]!)).toBe(ra.text);
    for (const s of mine.slice(1)) {
      const text = captionFor(plan, s);
      expect(text.length).toBeGreaterThan(12);
      expect(text).not.toBe("Run light");
      expect(text).not.toBe("Couple");
    }
  });
});
