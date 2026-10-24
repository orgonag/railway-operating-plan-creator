/**
 * Following a drag: pointer samples on the drawing become the legs of a move.
 *
 * The pointer's samples are reduced to track hits. A running offset is kept
 * along the tracks the pointer follows (through switches, in either
 * direction), and the group moves the same distance along its own path with
 * the lead end that moves first. When the pointer clearly turns back the leg
 * ends at the furthest point reached and a second leg starts there with the
 * other end leading. A sample beyond the drawn main ends the drag off that
 * edge. Nothing here knows about pixels.
 */

import type { Pos, Segment, SwitchInfo, TrackGraph } from "../engine/graph";
import { cleanPath, pathLength, slicePath } from "../engine/state";
import type { DrawPoint, Drawing } from "../layout/layout";
import type { Id, OffstageEnd, Stop } from "../schema/types";
import { nearestTrackPos, type TrackHit } from "./hit";

/** A turn-back shorter than this is a wobble, not a reversal. */
export const REVERSAL_FT = 60;
/** The first hit this far from the grab point sets the direction of travel. */
const DIRECTION_FT = 10;
/** A walk that reaches the edge of the drawing from anywhere. */
const FAR_FT = 10_000_000;

export interface DragStart {
  /** The moving group's path, rear to head, canonical (first segment rises). */
  groupPath: Segment[];
  grabbed: Id;
  /** Rear to head along groupPath. */
  units: Id[];
}

export interface Leg {
  stop: Stop;
  via: Id[];
  /** The facility when the stop snapped to a spot, "offstage" when the move leaves the drawing. */
  to?: Id;
  spot?: number;
}

export interface DragResult {
  legs: Leg[];
  reversed: boolean;
}

type Heading = 1 | -1;

/** Where the pointer is along the tracks: its position and the heading in which the offset rises. */
interface Cursor {
  track: Id;
  ft: number;
  h: Heading;
}

type Sample = { kind: "hit"; hit: TrackHit } | { kind: "edge"; boundary: OffstageEnd };

export function followDrag(d: Drawing, g: TrackGraph, start: DragStart, samples: DrawPoint[]): DragResult | null {
  const main = d.tracks.find((t) => t.role === "main");
  const mainLo = main ? Math.min(...main.points.map((p) => p.xFt)) : 0;
  const mainHi = main ? Math.max(...main.points.map((p) => p.xFt)) : d.widthFt;
  const reduced: Sample[] = [];
  for (const p of samples) {
    if (p.xFt < mainLo || p.xFt > mainHi) {
      const side = p.xFt < mainLo ? "left" : "right";
      const boundary: OffstageEnd = d.boundaries.arrival_end === side ? "arrival_end" : "far_end";
      // Samples off the edge before the pointer has been on a track are where an offstage group is grabbed.
      if (reduced.length === 0) continue;
      reduced.push({ kind: "edge", boundary });
      break;
    }
    const hit = nearestTrackPos(d, g, p);
    if (hit) reduced.push({ kind: "hit", hit });
  }
  const grab = reduced[0];
  if (!grab || grab.kind !== "hit") return null;

  // The direction of travel: toward the first hit clearly away from the grab point, or toward the switch the pointer left by.
  let h0: Heading | undefined;
  let cur: Cursor | undefined;
  const offsets: number[] = [];
  let offset = 0;
  let edge: OffstageEnd | undefined;
  for (const s of reduced.slice(1)) {
    if (s.kind === "edge") {
      edge = s.boundary;
      break;
    }
    const hit = s.hit;
    if (!cur) {
      if (hit.track === grab.hit.track) {
        if (Math.abs(hit.ft - grab.hit.ft) < DIRECTION_FT) continue;
        h0 = hit.ft > grab.hit.ft ? 1 : -1;
      } else {
        const sw = joining(g, grab.hit.track, hit.track);
        if (!sw) continue;
        h0 = grab.hit.track === sw.on ? (sw.atFt >= grab.hit.ft ? 1 : -1) : -1;
      }
      cur = { track: grab.hit.track, ft: grab.hit.ft, h: h0 };
    }
    const step = advance(g, cur, hit);
    if (step === undefined) continue;
    offset += step;
    offsets.push(offset);
  }
  if (edge !== undefined && !cur) {
    // Straight off the edge from the grab point: the group leaves by that boundary.
    h0 = edge === "arrival_end" ? -1 : 1;
    cur = { track: grab.hit.track, ft: grab.hit.ft, h: h0 };
  }
  if (!cur || h0 === undefined) return { legs: [], reversed: false };

  // Reversal: the leg ends at the furthest point; the rest is a second leg (further turns extend it).
  let furthest = 0;
  let reversedAt = -1;
  offsets.forEach((o, i) => {
    if (o > furthest && reversedAt < 0) furthest = o;
    if (reversedAt < 0 && o < furthest - REVERSAL_FT) reversedAt = i;
  });
  const final = offsets[offsets.length - 1] ?? 0;
  const reversed = reversedAt >= 0;
  const firstDistance = reversed ? furthest : Math.max(0, final);
  const secondDistance = reversed ? Math.max(0, furthest - final) : 0;

  // The lead end of the first leg: the end of the group that moves first in h0 along the grab track.
  const segDir = directionAt(start.groupPath, grab.hit.track, grab.hit.ft);
  const leadHigh = segDir === h0;
  let path = leadHigh ? start.groupPath : flip(start.groupPath);
  const legs: Leg[] = [];

  const targetOf = (i: number): Pos | undefined => {
    const s = reduced[i];
    return s && s.kind === "hit" ? { track: s.hit.track, ft: s.hit.ft } : undefined;
  };
  const furthestIndex = reversed ? offsets.indexOf(furthest) + 1 : reduced.length - 1;

  if (edge !== undefined && !reversed) {
    legs.push(offstageLeg(g, d, path, edge));
    return { legs, reversed: false };
  }
  const first = moveLeg(g, path, firstDistance, targetOf(furthestIndex));
  if (first) {
    legs.push(first.leg);
    path = first.path;
  }
  if (reversed) {
    const back = flip(path);
    if (edge !== undefined) legs.push(offstageLeg(g, d, back, edge));
    else {
      const second = moveLeg(g, back, secondDistance, targetOf(reduced.length - 1));
      if (second) legs.push(second.leg);
    }
  }
  return { legs, reversed };
}

