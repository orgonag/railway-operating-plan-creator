/**
 * Track graph in feet. Builds the physical model the engine and layout read:
 * where every switch sits, how long every track is, where facilities and
 * spots are, and how to walk or route from one position to another.
 *
 * Conventions (owner-confirmed, see docs/reference/demo-expected-states.md):
 * 1. Distances on a track run from its start: the arrival end for the main,
 *    the switch points for a branch.
 * 2. The turnout is drawn 240 ft from the points, the clear point 290 ft. A
 *    branch's usable length starts at the clear point, so its total is
 *    290 + lengthFt, with any buffer stop at that total.
 * 3. The fouling zone runs from the points 290 ft toward the frog on both the
 *    through and the diverging track.
 * 4. The first switch on the main sits (train length + 200) from the arrival
 *    end; the main runs past its last switch by (240 + train length).
 * 6. Spots are 60 ft each from the facility start, spot 1 nearest the switch.
 *    A facility with no startFt sits at the far end of its track.
 *
 * Geometry of a branch: a facing switch's branch leaves toward rising parent
 * ft, a trailing switch's branch leaves toward falling parent ft. Branch ft 0
 * is the points either way, and reaching it means reaching the switch, not an
 * end of track.
 *
 * The graph never throws on a schema-valid plan. A switch or facility that
 * names a track the plan does not have is left out.
 */

import type { Id, PlanReading, Switch, Track } from "../schema/types";
import { initialOrder, unitsOf } from "./materialize";

export const TURNOUT_FT = 240;
export const CLEAR_FT = 290;
export const APPROACH_MARGIN_FT = 200;
export const ARRIVAL_SHORT_FT = 100;
/** Usable length of a branch that gives none. */
export const DEFAULT_BRANCH_USABLE_FT = 400;
/** Gap between switches on the same track when no distanceFt is given. */
export const DEFAULT_SWITCH_GAP_FT = 400;
/** Spot pitch (convention 6). Fixed at 60 ft; it does not follow the plan's car length. */
export const SPOT_LENGTH_FT = 60;

export type Heading = "up" | "down";

export interface Pos {
  track: Id;
  ft: number;
}

/** A stretch of one track in the direction of travel, so fromFt > toFt is allowed. */
export interface Segment {
  track: Id;
  fromFt: number;
  toFt: number;
}

export type End =
  | { kind: "boundary"; name: "arrival_end" | "far_end" }
  | { kind: "buffer" }
  | { kind: "switch"; switch: Id };

export interface TrackInfo {
  id: Id;
  role: string;
  totalFt: number;
  ends: { start: End; end: End };
}

export interface SwitchInfo {
  id: Id;
  on: Id;
  to: Id;
  atFt: number;
  side: "left" | "right";
  approach: "facing" | "trailing";
}

export interface Spot {
  n: number;
  fromFt: number;
  toFt: number;
}

export interface FacilityInfo {
  track: Id;
  startFt: number;
  endFt: number;
  spots: Spot[];
}

export interface Route {
  segments: Segment[];
  lengthFt: number;
  switches: Id[];
}

export interface FoulingZone {
  switch: Id;
  track: Id;
  fromFt: number;
  toFt: number;
}

export interface TrackGraph {
  tracks: Map<Id, TrackInfo>;
  switches: Map<Id, SwitchInfo>;
  facilities: Map<Id, FacilityInfo>;
  /**
   * Follow the track from a position for a distance. At each switch it takes
   * the branch that leads toward `target` (or the through route without one)
   * and honours `via` in order. It may run past a boundary end (offstage) or a
   * buffer end (past end), returning ft beyond the track's bounds. Returns
   * null only when a required via switch cannot be reached. A non-finite
   * distance returns without the last stretch, so callers that want "as far
   * as it goes" pass a large finite number.
   */
  walk(from: Pos, heading: Heading, distanceFt: number, via?: Id[], target?: Pos): Segment[] | null;
  /** The path from one position to another, or null when the target cannot be reached that way. */
  route(from: Pos, heading: Heading, to: Pos, via?: Id[]): Route | null;
  foulingZones(): FoulingZone[];
}

export function buildGraph(plan: PlanReading): TrackGraph {
  const trainLengthFt = arrivingTrainLength(plan);
  const byId = new Map<Id, Track>(plan.tracks.map((t) => [t.id, t]));
  const mainId = plan.arrival.on;

  const switches = placeSwitches(plan, byId, mainId, trainLengthFt);
  const tracks = measureTracks(plan, switches, mainId, trainLengthFt);
  const facilities = placeFacilities(plan, tracks);

  const index = new GraphIndex(tracks, switches);

  return {
    tracks,
    switches,
    facilities,
    walk: (from, heading, distanceFt, via, target) => walk(index, from, heading, distanceFt, via ?? [], target),
    route: (from, heading, to, via) => route(index, from, heading, to, via ?? []),
    foulingZones: () => foulingZones(switches)
  };
}

