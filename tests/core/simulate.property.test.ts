import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { Id, PlanReading, Stop, WorkStep } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { groupsOf, materialize, unitsOf } from "../../src/core/engine/materialize";
import { buildGraph, type Pos, type Segment, type TrackGraph } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import type { Place, WorldState } from "../../src/core/engine/state";

/**
 * Property test: 200 random step lists over the demo graph, including invalid
 * targets and deleted references. The generator is seeded (mulberry32), so a
 * failure can be replayed by its run number.
 */

const SEED = 20261020;
const RUNS = 200;
const STEPS_PER_RUN = 12;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
  constructor(private readonly next: () => number) {}
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

const demo = materialize(validateFile(demoJson).plan as PlanReading).plan;
const graph = buildGraph(demo);
const unitIds = unitsOf(demo).map((u) => u.id);
const lengths = new Map(unitsOf(demo).map((u) => [u.id, u.lengthFt]));
const groups = groupsOf(demo);
const knownIds = new Set([...unitIds, ...Object.keys(groups)]);

const CARS_CHOICES: Array<Id[] | undefined> = [undefined, ["LOADS"], ["C1"], ["C3"], ["L1"], ["GHOST"], ["C2", "GHOST"], ["C1", "C5"]];
const TO_CHOICES: Array<Id | undefined> = [undefined, "RACKS", "SPUR1", "MAIN", "offstage", "NOPE"];
const TRACKS = ["MAIN", "SPUR1", "NOWHERE"];

function randomStop(g: Gen): Stop {
  const kind = g.int(0, 2);
  const end = g.pick(["lead", "rear"] as const);
  if (kind === 0) return { track: g.pick(TRACKS), ft: g.int(-500, 3000), end };
  if (kind === 1) return { beyond: g.pick(["S1", "S9"]), ft: g.int(0, 600), end };
  return { offstage: g.pick(["arrival_end", "far_end"] as const) };
}

function randomStep(g: Gen, n: number): WorkStep {
  const id = `R${n}`;
  const kind = g.int(0, 11);
  const cars = g.pick(CARS_CHOICES);
  const move = (verb: "shove" | "pull" | "run_light"): WorkStep => {
    const step: WorkStep = { id, actor: "railroad", do: verb, text: "" };
    if (cars) step.cars = cars;
    const to = g.pick(TO_CHOICES);
    if (to !== undefined) step.to = to;
    if (g.chance(0.4)) step.via = g.pick([["S1"], ["S9"], ["S1", "S9"]]);
    if (g.chance(0.3)) step.spot = g.int(0, 7);
    if (g.chance(0.6)) step.stop = randomStop(g);
    return step;
  };
  switch (kind) {
    case 0:
    case 1:
    case 2:
      return move("shove");
    case 3:
    case 4:
      return move("pull");
    case 5:
      return move("run_light");
    case 6: {
      const step: WorkStep = { id, actor: "railroad", do: "cut_off", text: "" };
      if (cars) step.cars = cars;
      return step;
    }
    case 7: {
      const step: WorkStep = { id, actor: "railroad", do: "couple", text: "" };
      if (cars) step.cars = cars;
      return step;
    }
    case 8:
      return { id, actor: "railroad", do: "uncouple", between: [g.pick(unitIds), g.pick([...unitIds, "GHOST"])], text: "" };
    case 9:
      return { id, actor: "railroad", do: "runaround", text: "" };
    case 10: {
      const step: WorkStep = { id, actor: "customer", do: g.pick(["load", "unload"] as const), text: "" };
      if (cars) step.cars = cars;
      return step;
    }
    default:
      return { id, do: "note", text: "" };
  }
}

function namedIds(step: WorkStep): Id[] {
  const out: Id[] = [];
  if ("cars" in step && step.cars) out.push(...step.cars);
  if ("between" in step && step.between) out.push(...step.between);
  return out;
}

function segLen(s: Segment): number {
  return Math.abs(s.toFt - s.fromFt);
}

function occupiedLength(place: Place): number | undefined {
  return "occupies" in place ? place.occupies.reduce((sum, s) => sum + segLen(s), 0) : undefined;
}

/** Two path positions are the same point: equal on one track, or the two sides of a switch's points. */
function samePoint(g: TrackGraph, a: Pos, b: Pos): boolean {
  if (a.track === b.track && a.ft === b.ft) return true;
  for (const s of g.switches.values()) {
    const onParent = (p: Pos): boolean => p.track === s.on && p.ft === s.atFt;
    const onBranch = (p: Pos): boolean => p.track === s.to && p.ft === 0;
    if ((onParent(a) && onBranch(b)) || (onBranch(a) && onParent(b))) return true;
  }
  return false;
}