/** The spot whose far edge is nearest when a position lies within a facility's spots. */
export function snapToSpot(g: TrackGraph, pos: Pos): { facility: Id; spot: number } | null {
  let best: { facility: Id; spot: number; gap: number } | undefined;
  for (const [id, f] of g.facilities) {
    if (f.track !== pos.track || f.spots.length === 0) continue;
    if (pos.ft < f.startFt || pos.ft > f.endFt) continue;
    for (const s of f.spots) {
      const gap = Math.abs(pos.ft - s.toFt);
      if (!best || gap < best.gap) best = { facility: id, spot: s.n, gap };
    }
  }
  return best ? { facility: best.facility, spot: best.spot } : null;
}

// ---- following the pointer ----

/** The switch joining two tracks directly, if any. */
function joining(g: TrackGraph, a: Id, b: Id): SwitchInfo | undefined {
  for (const s of g.switches.values()) {
    if ((s.on === a && s.to === b) || (s.on === b && s.to === a)) return s;
  }
  return undefined;
}

/**
 * Move the cursor to a hit and return the signed change in offset, or undefined
 * when the hit is on a track the cursor cannot reach through one switch.
 */
function advance(g: TrackGraph, cur: Cursor, hit: TrackHit): number | undefined {
  if (hit.track === cur.track) {
    const delta = (hit.ft - cur.ft) * cur.h;
    cur.ft = hit.ft;
    return delta;
  }
  const sw = joining(g, cur.track, hit.track);
  if (!sw) return undefined;
  let toPoints: number;
  let leaveHeading: Heading;
  if (cur.track === sw.on) {
    toPoints = (sw.atFt - cur.ft) * cur.h;
    leaveHeading = 1; // onto the branch, away from its points
  } else {
    toPoints = (0 - cur.ft) * cur.h;
    leaveHeading = sw.approach === "facing" ? -1 : 1; // onto the parent, away from the branch
  }
  const forward: Heading = toPoints >= 0 ? 1 : -1;
  const h: Heading = (forward * leaveHeading) as Heading;
  const fromPoints = cur.track === sw.on ? hit.ft : hit.ft - sw.atFt;
  cur.track = hit.track;
  cur.ft = hit.ft;
  cur.h = h;
  return toPoints + fromPoints * h;
}

