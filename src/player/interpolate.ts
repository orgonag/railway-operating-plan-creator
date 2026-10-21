/**
 * Interpolate: the world state partway through a step, for the player.
 *
 * Pure. For each coupled group that moved, the path it occupied before the
 * move is joined with the step's travel (the leading end's walk), the slice
 * the group covers when the lead has gone `progress` of the travel is taken,
 * and the units are laid along it end to end, rear to head, with their exact
 * lengths: the same idea as the engine's own move. Units that did not move
 * keep their `before` place. Distances are feet on the track model, never
 * screen pixels.
 *
 * A group that stood offstage (no occupied path to read) is laid straight
 * behind the travel's start on the travel's first track, which is where the
 * engine keeps it. A step with no route (route_not_established) or no travel
 * returns `after`; the renderer shows that state as route-unclear.
 */

import type { Segment } from "../core/engine/graph";
import type { Id } from "../core/schema/types";
import { cleanPath, flipPath, pathLength, slicePath, type Place, type StepResult, type WorldState } from "../core/engine/state";

/** Ease-out cubic, as the portfolio demo: 1 - (1 - t)^3. */
export function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

export function interpolate(before: WorldState, after: WorldState, step: StepResult, progress: number): WorldState {
  if (step.status === "route_not_established" || step.status === "needs_attention") return copy(after);
  const travel = step.travel;
  if (!travel || step.moved.length === 0 || pathLength(travel) === 0) return copy(after);
  if (progress <= 0) return copy(before);
  if (progress >= 1) return copy(after);

  const places: Record<Id, Place> = { ...before.places };
  const moved = new Set(step.moved);
  const lengthOf = (id: Id): number => unitLength(before, after, id);

  for (const group of before.coupled) {
    if (!group.some((id) => moved.has(id))) continue;
    const laid = layGroup(group, before, travel, progress, lengthOf);
    if (!laid) {
      // Nothing to read off before (or the group does not meet the travel): show where it ends up.
      for (const id of group) {
        const place = after.places[id];
        if (place) places[id] = place;
      }
      continue;
    }
    for (const [id, segs] of laid) places[id] = { occupies: segs };
  }

  return { places, facing: { ...after.facing }, coupled: after.coupled.map((g) => [...g]), loaded: { ...after.loaded } };
}

/** The units of one moved group laid along its path partway through the travel, or undefined when that path cannot be built. */
function layGroup(
  group: Id[],
  before: WorldState,
  travel: Segment[],
  progress: number,
  lengthOf: (id: Id) => number
): Map<Id, Segment[]> | undefined {
  const first = travel[0]!;
  const start = { track: first.track, ft: first.fromFt };
  const len = group.reduce((sum, id) => sum + lengthOf(id), 0);
  if (len === 0) return undefined;

  let path: Segment[];
  let rearToHead: Id[];
  const occupied = groupPath(group, before);
  if (occupied) {
    const head = endOf(occupied);
    const rear = startOf(occupied);
    if (samePos(head, start)) {
      path = occupied;
      rearToHead = [...group];
    } else if (samePos(rear, start)) {
      path = flipPath(occupied);
      rearToHead = [...group].reverse();
    } else {
      return undefined;
    }
  } else {
    // Offstage before the move: stand the group straight behind the lead on the travel's first track.
    const dir = travelDir(travel);
    path = [{ track: start.track, fromFt: start.ft - dir * len, toFt: start.ft }];
    rearToHead = travelDir(travel) >= 0 ? [...group] : [...group].reverse();
  }

  const full = cleanPath([...path, ...travel]);
  const d = pathLength(travel) * progress;
  const slice = slicePath(full, d, d + len);
  const out = new Map<Id, Segment[]>();
  let at = 0;
  for (const id of rearToHead) {
    const unitLen = lengthOf(id);
    out.set(id, slicePath(slice, at, at + unitLen));
    at += unitLen;
  }
  return out;
}

/** The continuous path a group occupies in a state (its units' segments, rear to head), or undefined when any unit is offstage. */
function groupPath(group: Id[], state: WorldState): Segment[] | undefined {
  const segs: Segment[] = [];
  for (const id of group) {
    const place = state.places[id];
    if (!place || !("occupies" in place) || place.occupies.length === 0) return undefined;
    segs.push(...place.occupies);
  }
  return cleanPath(segs);
}

function unitLength(before: WorldState, after: WorldState, id: Id): number {
  for (const state of [before, after]) {
    const place = state.places[id];
    if (place && "occupies" in place) return pathLength(place.occupies);
  }
  return 0;
}

function startOf(path: Segment[]): { track: Id; ft: number } {
  const first = path[0]!;
  return { track: first.track, ft: first.fromFt };
}

function endOf(path: Segment[]): { track: Id; ft: number } {
  const last = path[path.length - 1]!;
  return { track: last.track, ft: last.toFt };
}

function samePos(a: { track: Id; ft: number }, b: { track: Id; ft: number }): boolean {
  return a.track === b.track && Math.abs(a.ft - b.ft) < 1e-6;
}

/** +1 when the travel's first stretch runs toward rising ft, -1 otherwise. */
function travelDir(travel: Segment[]): 1 | -1 {
  const first = travel.find((s) => s.fromFt !== s.toFt) ?? travel[0]!;
  return first.toFt >= first.fromFt ? 1 : -1;
}

function copy(state: WorldState): WorldState {
  return {
    places: { ...state.places },
    facing: { ...state.facing },
    coupled: state.coupled.map((g) => [...g]),
    loaded: { ...state.loaded }
  };
}
