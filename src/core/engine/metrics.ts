/**
 * Plan metrics from one engine run (spec 6.4). Fixed meanings:
 * - a move is one movement of one coupled group: an arrival, move or departure
 *   step that moved at least one unit some distance along a route (stepMoves).
 *   A departure that leaves cars behind is needs_attention but its locos still
 *   move, and a 0 ft move is ok but is not a move;
 * - feet travelled is the lead's travel length, summed for the locos and for
 *   each car separately over the steps that moved them;
 * - switch throws count changes from normal. Every switch starts normal (the
 *   through route). A travel that crosses between a switch's parent and its
 *   branch sets it reverse; one that passes along the parent across the points
 *   sets it normal;
 * - couplings count ok couple steps;
 * - a step with no established route makes the totals incomplete.
 */

import type { Id, PlanReading } from "../schema/types";
import type { Segment, SwitchInfo, TrackGraph } from "./graph";
import { unitsOf } from "./materialize";
import { pathLength, stepMoves, type Simulation } from "./state";

export interface Metrics {
  moves: number;
  feetTravelled: { locos: number; cars: Record<Id, number> };
  switchThrows: number;
  couplings: number;
  complete: boolean;
}

export function metricsFor(sim: Simulation, plan: PlanReading, g: TrackGraph): Metrics {
  const locos = new Set<Id>();
  const cars: Record<Id, number> = {};
  for (const u of unitsOf(plan)) {
    if (u.kind === "loco") locos.add(u.id);
    else if (!(u.id in cars)) cars[u.id] = 0;
  }

  let moves = 0;
  let locoFeet = 0;
  let couplings = 0;
  let complete = true;
  const reverse = new Set<Id>();
  let switchThrows = 0;

  for (const step of sim.steps) {
    if (step.status === "route_not_established") complete = false;
    if (step.verb === "couple" && step.status === "ok") couplings += 1;
    if (!stepMoves(step)) continue;
    moves += 1;
    const feet = pathLength(step.travel);
    if (step.moved.some((id) => locos.has(id))) locoFeet += feet;
    for (const id of step.moved) if (id in cars) cars[id] = (cars[id] ?? 0) + feet;
    switchThrows += throwsAlong(step.travel, g, reverse);
  }

  return { moves, feetTravelled: { locos: locoFeet, cars }, switchThrows, couplings, complete };
}

/** Walk one travel path, update which switches stand reverse, and count the changes. */
function throwsAlong(travel: Segment[], g: TrackGraph, reverse: Set<Id>): number {
  let changes = 0;
  const set = (sw: SwitchInfo, toReverse: boolean): void => {
    if (reverse.has(sw.id) === toReverse) return;
    if (toReverse) reverse.add(sw.id);
    else reverse.delete(sw.id);
    changes += 1;
  };
  travel.forEach((s, i) => {
    for (const sw of g.switches.values()) {
      if (s.track === sw.on && Math.min(s.fromFt, s.toFt) < sw.atFt && Math.max(s.fromFt, s.toFt) > sw.atFt) set(sw, false);
    }
    const next = travel[i + 1];
    if (!next || next.track === s.track) return;
    for (const sw of g.switches.values()) {
      if (s.track === sw.on && next.track === sw.to && s.toFt === sw.atFt) set(sw, true);
      else if (s.track === sw.to && next.track === sw.on && next.fromFt === sw.atFt) set(sw, true);
    }
  });
  return changes;
}
