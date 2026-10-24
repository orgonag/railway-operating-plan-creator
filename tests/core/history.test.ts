import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { createHistory, HISTORY_LIMIT } from "../../src/core/commands/history";
import { materialize } from "../../src/core/engine/materialize";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

describe("createHistory", () => {
  test("dispatching three commands under one label undoes in one step", () => {
    const h = createHistory(demo);
    const r = h.dispatch(
      [
        { name: "addTurnout", trackId: "MAIN", distanceFt: 1400, side: "right", approach: "trailing" },
        { name: "setTrack", trackId: "T1", lengthFt: 600 },
        { name: "addFacility", trackId: "T1", startFt: 300, lengthFt: 300, label: "Dock", kind: "warehouse" }
      ],
      "add a spur"
    );
    expect(r.created).toEqual(["T1", "S2", "F1"]);
    expect(h.plan.tracks).toHaveLength(3);
    expect(h.canUndo).toBe(true);
    expect(h.entries().map((e) => e.label)).toEqual(["add a spur"]);
    expect(h.undo()).toBe(true);
    expect(h.plan).toEqual(demo);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(true);
    expect(h.plan.facilities).toHaveLength(2);
    expect(h.canRedo).toBe(false);
  });

  test("a no-op command adds no entry", () => {
    const h = createHistory(demo);
    h.dispatch({ name: "setTitle", title: demo.title }, "rename");
    expect(h.canUndo).toBe(false);
    expect(h.entries()).toEqual([]);
  });

  test("a failed command adds no entry and returns its problems", () => {
    const h = createHistory(demo);
    const r = h.dispatch({ name: "setTrack", trackId: "NOPE", lengthFt: 10 }, "stretch");
    expect(r.problems).toHaveLength(1);
    expect(h.canUndo).toBe(false);
  });

  test("a new dispatch after undo drops the redo stack", () => {
    const h = createHistory(demo);
    h.dispatch({ name: "setTitle", title: "One" }, "rename");
    h.dispatch({ name: "setTitle", title: "Two" }, "rename");
    h.undo();
    expect(h.canRedo).toBe(true);
    h.dispatch({ name: "setTitle", title: "Three" }, "rename");
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBe(false);
    expect(h.plan.title).toBe("Three");
    h.undo();
    expect(h.plan.title).toBe("One");
  });

  test("undo and redo on empty stacks return false and change nothing", () => {
    const h = createHistory(demo);
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
    expect(h.plan).toEqual(demo);
  });

  test("reset clears both stacks and notifies with cause reset", () => {
    const h = createHistory(demo);
    const causes: string[] = [];
    h.subscribe((_plan, cause) => causes.push(cause));
    h.dispatch({ name: "setTitle", title: "One" }, "rename");
    h.undo();
    const other: PlanReading = { ...demo, title: "Other" };
    h.reset(other);
    expect(h.plan.title).toBe("Other");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(causes).toEqual(["rename", "undo", "reset"]);
  });

  test("subscribers get the label as cause; unsubscribe stops calls", () => {
    const h = createHistory(demo);
    const seen: { title: string; cause: string }[] = [];
    const off = h.subscribe((plan, cause) => seen.push({ title: plan.title, cause }));
    h.dispatch({ name: "setTitle", title: "One" }, "rename");
    h.undo();
    h.redo();
    off();
    h.dispatch({ name: "setTitle", title: "Two" }, "rename");
    expect(seen).toEqual([
      { title: "One", cause: "rename" },
      { title: demo.title, cause: "undo" },
      { title: "One", cause: "redo" }
    ]);
  });

  test("the stack is capped at HISTORY_LIMIT entries, oldest dropped", () => {
    const h = createHistory(demo);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h.dispatch({ name: "setTitle", title: `T${i}` }, "rename");
    expect(h.entries()).toHaveLength(HISTORY_LIMIT);
    let undone = 0;
    while (h.undo()) undone++;
    expect(undone).toBe(HISTORY_LIMIT);
    expect(h.plan.title).toBe("T5");
  });

  test("undo after deleting a car restores the same car id in the same cut position", () => {
    const h = createHistory(demo);
    h.dispatch({ name: "deleteCar", carId: "C3" }, "delete car");
    expect(h.plan.consist.cuts[0]!.list!.map((c) => c.id)).toEqual(["C1", "C2", "C4", "C5"]);
    h.undo();
    expect(h.plan.consist.cuts[0]!.list!.map((c) => c.id)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(h.plan.consist.cuts[0]!.cars).toBe(5);
  });

  test("the plan a subscriber receives is not mutated by later dispatches", () => {
    const h = createHistory(demo);
    let first: PlanReading | undefined;
    h.subscribe((plan) => (first ??= plan));
    h.dispatch({ name: "setTitle", title: "One" }, "rename");
    h.dispatch({ name: "setTitle", title: "Two" }, "rename");
    expect(first?.title).toBe("One");
  });
});
