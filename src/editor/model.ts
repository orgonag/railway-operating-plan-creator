/**
 * The editor's state and the one place the core is run. `compute` rebuilds
 * everything from the plan after every command; nothing in the editor keeps
 * a world state of its own.
 */

import { buildGraph, type TrackGraph } from "../core/engine/graph";
import { unitsOf, type Unit } from "../core/engine/materialize";
import { notesFor, type Note } from "../core/engine/notes";
import { simulate, type Simulation } from "../core/engine/simulate";
import { layout, type Drawing } from "../core/layout/layout";
import type { Id, PlanReading } from "../core/schema/types";

export interface Computed {
  g: TrackGraph;
  sim: Simulation;
  notes: Note[];
  drawing: Drawing;
  units: Map<Id, Unit>;
}

export function compute(plan: PlanReading): Computed {
  const g = buildGraph(plan);
  const sim = simulate(plan, g);
  return { g, sim, notes: notesFor(sim, plan, g), drawing: layout(plan, g), units: new Map(unitsOf(plan).map((u) => [u.id, u])) };
}

export type Selection =
  | { kind: "none" }
  | { kind: "track"; id: Id }
  | { kind: "switch"; id: Id }
  | { kind: "facility"; id: Id }
  | { kind: "units"; ids: Id[] }
  | { kind: "step"; id: Id | "arrival" | "departure" };

export interface EditorState {
  plan: PlanReading;
  computed: Computed;
  /** Index into computed.sim.steps: 0 is the arrival. */
  stepIndex: number;
  selection: Selection;
  showSpots: boolean;
}

/** The index in sim.steps of a step id, or undefined. */
export function stepIndexOf(computed: Computed, id: Id | "arrival" | "departure"): number | undefined {
  const i = computed.sim.steps.findIndex((s) => s.stepId === id);
  return i < 0 ? undefined : i;
}
