/**
 * Place units: turn an engine world state into sprites on the drawing.
 *
 * Each on-track unit's centre is the drawn point halfway along its occupied
 * path (by length), and its tangent is the track direction there. Offstage
 * units are omitted. A unit that sticks out past a main boundary is placed by
 * the midpoint of the part still within the drawn main; one entirely beyond
 * is omitted. Cars past a buffer stop are drawn where they stand (convention
 * 10): nothing clips a branch.
 */

import type { Segment, TrackGraph } from "../engine/graph";
import type { Unit } from "../engine/materialize";
import type { WorldState } from "../engine/state";
import { pathLength, segmentLength } from "../engine/state";
import type { Id } from "../schema/types";
import { pointAt, type DrawPoint, type Drawing, type Tangent } from "./layout";

export interface Sprite {
  id: Id;
  kind: "loco" | "car";
  type: string;
  loaded: boolean;
  lengthFt: number;
  mark?: string;
  number?: string;
  centre: DrawPoint;
  tangent: Tangent;
}

export function placeUnits(d: Drawing, g: TrackGraph, s: WorldState, units: Map<Id, Unit>): Sprite[] {
  const main = d.tracks.find((t) => t.role === "main")?.id;
  const sprites: Sprite[] = [];
  for (const [id, unit] of units) {
    const place = s.places[id];
    if (!place || !("occupies" in place)) continue;
    const onDrawing = main === undefined ? place.occupies : clipToMain(place.occupies, main, d.widthFt);
    const mid = midpoint(onDrawing);
    if (!mid) continue;
    const { at, tangent } = pointAt(d, g, mid);
    const sprite: Sprite = {
      id,
      kind: unit.kind,
      type: unit.type,
      loaded: unit.kind === "car" ? (s.loaded[id] ?? false) : false,
      lengthFt: unit.lengthFt,
      centre: at,
      tangent
    };
    if (unit.mark !== undefined) sprite.mark = unit.mark;
    if (unit.number !== undefined) sprite.number = unit.number;
    sprites.push(sprite);
  }
  return sprites;
}

/** Keep only the parts of a path that lie within the drawn main; other tracks are kept whole. */
function clipToMain(path: Segment[], main: Id, widthFt: number): Segment[] {
  const out: Segment[] = [];
  for (const seg of path) {
    if (seg.track !== main) {
      out.push(seg);
      continue;
    }
    const clamp = (ft: number): number => Math.min(widthFt, Math.max(0, ft));
    const fromFt = clamp(seg.fromFt);
    const toFt = clamp(seg.toFt);
    const lo = Math.min(seg.fromFt, seg.toFt);
    const hi = Math.max(seg.fromFt, seg.toFt);
    const within = hi >= 0 && lo <= widthFt;
    if (!within) continue;
    if (fromFt === toFt && segmentLength(seg) > 0) continue;
    out.push({ track: seg.track, fromFt, toFt });
  }
  return out;
}

/** The position halfway along a path by length, or undefined for an empty path. */
function midpoint(path: Segment[]): { track: Id; ft: number } | undefined {
  const first = path[0];
  if (!first) return undefined;
  const half = pathLength(path) / 2;
  let at = 0;
  for (const seg of path) {
    const len = segmentLength(seg);
    if (at + len >= half) {
      const dir = seg.toFt >= seg.fromFt ? 1 : -1;
      return { track: seg.track, ft: seg.fromFt + dir * (half - at) };
    }
    at += len;
  }
  return { track: first.track, ft: first.fromFt };
}
