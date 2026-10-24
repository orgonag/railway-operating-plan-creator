// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { createHistory } from "../../src/core/commands/history";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { simulate } from "../../src/core/engine/simulate";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { attachAutosave, SAVE_DELAY_MS, SAVE_STATUS_TEXT, type SaveStatus } from "../../src/editor/store/autosave";
import { planFileName, readPlanFile } from "../../src/editor/store/file";
import { INDEX_KEY, lastOpenedId, listPlans, loadPlan, newLocalId, planKey, savePlan, setLastOpenedId, deletePlan } from "../../src/editor/store/storage";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("storage", () => {
  test("savePlan then loadPlan round-trips the demo and lists it newest first", () => {
    savePlan("a", demo);
    const later: PlanReading = { ...demo, title: "Later" };
    savePlan("b", later);
    expect(loadPlan("a")).toEqual(demo);
    expect(listPlans().map((m) => m.localId)).toEqual(["b", "a"]);
    expect(listPlans()[0]).toMatchObject({ localId: "b", title: "Later" });
    expect(typeof listPlans()[0]!.updatedAt).toBe("string");
    expect(loadPlan("missing")).toBeNull();
  });

  test("two ids saved in turn keep both index entries, and re-saving the first keeps the second", () => {
    savePlan("a", demo);
    savePlan("b", demo);
    savePlan("a", { ...demo, title: "A again" });
    expect(listPlans().map((m) => m.localId).sort()).toEqual(["a", "b"]);
    expect(listPlans()[0]).toMatchObject({ localId: "a", title: "A again" });
  });

  test("a corrupt index lists nothing and a later save rebuilds it with one entry", () => {
    localStorage.setItem(INDEX_KEY, "{not json");
    expect(listPlans()).toEqual([]);
    savePlan("a", demo);
    expect(listPlans()).toHaveLength(1);
  });

  test("an unreadable plan loads as null; deletePlan removes the key and the entry", () => {
    savePlan("a", demo);
    localStorage.setItem(planKey("a"), "garbage");
    expect(loadPlan("a")).toBeNull();
    deletePlan("a");
    expect(localStorage.getItem(planKey("a"))).toBeNull();
    expect(listPlans()).toEqual([]);
  });

  test("lastOpenedId round-trips; newLocalId gives 12 base36 characters, different each time", () => {
    expect(lastOpenedId()).toBeNull();
    setLastOpenedId("xyz");
    expect(lastOpenedId()).toBe("xyz");
    const a = newLocalId();
    const b = newLocalId();
    expect(a).toMatch(/^[0-9a-z]{12}$/);
    expect(a).not.toBe(b);
  });

  test("three partial moves survive a save and a reopen", () => {
    const h = createHistory(demo);
    for (const ft of [400, 500, 600]) {
      h.dispatch(
        {
          name: "addStep",
          step: { actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR1", stop: { track: "SPUR1", ft, end: "lead" }, text: `to ${ft}` },
          index: ft === 400 ? 0 : undefined
        },
        "move"
      );
    }
    // Put them in order at the front: 400 is at index 0, 500 and 600 were appended; reorder them to 1 and 2.
    const ids = h.plan.work.filter((w) => w.text.startsWith("to ")).map((w) => w.id);
    h.dispatch([{ name: "reorderStep", stepId: ids[1]!, index: 1 }, { name: "reorderStep", stepId: ids[2]!, index: 2 }], "order");
    savePlan("a", h.plan);
    const reopened = loadPlan("a")!;
    expect(reopened).toEqual(h.plan);
    const lead = (plan: PlanReading, i: number): number => {
      const sim = simulate(plan, buildGraph(plan));
      let max = -Infinity;
      for (const place of Object.values(sim.states[i]!.places)) {
        if ("occupies" in place) for (const s of place.occupies) if (s.track === "SPUR1") max = Math.max(max, s.fromFt, s.toFt);
      }
      return max;
    };
    expect([1, 2, 3].map((i) => lead(h.plan, i))).toEqual([400, 500, 600]);
    expect([1, 2, 3].map((i) => lead(reopened, i))).toEqual([400, 500, 600]);
  });
});

/** An in-memory Storage that counts writes and can be told to refuse them. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  writes: string[] = [];
  refuse = false;
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.refuse) throw new Error("QuotaExceededError");
    this.writes.push(key);
    this.map.set(key, value);
  }
}

describe("autosave", () => {
  test("autosave writes once after SAVE_DELAY_MS for three quick changes and reports saving then saved", () => {
    vi.useFakeTimers();
    const mem = new MemoryStorage();
    const h = createHistory(demo);
    const statuses: SaveStatus[] = [];
    const detach = attachAutosave(h, "a", (s) => statuses.push(s), mem);
    h.dispatch({ name: "setTitle", title: "One" }, "rename");
    h.dispatch({ name: "setTitle", title: "Two" }, "rename");
    h.dispatch({ name: "setTitle", title: "Three" }, "rename");
    expect(statuses).toEqual(["saving"]);
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(loadPlan("a", mem)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(loadPlan("a", mem)?.title).toBe("Three");
    expect(statuses).toEqual(["saving", "saved"]);
    expect(mem.writes.filter((k) => k === planKey("a"))).toHaveLength(1);
    detach();
    h.dispatch({ name: "setTitle", title: "Four" }, "rename");
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(loadPlan("a", mem)?.title).toBe("Three");
  });

  test("autosave reports failed when setItem throws", () => {
    vi.useFakeTimers();
    const mem = new MemoryStorage();
    mem.refuse = true;
    const h = createHistory(demo);
    const statuses: SaveStatus[] = [];
    attachAutosave(h, "a", (s) => statuses.push(s), mem);
    h.dispatch({ name: "setTitle", title: "One" }, "rename");
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(statuses).toEqual(["saving", "failed"]);
  });

  test("status texts are plain words", () => {
    expect(SAVE_STATUS_TEXT.saved).toBe("Saved in this browser");
    expect(SAVE_STATUS_TEXT.saving).toBe("Saving");
    expect(SAVE_STATUS_TEXT.failed).toBe("Could not save in this browser");
  });
});

describe("files", () => {
  test("planFileName of the demo is how-a-train-services-a-customer.reading.json", () => {
    expect(planFileName(demo)).toBe("how-a-train-services-a-customer.reading.json");
    expect(planFileName({ ...demo, title: "  ##  " })).toBe("plan.reading.json");
    expect(planFileName({ ...demo, title: "Spur 2: North End" })).toBe("spur-2-north-end.reading.json");
  });

  test("readPlanFile opens a plan file and rejects garbage with one problem and a null plan", async () => {
    const good = await readPlanFile(new File([JSON.stringify(demoJson)], "demo.json"));
    expect(good.problems).toEqual([]);
    expect(good.plan).toEqual(demo);
    const bad = await readPlanFile(new File(["not json"], "bad.json"));
    expect(bad.plan).toBeNull();
    expect(bad.problems).toHaveLength(1);
  });
});