function endToEnd(g: TrackGraph, state: WorldState): void {
  for (const group of state.coupled) {
    for (let i = 0; i + 1 < group.length; i += 1) {
      const a = state.places[group[i]!];
      const b = state.places[group[i + 1]!];
      if (!a || !b || !("occupies" in a) || !("occupies" in b)) continue;
      const tail = a.occupies[a.occupies.length - 1]!;
      const head = b.occupies[0]!;
      expect(samePoint(g, { track: tail.track, ft: tail.toFt }, { track: head.track, ft: head.fromFt })).toBe(true);
    }
  }
}

describe("simulate: properties over random step lists", () => {
  test(`${RUNS} seeded runs (seed ${SEED}) keep every invariant`, () => {
    const g = new Gen(mulberry32(SEED));
    for (let run = 0; run < RUNS; run += 1) {
      const count = g.int(1, STEPS_PER_RUN);
      const work: WorkStep[] = [];
      for (let n = 1; n <= count; n += 1) work.push(randomStep(g, n));
      const plan = cloneJson(demo);
      plan.work = work;
      const label = `run ${run}: ${JSON.stringify(work)}`;

      let sim;
      try {
        sim = simulate(plan, graph);
      } catch (error) {
        throw new Error(`${label}\nsimulate threw: ${String(error)}`);
      }

      expect(sim.states.length, label).toBe(sim.steps.length);
      expect(sim.steps.length, label).toBe(work.length + 2);

      sim.states.forEach((state, i) => {
        const step = sim.steps[i]!;
        const where = `${label}\nstep ${i} (${step.stepId} ${step.verb}: ${step.status} ${step.reason ?? ""})`;

        expect(step.reason ?? "", where).not.toMatch(/^internal/);
        expect(Object.keys(state.places).sort(), where).toEqual([...unitIds].sort());
        for (const id of unitIds) {
          const len = occupiedLength(state.places[id]!);
          if (len !== undefined) expect(len, `${where}\n${id}`).toBe(lengths.get(id));
          expect(["up", "down"], where).toContain(state.facing[id]);
        }
        const seen = new Map<Id, number>();
        for (const group of state.coupled) for (const id of group) seen.set(id, (seen.get(id) ?? 0) + 1);
        expect([...seen.keys()].sort(), where).toEqual([...unitIds].sort());
        for (const [id, n] of seen) expect(n, `${where}\n${id} appears ${n} times`).toBe(1);

        if (step.status === "ok") endToEnd(graph, state);

        const authored = i >= 1 && i <= work.length ? work[i - 1]! : undefined;
        if (authored) {
          expect(step.stepId, where).toBe(authored.id);
          const unknown = namedIds(authored).filter((id) => !knownIds.has(id));
          if (unknown.length > 0) {
            expect(step.status, where).toBe("needs_attention");
            expect(step.moved, where).toEqual([]);
          }
          if (authored.do === "runaround") expect(step.status, where).toBe("needs_attention");
          if (step.status === "needs_attention") {
            expect(state, where).toEqual(sim.states[i - 1]);
          }
          const stop = "stop" in authored ? authored.stop : undefined;
          if (step.status === "ok" && stop && "track" in stop) {
            const ends = step.moved.flatMap((id) => {
              const place = state.places[id]!;
              if (!("occupies" in place)) return [];
              const first = place.occupies[0]!;
              const last = place.occupies[place.occupies.length - 1]!;
              return [
                { track: first.track, ft: first.fromFt },
                { track: last.track, ft: last.toFt }
              ];
            });
            const want = { track: stop.track, ft: stop.ft };
            expect(ends.some((p) => samePoint(graph, p, want)), `${where}\nnobody ends at ${stop.track} ${stop.ft}`).toBe(true);
            const info = graph.tracks.get(stop.track)!;
            expect(stop.ft >= 0 && stop.ft <= info.totalFt, `${where}\nok with an out-of-range stop`).toBe(true);
          }
          if (step.status === "ok" && stop && "offstage" in stop) {
            for (const id of step.moved) expect(state.places[id], where).toEqual({ offstage: stop.offstage });
          }
          if (step.status === "route_not_established") expect(step.travel, where).toBeNull();
        }
      });
    }
  });
});