/** Sum of the lengths of every unit in the arriving train. */
function arrivingTrainLength(plan: PlanReading): number {
  const lengths = new Map(unitsOf(plan).map((u) => [u.id, u.lengthFt]));
  return initialOrder(plan).reduce((sum, id) => sum + (lengths.get(id) ?? 0), 0);
}

/** Place every switch whose tracks exist. Switches on a track go in `order`, spaced by distanceFt or 400 ft. */
function placeSwitches(plan: PlanReading, byId: Map<Id, Track>, mainId: Id, trainLengthFt: number): Map<Id, SwitchInfo> {
  const out = new Map<Id, SwitchInfo>();
  const usable = plan.switches.filter((s) => byId.has(s.on) && byId.has(s.to));
  const byTrack = new Map<Id, Switch[]>();
  for (const s of usable) {
    const list = byTrack.get(s.on) ?? [];
    list.push(s);
    byTrack.set(s.on, list);
  }
  for (const [trackId, list] of byTrack) {
    const sorted = [...list].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    let previous: number | undefined;
    for (const s of sorted) {
      let atFt: number;
      if (previous === undefined) {
        atFt = trackId === mainId ? trainLengthFt + APPROACH_MARGIN_FT : CLEAR_FT + (s.distanceFt ?? DEFAULT_SWITCH_GAP_FT);
      } else {
        atFt = previous + (s.distanceFt ?? DEFAULT_SWITCH_GAP_FT);
      }
      previous = atFt;
      out.set(s.id, { id: s.id, on: s.on, to: s.to, atFt, side: s.side, approach: s.approach });
    }
  }
  return out;
}

function measureTracks(plan: PlanReading, switches: Map<Id, SwitchInfo>, mainId: Id, trainLengthFt: number): Map<Id, TrackInfo> {
  const out = new Map<Id, TrackInfo>();
  const leadingTo = new Map<Id, SwitchInfo[]>();
  for (const s of switches.values()) {
    const list = leadingTo.get(s.to) ?? [];
    list.push(s);
    leadingTo.set(s.to, list);
  }
  for (const track of plan.tracks) {
    if (track.id === mainId) {
      const onMain = [...switches.values()].filter((s) => s.on === mainId).map((s) => s.atFt);
      const lastAt = onMain.length > 0 ? Math.max(...onMain) : trainLengthFt + APPROACH_MARGIN_FT;
      out.set(track.id, {
        id: track.id,
        role: track.role,
        totalFt: lastAt + TURNOUT_FT + trainLengthFt,
        ends: { start: { kind: "boundary", name: "arrival_end" }, end: { kind: "boundary", name: "far_end" } }
      });
      continue;
    }
    // TODO (tier 2): a branch that rejoins keeps 290 + lengthFt as its total. The
    // real gap between its two switches on the parent is ignored, so the branch
    // length and the main length between the switches do not yet agree.
    const totalFt = CLEAR_FT + (track.lengthFt ?? DEFAULT_BRANCH_USABLE_FT);
    const [first, second] = leadingTo.get(track.id) ?? [];
    const start: End = first ? { kind: "switch", switch: first.id } : { kind: "buffer" };
    const end: End = track.end === "rejoins" && second ? { kind: "switch", switch: second.id } : { kind: "buffer" };
    out.set(track.id, { id: track.id, role: track.role, totalFt, ends: { start, end } });
  }
  return out;
}

function placeFacilities(plan: PlanReading, tracks: Map<Id, TrackInfo>): Map<Id, FacilityInfo> {
  const out = new Map<Id, FacilityInfo>();
  for (const f of plan.facilities) {
    const track = tracks.get(f.track);
    if (!track) continue;
    const usableFrom = track.ends.start.kind === "switch" ? CLEAR_FT : 0;
    let startFt: number;
    let endFt: number;
    if (f.lengthFt === undefined) {
      startFt = f.startFt ?? usableFrom;
      endFt = track.totalFt;
    } else if (f.startFt === undefined) {
      endFt = track.totalFt;
      startFt = endFt - f.lengthFt;
    } else {
      startFt = f.startFt;
      endFt = startFt + f.lengthFt;
    }
    const count = f.spots ?? Math.floor((endFt - startFt) / SPOT_LENGTH_FT);
    const spots: Spot[] = [];
    for (let n = 1; n <= count; n += 1) {
      const fromFt = startFt + (n - 1) * SPOT_LENGTH_FT;
      spots.push({ n, fromFt, toFt: fromFt + SPOT_LENGTH_FT });
    }
    out.set(f.id, { track: f.track, startFt, endFt, spots });
  }
  return out;
}

