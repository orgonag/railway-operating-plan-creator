import { describe, expect, test } from "vitest";

import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import { layout } from "../../src/core/layout/layout";
import { validateFile } from "../../src/core/schema/validateFile";
import { TEMPLATES, templateById } from "../../src/editor/templates";

describe("templates", () => {
  test("single_spur makes a valid plan: one main, one facing left 600 ft spur, a 300 ft facility with 5 spots, one loco, no cars, no work", () => {
    const plan = templateById("single_spur").make();
    expect(validateFile(plan).problems).toEqual([]);
    expect(plan.tracks.map((t) => ({ id: t.id, role: t.role, lengthFt: t.lengthFt }))).toEqual([
      { id: "MAIN", role: "main", lengthFt: undefined },
      { id: "SPUR1", role: "spur", lengthFt: 600 }
    ]);
    expect(plan.switches[0]).toMatchObject({ on: "MAIN", to: "SPUR1", side: "left", approach: "facing" });
    expect(plan.facilities[0]).toMatchObject({ track: "SPUR1", lengthFt: 300, spots: 5 });
    expect(plan.consist.locos.count).toBe(1);
    expect(plan.consist.cuts).toEqual([]);
    expect(plan.work).toEqual([]);
    const sim = simulate(plan, buildGraph(plan));
    expect(sim.steps.map((s) => s.stepId)).toEqual(["arrival", "departure"]);
  });

  test("every template validates, materializes idempotently and simulates with no needs_attention steps", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["single_spur", "spur_with_runaround", "demo"]);
    for (const t of TEMPLATES) {
      const plan = t.make();
      expect(validateFile(plan).plan, t.id).not.toBeNull();
      const made = materialize(plan);
      expect(made.problems, t.id).toEqual([]);
      expect(made.plan, t.id).toEqual(plan);
      const g = buildGraph(plan);
      const sim = simulate(plan, g);
      expect(sim.steps.filter((s) => s.status === "needs_attention"), t.id).toEqual([]);
      expect(layout(plan, g).tracks.length, t.id).toBe(plan.tracks.length);
      expect(t.label.length).toBeGreaterThan(3);
    }
  });

  test("make returns a fresh copy every time", () => {
    const a = templateById("demo").make();
    const b = templateById("demo").make();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.title = "changed";
    expect(templateById("demo").make().title).not.toBe("changed");
  });
});
