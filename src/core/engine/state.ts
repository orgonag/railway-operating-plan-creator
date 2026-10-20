/**
 * World states: what the engine produces for every step, plus the path
 * arithmetic the engine and its readers share.
 *
 * A path is a list of segments in one direction of travel; a segment with
 * fromFt > toFt runs toward falling ft. A coupled group occupies one continuous
 * path and its units are laid end to end along it.
 */

import type { Id } from "../schema/types";
import type { Segment } from "./graph";

/** Where one unit stands: its slice of a path (rear to head), or off the drawing. */
export type Place = { occupies: Segment[] } | { offstage: "arrival_end" | "far_end" };

export interface WorldState {
  places: Record<Id, Place>;
  /** A unit's front direction relative to rising ft on the track its front stands on. */
  facing: Record<Id, "up" | "down">;
  /** Each group in rising-ft order along the path it stands on. */
  coupled: Id[][];
  /** Cars only. */
  loaded: Record<Id, boolean>;
}

export type StepStatus = "ok" | "route_not_established" | "past_end" | "needs_attention";

export interface StepResult {
  stepId: Id | "arrival" | "departure";
  index: number;
  /** The verb shown for this step. Moves are named from the state: shove, pull, run_light. */
  verb: string;
  status: StepStatus;
  moved: Id[];
  /** The path the leading end covered, or null when there was no route. */
  travel: Segment[] | null;
  /** What the step asked for, kept when the step could not do it as written. */
  requested?: unknown;
  reason?: string;
}

export interface Simulation {
  initial: WorldState;
  states: WorldState[];
  steps: StepResult[];
}

export function segmentLength(s: Segment): number {
  return Math.abs(s.toFt - s.fromFt);
}

export function pathLength(path: Segment[]): number {
  return path.reduce((sum, s) => sum + segmentLength(s), 0);
}

/** The same path run the other way. */
export function flipPath(path: Segment[]): Segment[] {
  return [...path].reverse().map((s) => ({ track: s.track, fromFt: s.toFt, toFt: s.fromFt }));
}

/** Drop zero-length segments and join stretches that carry straight on along one track. */
export function cleanPath(path: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of path) {
    if (s.fromFt === s.toFt) continue;
    const last = out[out.length - 1];
    if (last && last.track === s.track && last.toFt === s.fromFt) last.toFt = s.toFt;
    else out.push({ track: s.track, fromFt: s.fromFt, toFt: s.toFt });
  }
  return out;
}

/** The stretch of a path between two distances measured from its start. */
export function slicePath(path: Segment[], startFt: number, endFt: number): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const s of path) {
    const len = segmentLength(s);
    const dir = s.toFt >= s.fromFt ? 1 : -1;
    const a = Math.max(startFt, at);
    const b = Math.min(endFt, at + len);
    if (b > a) out.push({ track: s.track, fromFt: s.fromFt + dir * (a - at), toFt: s.fromFt + dir * (b - at) });
    at += len;
  }
  return out;
}

/** How far along a path a position lies, or undefined when the path does not pass it. */
export function offsetOnPath(path: Segment[], track: Id, ft: number): number | undefined {
  let at = 0;
  for (const s of path) {
    const lo = Math.min(s.fromFt, s.toFt);
    const hi = Math.max(s.fromFt, s.toFt);
    if (s.track === track && ft >= lo && ft <= hi) return at + Math.abs(ft - s.fromFt);
    at += segmentLength(s);
  }
  return undefined;
}
