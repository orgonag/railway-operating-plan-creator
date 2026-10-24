/**
 * Hit testing: from a point on the drawing (feet and lanes) to a position on
 * a track. Reads the drawing's own points, so it works the same on a mirrored
 * drawing, and inverts `pointAt`: a track's ft 0 is its first drawn point and
 * ft rises along the direction the points run.
 *
 * Also the guess for a dropped turnout: which side the branch goes and which
 * way it points, read from where the pointer was and how it was moving.
 */

import type { TrackGraph } from "../engine/graph";
import { pointAt, type DrawPoint, type Drawing, type DrawnTrack } from "../layout/layout";
import type { Id, Side } from "../schema/types";

export interface TrackHit {
  track: Id;
  /** Along the track from its start, clamped to the track and rounded to 10 ft. */
  ft: number;
  /** The drawn point of that position, on the track. */
  at: DrawPoint;
  /** How far the pointer was from the track, in lanes. */
  laneDistance: number;
}

/** A point further than this from every track hits nothing. */
export const HIT_LANES = 0.45;
export const FT_STEP = 10;

export function roundFt(ft: number): number {
  return Math.round(ft / FT_STEP) * FT_STEP;
}

/** The lane of a drawn polyline at an x, or undefined when x lies outside its extent. */
function laneAtX(t: DrawnTrack, xFt: number): number | undefined {
  for (let i = 0; i + 1 < t.points.length; i += 1) {
    const a = t.points[i]!;
    const b = t.points[i + 1]!;
    const lo = Math.min(a.xFt, b.xFt);
    const hi = Math.max(a.xFt, b.xFt);
    if (xFt < lo || xFt > hi) continue;
    if (a.xFt === b.xFt) return a.lane;
    return a.lane + ((b.lane - a.lane) * (xFt - a.xFt)) / (b.xFt - a.xFt);
  }
  return undefined;
}

/** How far inside a track's x extent a point is: 0 at either end, larger toward the middle, negative outside. */
function depthInX(t: DrawnTrack, xFt: number): number {
  const xs = t.points.map((p) => p.xFt);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return Math.min(xFt - lo, hi - xFt);
}

/**
 * The nearest track by lane distance; a tie goes to the track the point lies
 * deeper inside along x (so the main beats a branch at its own points). A
 * point just past a track's end along x still hits it: the ft is clamped.
 */
export function nearestTrackPos(d: Drawing, g: TrackGraph, p: DrawPoint): TrackHit | null {
  let best: { t: DrawnTrack; laneDistance: number; depth: number } | undefined;
  for (const t of d.tracks) {
    const first = t.points[0];
    const last = t.points[t.points.length - 1];
    if (!first || !last) continue;
    const depth = depthInX(t, p.xFt);
    // Outside the x extent, measure against the nearer end point.
    const lane = laneAtX(t, p.xFt) ?? (Math.abs(p.xFt - first.xFt) <= Math.abs(p.xFt - last.xFt) ? first.lane : last.lane);
    const laneDistance = Math.abs(p.lane - lane);
    if (laneDistance > HIT_LANES) continue;
    if (depth < -FT_STEP * 3) continue;
    if (!best || laneDistance < best.laneDistance - 1e-9 || (Math.abs(laneDistance - best.laneDistance) <= 1e-9 && depth > best.depth)) {
      best = { t, laneDistance, depth };
    }
  }
  if (!best) return null;
  const t = best.t;
  const first = t.points[0]!;
  const last = t.points[t.points.length - 1]!;
  const sign = last.xFt >= first.xFt ? 1 : -1;
  const totalFt = g.tracks.get(t.id)?.totalFt ?? Math.abs(last.xFt - first.xFt);
  const ft = Math.min(totalFt, Math.max(0, roundFt(sign * (p.xFt - first.xFt))));
  return { track: t.id, ft, at: pointAt(d, g, { track: t.id, ft }).at, laneDistance: best.laneDistance };
}

/** The ft along a track for a drawing x, unclamped and unrounded; undefined when the drawing lacks the track. */
export function ftAtX(d: Drawing, track: Id, xFt: number): number | undefined {
  const t = d.tracks.find((x) => x.id === track);
  const first = t?.points[0];
  const last = t?.points[t.points.length - 1];
  if (!t || !first || !last) return undefined;
  const sign = last.xFt >= first.xFt ? 1 : -1;
  return sign * (xFt - first.xFt);
}

const DIRECTION_SAMPLES = 5;

/**
 * Side: the pointer's last lane relative to the track's lane at the hit, mapped
 * through the drawing's mirror to the arriving train's left or right (up the
 * page is the train's left when it enters from the left). Approach: facing
 * when the pointer's net x movement over its last samples points toward the
 * far end of the drawing, else trailing; a still pointer gives facing.
 */
export function guessTurnout(d: Drawing, hit: TrackHit, pointerPath: DrawPoint[]): { side: Side; approach: "facing" | "trailing" } {
  const last = pointerPath[pointerPath.length - 1] ?? hit.at;
  const up = last.lane >= hit.at.lane;
  const upIsLeft = d.boundaries.arrival_end === "left";
  const side: Side = up === upIsLeft ? "left" : "right";
  const from = pointerPath[Math.max(0, pointerPath.length - DIRECTION_SAMPLES)] ?? last;
  const dx = last.xFt - from.xFt;
  const towardFar = d.boundaries.far_end === "right" ? dx : -dx;
  return { side, approach: towardFar < 0 ? "trailing" : "facing" };
}
