/**
 * Layout: the track graph in feet and lanes, ready for a renderer.
 *
 * The drawing is built in an unmirrored frame first: the arriving train runs
 * toward rising x, x on the main equals its ft, and the main sits on lane 0.
 * "Left" is the arriving train's left, which is up the page (positive lanes).
 * When the plan says the train enters from the right the whole frame is
 * mirrored at the very end: x' = widthFt - x, lane' = -lane. Nothing else in
 * the application knows about the mirror; the engine sees the same plan.
 *
 * A branch leaves its parent on a diagonal that covers the 240 ft turnout
 * (counted in feet along x) from the parent's lane to the branch's own lane,
 * then runs parallel. A facing branch runs toward rising x, a trailing branch
 * toward falling x. Branch ft 0 is the switch points either way.
 *
 * Lanes are a drawing convention, not a distance: the renderer stretches the
 * lane gap beyond scale. Angles are not computed here; `tangent` gives the
 * direction in (feet, lanes) and the renderer turns it into a screen angle
 * after applying its pixel scale and lane gap.
 */

import type { Pos, SwitchInfo, TrackGraph } from "../engine/graph";
import { TURNOUT_FT } from "../engine/graph";
import type { Direction, Id, PlanReading } from "../schema/types";

export interface DrawPoint {
  xFt: number;
  /** 0 is the main; positive is up the page. */
  lane: number;
}

export interface Tangent {
  dxFt: number;
  dLane: number;
}

export interface DrawnTrack {
  id: Id;
  role: string;
  /** The points, the end of the diagonal and the end of the track for a branch; both ends for the main. */
  points: DrawPoint[];
}

export interface DrawnSpot {
  n: number;
  fromXFt: number;
  toXFt: number;
}

export interface DrawnFacility {
  id: Id;
  name: string;
  fromXFt: number;
  toXFt: number;
  lane: number;
  spots: DrawnSpot[];
}

export type ScreenSide = "left" | "right";

export interface Drawing {
  widthFt: number;
  tracks: DrawnTrack[];
  facilities: DrawnFacility[];
  compass: { left: string; right: string };
  arrivalArrow: { side: ScreenSide; label: string };
  bufferStops: DrawPoint[];
  boundaries: { arrival_end: ScreenSide; far_end: ScreenSide };
}

/** Where a track lies in the unmirrored frame. */
interface Placement {
  /** x of ft 0. */
  x0: number;
  /** +1 when ft rises with x, -1 when it falls. */
  sign: 1 | -1;
  /** The lane at ft 0 (the parent's lane). */
  fromLane: number;
  /** The lane the track runs on once clear of its diagonal. */
  lane: number;
  /** Feet over which the lane changes: the turnout for a branch, none for the main. */
  diagonalFt: number;
}

const FROM: Record<Direction, string> = { eastbound: "West", westbound: "East", northbound: "South", southbound: "North" };
const TOWARD: Record<Direction, string> = { eastbound: "East", westbound: "West", northbound: "North", southbound: "South" };

export function layout(plan: PlanReading, g: TrackGraph): Drawing {
  const mainId = plan.arrival.on;
  const widthFt = g.tracks.get(mainId)?.totalFt ?? 0;
  const placements = placeTracks(g, mainId);
  const mirror = plan.arrival.enters === "right";
  const flip = (p: DrawPoint): DrawPoint => (mirror ? { xFt: widthFt - p.xFt, lane: negate(p.lane) } : p);
  const flipX = (x: number): number => (mirror ? widthFt - x : x);

  const tracks: DrawnTrack[] = [];
  const bufferStops: DrawPoint[] = [];
  for (const t of g.tracks.values()) {
    const pl = placements.get(t.id);
    if (!pl) continue;
    const raw: DrawPoint[] = [{ xFt: pl.x0, lane: pl.fromLane }];
    if (pl.diagonalFt > 0) raw.push({ xFt: pl.x0 + pl.sign * pl.diagonalFt, lane: pl.lane });
    if (t.ends.end.kind === "switch" && pl.diagonalFt > 0) {
      // A rejoining branch closes back onto its parent's lane with a second diagonal at its second switch.
      raw.push({ xFt: pl.x0 + pl.sign * (t.totalFt - pl.diagonalFt), lane: pl.lane });
      raw.push({ xFt: pl.x0 + pl.sign * t.totalFt, lane: pl.fromLane });
    } else raw.push({ xFt: pl.x0 + pl.sign * t.totalFt, lane: pl.lane });
    const points = raw.map(flip);
    tracks.push({ id: t.id, role: t.role, points });
    if (t.ends.end.kind === "buffer") bufferStops.push(points[points.length - 1]!);
  }

  const facilities: DrawnFacility[] = [];
  const names = new Map(plan.facilities.map((f) => [f.id, f.name]));
  for (const [id, f] of g.facilities) {
    const pl = placements.get(f.track);
    if (!pl) continue;
    const span = (fromFt: number, toFt: number): { fromXFt: number; toXFt: number } => {
      const a = flipX(pl.x0 + pl.sign * fromFt);
      const b = flipX(pl.x0 + pl.sign * toFt);
      return { fromXFt: Math.min(a, b), toXFt: Math.max(a, b) };
    };
    facilities.push({
      id,
      name: names.get(id) ?? id,
      ...span(f.startFt, f.endFt),
      lane: negateIf(mirror, pl.lane),
      spots: f.spots.map((s) => ({ n: s.n, ...span(s.fromFt, s.toFt) }))
    });
  }

  const direction = plan.arrival.direction;
  const arrivalSide: ScreenSide = mirror ? "right" : "left";
  const farSide: ScreenSide = mirror ? "left" : "right";
  const compass = mirror
    ? { left: TOWARD[direction], right: FROM[direction] }
    : { left: FROM[direction], right: TOWARD[direction] };

  return {
    widthFt,
    tracks,
    facilities,
    compass,
    arrivalArrow: { side: arrivalSide, label: capitalise(direction) },
    bufferStops,
    boundaries: { arrival_end: arrivalSide, far_end: farSide }
  };
}