/** +1 when the path rises through a position on a track, -1 when it falls; the nearest segment on that track decides. */
function directionAt(path: Segment[], track: Id, ft: number): Heading {
  let best: { gap: number; dir: Heading } | undefined;
  for (const s of path) {
    if (s.track !== track) continue;
    const lo = Math.min(s.fromFt, s.toFt);
    const hi = Math.max(s.fromFt, s.toFt);
    const gap = ft < lo ? lo - ft : ft > hi ? ft - hi : 0;
    const dir: Heading = s.toFt >= s.fromFt ? 1 : -1;
    if (!best || gap < best.gap) best = { gap, dir };
  }
  return best?.dir ?? 1;
}

function flip(path: Segment[]): Segment[] {
  return [...path].reverse().map((s) => ({ track: s.track, fromFt: s.toFt, toFt: s.fromFt }));
}

function endOf(path: Segment[]): { pos: Pos; heading: "up" | "down" } {
  const last = path[path.length - 1]!;
  return { pos: { track: last.track, ft: last.toFt }, heading: last.toFt >= last.fromFt ? "up" : "down" };
}

/** Walk the lead by a distance toward the pointer's target and write the leg; returns the group's new path (trailing to lead). */
function moveLeg(g: TrackGraph, path: Segment[], distance: number, target: Pos | undefined): { leg: Leg; path: Segment[] } | undefined {
  if (distance <= 0) return undefined;
  const { pos, heading } = endOf(path);
  const walk = g.walk(pos, heading, distance, [], target) ?? [{ track: pos.track, fromFt: pos.ft, toFt: pos.ft + (heading === "up" ? distance : -distance) }];
  const full = cleanPath([...path, ...walk]);
  const len = pathLength(path);
  let next = slicePath(full, distance, distance + len);
  if (next.length === 0) next = [...path];
  const lead = endOf(next).pos;
  const leg: Leg = { stop: { track: lead.track, ft: lead.ft, end: "lead" }, via: switchesAlong(g, cleanPath(walk)) };
  const snapped = snapToSpot(g, lead);
  if (snapped) {
    const spot = g.facilities.get(snapped.facility)?.spots.find((s) => s.n === snapped.spot);
    if (spot) {
      leg.stop = { track: lead.track, ft: spot.toFt, end: "lead" };
      leg.to = snapped.facility;
      leg.spot = snapped.spot;
      const shift = spot.toFt - lead.ft;
      next = next.map((s) => (s.track === lead.track ? { track: s.track, fromFt: s.fromFt + shift, toFt: s.toFt + shift } : s));
    }
  }
  return { leg, path: next };
}

/** The leg that leaves the drawing: its via is whatever the lead passes on the way to that boundary. */
function offstageLeg(g: TrackGraph, d: Drawing, path: Segment[], boundary: OffstageEnd): Leg {
  const main = d.tracks.find((t) => t.role === "main")?.id;
  const { pos, heading } = endOf(path);
  let via: Id[] = [];
  if (main !== undefined) {
    const total = g.tracks.get(main)?.totalFt ?? d.widthFt;
    const route = g.route(pos, heading, { track: main, ft: boundary === "arrival_end" ? 0 : total }, []);
    if (route) via = route.switches;
    else {
      const walk = g.walk(pos, heading, FAR_FT, [], { track: main, ft: boundary === "arrival_end" ? -1 : total + 1 });
      if (walk) via = switchesAlong(g, walk);
    }
  }
  return { stop: { offstage: boundary }, via, to: "offstage" };
}

/**
 * The switches a path passes, in order: every set of points crossed on a track
 * (straight through or diverging) and every switch left through onto another
 * track, like the engine's own Route.switches. A switch at the very start of
 * the path is where the group already stands, so it is not counted.
 */
function switchesAlong(g: TrackGraph, path: Segment[]): Id[] {
  const out: Id[] = [];
  const add = (id: Id): void => {
    if (out[out.length - 1] !== id) out.push(id);
  };
  path.forEach((seg, i) => {
    const dir = seg.toFt >= seg.fromFt ? 1 : -1;
    const crossed = [...g.switches.values()]
      .filter((s) => s.on === seg.track && (s.atFt - seg.fromFt) * dir > 0 && (s.atFt - seg.toFt) * dir <= 0)
      .sort((a, b) => (a.atFt - b.atFt) * dir);
    for (const s of crossed) add(s.id);
    const next = path[i + 1];
    if (next && next.track !== seg.track) {
      const sw = joining(g, seg.track, next.track);
      if (sw) add(sw.id);
    }
  });
  return out;
}