function foulingZones(switches: Map<Id, SwitchInfo>): FoulingZone[] {
  const zones: FoulingZone[] = [];
  for (const s of switches.values()) {
    if (s.approach === "facing") zones.push({ switch: s.id, track: s.on, fromFt: s.atFt, toFt: s.atFt + CLEAR_FT });
    else zones.push({ switch: s.id, track: s.on, fromFt: s.atFt - CLEAR_FT, toFt: s.atFt });
    zones.push({ switch: s.id, track: s.to, fromFt: 0, toFt: CLEAR_FT });
  }
  return zones;
}

/** Lookups the walker needs: switches by track, and which switches lie on the way from a track up to the main. */
class GraphIndex {
  readonly switchesOn = new Map<Id, SwitchInfo[]>();
  private readonly chains = new Map<Id, Set<Id>>();

  constructor(
    readonly tracks: Map<Id, TrackInfo>,
    readonly switches: Map<Id, SwitchInfo>
  ) {
    for (const s of switches.values()) {
      const list = this.switchesOn.get(s.on) ?? [];
      list.push(s);
      this.switchesOn.set(s.on, list);
    }
  }

  /** The switch at a branch's start, if it has one. */
  startSwitch(track: Id): SwitchInfo | undefined {
    const end = this.tracks.get(track)?.ends.start;
    return end?.kind === "switch" ? this.switches.get(end.switch) : undefined;
  }

  /** The switch a branch rejoins at, if any. */
  endSwitch(track: Id): SwitchInfo | undefined {
    const end = this.tracks.get(track)?.ends.end;
    return end?.kind === "switch" ? this.switches.get(end.switch) : undefined;
  }

  /** Every switch between a track and the main, walking up through start switches. */
  chain(track: Id): Set<Id> {
    const cached = this.chains.get(track);
    if (cached) return cached;
    const out = new Set<Id>();
    const seen = new Set<Id>();
    let current: Id | undefined = track;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      const s = this.startSwitch(current);
      if (!s) break;
      out.add(s.id);
      current = s.on;
    }
    this.chains.set(track, out);
    return out;
  }
}

interface Cursor {
  track: Id;
  ft: number;
  dir: 1 | -1;
}

interface TraceOptions {
  distanceFt: number;
  via: Id[];
  target?: Pos;
  /** Stop when the target is reached instead of walking the whole distance. */
  stopAtTarget: boolean;
}

interface Trace {
  segments: Segment[];
  switches: Id[];
  reachedTarget: boolean;
  viaMet: boolean;
}

const MAX_HOPS = 1000;

function walk(index: GraphIndex, from: Pos, heading: Heading, distanceFt: number, via: Id[], target: Pos | undefined): Segment[] | null {
  const t = trace(index, from, heading, { distanceFt, via, target, stopAtTarget: false });
  return t.viaMet ? t.segments : null;
}

function route(index: GraphIndex, from: Pos, heading: Heading, to: Pos, via: Id[]): Route | null {
  const t = trace(index, from, heading, { distanceFt: Infinity, via, target: to, stopAtTarget: true });
  if (!t.reachedTarget || !t.viaMet) return null;
  const lengthFt = t.segments.reduce((sum, s) => sum + Math.abs(s.toFt - s.fromFt), 0);
  return { segments: t.segments, lengthFt, switches: t.switches };
}