/**
 * The drawn point for a track position and the direction of rising ft there.
 * Reads the drawing's own points, so it works the same on a mirrored drawing.
 * A ft beyond the track's bounds carries the last stretch straight on.
 */
export function pointAt(d: Drawing, g: TrackGraph, p: Pos): { at: DrawPoint; tangent: Tangent } {
  const t = d.tracks.find((x) => x.id === p.track);
  const first = t?.points[0];
  const last = t?.points[t.points.length - 1];
  if (!t || !first || !last) {
    // A track the drawing does not know: draw it along the main's line so nothing is lost.
    return { at: { xFt: p.ft, lane: 0 }, tangent: { dxFt: 1, dLane: 0 } };
  }
  const sign: 1 | -1 = last.xFt >= first.xFt ? 1 : -1;
  const xFt = first.xFt + sign * p.ft;
  // The points run in rising ft; find the stretch this ft falls in and follow its slope.
  let along = 0;
  for (let i = 0; i + 1 < t.points.length; i += 1) {
    const a = t.points[i]!;
    const b = t.points[i + 1]!;
    const len = Math.abs(b.xFt - a.xFt);
    const isLast = i + 2 === t.points.length;
    if (p.ft < along + len || isLast) {
      if (len === 0) return { at: { xFt, lane: b.lane }, tangent: { dxFt: sign, dLane: 0 } };
      const slope = (b.lane - a.lane) / len;
      if (p.ft < along) return { at: { xFt, lane: a.lane }, tangent: { dxFt: sign, dLane: 0 } };
      if (isLast && p.ft > along + len) return { at: { xFt, lane: b.lane }, tangent: { dxFt: sign, dLane: 0 } };
      return { at: { xFt, lane: a.lane + slope * (p.ft - along) }, tangent: { dxFt: sign, dLane: slope } };
    }
    along += len;
  }
  return { at: { xFt, lane: last.lane }, tangent: { dxFt: sign, dLane: 0 } };
}

/**
 * Lanes and x origins for the main and every branch reachable from it through
 * its switches. Lanes go out in switch order: branches off the main on the left
 * take +1, +2, ...; on the right -1, -2, ...; a branch off a branch takes the
 * next free lane beyond its parent on its own side. Each branch has its own lane.
 */
function placeTracks(g: TrackGraph, mainId: Id): Map<Id, Placement> {
  const out = new Map<Id, Placement>();
  const taken = new Set<number>([0]);
  out.set(mainId, { x0: 0, sign: 1, fromLane: 0, lane: 0, diagonalFt: 0 });

  const switchesOn = new Map<Id, SwitchInfo[]>();
  for (const s of g.switches.values()) {
    const list = switchesOn.get(s.on) ?? [];
    list.push(s);
    switchesOn.set(s.on, list);
  }

  const queue: Id[] = [mainId];
  for (let i = 0; i < queue.length; i += 1) {
    const parentId = queue[i]!;
    const parent = out.get(parentId)!;
    const list = [...(switchesOn.get(parentId) ?? [])].sort((a, b) => a.atFt - b.atFt);
    for (const s of list) {
      const branch = g.tracks.get(s.to);
      if (!branch || out.has(s.to) || branch.ends.start.kind !== "switch" || branch.ends.start.switch !== s.id) continue;
      const step = s.side === "left" ? 1 : -1;
      let lane = parent.lane + step;
      while (taken.has(lane)) lane += step;
      taken.add(lane);
      const x0 = parent.x0 + parent.sign * s.atFt;
      const sign: 1 | -1 = s.approach === "facing" ? parent.sign : parent.sign === 1 ? -1 : 1;
      out.set(s.to, { x0, sign, fromLane: laneAt(parent, s.atFt), lane, diagonalFt: TURNOUT_FT });
      queue.push(s.to);
    }
  }
  return out;
}

/** The lane of a placed track at a ft along it. */
function laneAt(pl: Placement, ft: number): number {
  if (pl.diagonalFt === 0 || ft >= pl.diagonalFt) return pl.lane;
  return pl.fromLane + ((pl.lane - pl.fromLane) * Math.max(0, ft)) / pl.diagonalFt;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Negate without producing -0, which would make equal drawings compare unequal. */
export function negate(v: number): number {
  return v === 0 ? 0 : -v;
}

function negateIf(yes: boolean, v: number): number {
  return yes ? negate(v) : v;
}