function trace(index: GraphIndex, from: Pos, heading: Heading, o: TraceOptions): Trace {
  const segments: Segment[] = [];
  const passed: Id[] = [];
  const pending = [...o.via];
  const cur: Cursor = { track: from.track, ft: from.ft, dir: heading === "up" ? 1 : -1 };
  let remaining = o.distanceFt;

  /** Add a stretch, joining it onto the last one when the walk simply carried on along the same track. */
  const push = (track: Id, fromFt: number, toFt: number): void => {
    const last = segments[segments.length - 1];
    if (last && last.track === track && last.toFt === fromFt) last.toFt = toFt;
    else segments.push({ track, fromFt, toFt });
  };
  const pass = (id: Id): void => {
    passed.push(id);
    if (pending[0] === id) pending.shift();
  };
  const wantsBranch = (s: SwitchInfo): boolean => {
    if (o.target && index.chain(o.target.track).has(s.id)) return true;
    const nextVia = pending[0];
    if (nextVia === undefined) return false;
    const viaSwitch = index.switches.get(nextVia);
    return viaSwitch !== undefined && (viaSwitch.to === s.to || index.chain(viaSwitch.on).has(s.id));
  };

  const leavesThisWay = (s: SwitchInfo): boolean =>
    (s.approach === "facing" && cur.dir === 1) || (s.approach === "trailing" && cur.dir === -1);
  /**
   * The starting position may sit exactly on a switch: a branch's ft 0 is the same
   * point as its switch's atFt on the parent. On the first hop a zero-distance
   * event counts when it changes track: leaving a branch through its switch, or
   * diverging at points the walk wants. After the first hop the cursor has just
   * been placed on an event, so zero-distance events are never retaken.
   */
  const zeroOkAtStart = (e: TrackEvent): boolean =>
    e.kind === "leave" || (leavesThisWay(e.switch) && wantsBranch(e.switch));
  const zeroNever = (): boolean => false;

  if (!o.stopAtTarget && remaining <= 0) {
    return { segments: [{ track: cur.track, fromFt: cur.ft, toFt: cur.ft }], switches: passed, reachedTarget: false, viaMet: pending.length === 0 };
  }

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const event = nextEvent(index, cur, hop === 0 ? zeroOkAtStart : zeroNever);
    const distToEvent = event ? Math.abs(event.atFt - cur.ft) : Infinity;

    if (o.stopAtTarget && o.target && o.target.track === cur.track) {
      const ahead = (o.target.ft - cur.ft) * cur.dir;
      if (ahead >= 0 && ahead <= distToEvent && ahead <= remaining) {
        if (ahead > 0) push(cur.track, cur.ft, o.target.ft);
        return { segments, switches: passed, reachedTarget: true, viaMet: pending.length === 0 };
      }
    }

    if (!event || remaining <= distToEvent) {
      if (remaining === Infinity) {
        // A route that reaches an end of track without finding its target.
        return { segments, switches: passed, reachedTarget: false, viaMet: pending.length === 0 };
      }
      if (remaining > 0) push(cur.track, cur.ft, cur.ft + cur.dir * remaining);
      return { segments, switches: passed, reachedTarget: false, viaMet: pending.length === 0 };
    }

    if (distToEvent > 0) push(cur.track, cur.ft, event.atFt);
    remaining -= distToEvent;
    cur.ft = event.atFt;

    if (event.kind === "points") {
      const s = event.switch;
      pass(s.id);
      if (leavesThisWay(s) && wantsBranch(s)) {
        cur.track = s.to;
        cur.ft = 0;
        cur.dir = 1;
      }
    } else {
      // Leaving a branch through one of its switches onto the parent, heading away from the branch.
      const s = event.switch;
      pass(s.id);
      cur.track = s.on;
      cur.ft = s.atFt;
      cur.dir = s.approach === "facing" ? -1 : 1;
    }
  }
  return { segments, switches: passed, reachedTarget: false, viaMet: pending.length === 0 };
}

type TrackEvent = { kind: "points"; atFt: number; switch: SwitchInfo } | { kind: "leave"; atFt: number; switch: SwitchInfo };

/**
 * The nearest thing ahead on the current track: switch points, or the branch's own
 * switch at ft 0 or at a rejoin end. Events behind the cursor are ignored; one at
 * the cursor itself counts only when `zeroOk` says so.
 */
function nextEvent(index: GraphIndex, cur: Cursor, zeroOk: (e: TrackEvent) => boolean): TrackEvent | undefined {
  let best: TrackEvent | undefined;
  const consider = (e: TrackEvent): void => {
    const ahead = (e.atFt - cur.ft) * cur.dir;
    if (ahead < 0 || (ahead === 0 && !zeroOk(e))) return;
    if (!best || Math.abs(e.atFt - cur.ft) < Math.abs(best.atFt - cur.ft)) best = e;
  };
  for (const s of index.switchesOn.get(cur.track) ?? []) consider({ kind: "points", atFt: s.atFt, switch: s });
  const start = index.startSwitch(cur.track);
  if (start && cur.dir === -1) consider({ kind: "leave", atFt: 0, switch: start });
  const end = index.endSwitch(cur.track);
  const total = index.tracks.get(cur.track)?.totalFt;
  if (end && total !== undefined && cur.dir === 1) consider({ kind: "leave", atFt: total, switch: end });
  return best;
}
