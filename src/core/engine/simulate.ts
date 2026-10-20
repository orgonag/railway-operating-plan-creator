/**
 * Simulate: replay a materialized plan into one world state per step.
 *
 * The step list is [arrival, ...work, departure]; states[i] is the picture
 * after steps[i]. A coupled group occupies one continuous path, rear to head,
 * and its units are laid end to end along it. A move extends that path at the
 * leading end by the distance to the target and trims the same distance from
 * the trailing end, so a 10 ft nudge moves everything 10 ft.
 *
 * Internally every group keeps a real path even when it is off the drawing:
 * an offstage train stands on the main beyond ft 0 or beyond the main's total,
 * and the snapshot reports a unit whose whole path lies beyond a boundary as
 * offstage at that boundary. That is what lets a loco leave and come back.
 *
 * Group paths are kept canonical: the first segment rises, and the units are
 * listed rear to head along it, which is the order `coupled` reports.
 *
 * The engine never throws on a schema-valid plan. Problems become step
 * statuses, with precedence needs_attention > route_not_established > past_end
 * > ok, and the person's authored stop is kept.
 */

import type { CustomerStep, Departure, Direction, GroupEnd, Id, PlanReading, RailroadStep, Stop, WorkStep } from "../schema/types";
import type { End, FacilityInfo, Heading, Pos, Segment, SwitchInfo, TrackGraph } from "./graph";
import { APPROACH_MARGIN_FT, ARRIVAL_SHORT_FT } from "./graph";
import { groupsOf, initialOrder, unitsOf, type Unit } from "./materialize";
import {
  cleanPath,
  flipPath,
  offsetOnPath,
  pathLength,
  slicePath,
  type Place,
  type Simulation,
  type StepResult,
  type StepStatus,
  type WorldState
} from "./state";

export type { Place, Simulation, StepResult, StepStatus, WorldState } from "./state";

/** A couple step joins two groups whose ends stand this close. */
export const COUPLE_REACH_FT = 1;
/** The default stop on a track: this far short of the next switch or the end of track. */
export const SHORT_OF_SWITCH_FT = ARRIVAL_SHORT_FT;
export const RUNAROUND_REASON = "runaround is tier 2 and is not played in P1; write the moves out as run_light, couple and pull steps";

/** How far a probe walks when looking for where a track is entered. */
const PROBE_FT = 10_000_000;

type Boundary = "arrival_end" | "far_end";
type EndName = "high" | "low";

/** A coupled group: units rear to head along a canonical path whose first segment rises. */
interface Group {
  units: Id[];
  path: Segment[];
}

/** What a move asks for, before the direction of travel is known. */
type Wanted =
  | { kind: "point"; pos: Pos; end: GroupEnd }
  | { kind: "beyond"; sw: SwitchInfo; ft: number; end: GroupEnd; onBranch: boolean }
  | { kind: "offstage"; name: Boundary }
  | { kind: "track"; track: Id };

interface Target {
  pos: Pos;
  end: GroupEnd;
  offstage?: Boundary;
}

/** A group seen in one direction of travel: path and units from the trailing end to the lead. */
interface Candidate {
  lead: EndName;
  path: Segment[];
  units: Id[];
}

interface MovePlan {
  cand: Candidate;
  d: number;
  target: Target;
  leadWalk: Segment[];
}

interface Outcome {
  verb: string;
  status: StepStatus;
  moved: Id[];
  travel: Segment[] | null;
  reason?: string;
  requested?: unknown;
  cand?: Candidate;
}

interface MoveSpec {
  to?: Id;
  via?: Id[];
  spot?: number;
  stop?: Stop;
}

export function simulate(plan: PlanReading, g: TrackGraph): Simulation {
  return new Engine(plan, g).run();
}

class Engine {
  private readonly units = new Map<Id, Unit>();
  private readonly order = new Map<Id, number>();
  private readonly groupIds: Record<Id, Id[]>;
  private readonly main: Id;
  private readonly mainTotal: number;
  private readonly arriving: Id[];
  private groups: Group[] = [];
  private readonly facing: Record<Id, Heading> = {};
  private readonly loaded: Record<Id, boolean> = {};
  private readonly lastLead: Record<Id, EndName> = {};

  constructor(
    private readonly plan: PlanReading,
    private readonly g: TrackGraph
  ) {
    unitsOf(plan).forEach((u, i) => {
      if (this.units.has(u.id)) return;
      this.units.set(u.id, u);
      this.order.set(u.id, i);
      this.facing[u.id] = "up";
    });
    this.groupIds = groupsOf(plan);
    this.main = plan.arrival.on;
    this.mainTotal = g.tracks.get(this.main)?.totalFt ?? 0;
    this.arriving = initialOrder(plan).filter((id) => this.units.has(id));
    this.placeEquipment();
  }

  run(): Simulation {
    const initial = this.snapshot();
    if (this.arriving.length > 0) {
      // R2: the initial listing of the arriving train is initialOrder, head first.
      const members = new Set(this.arriving);
      initial.coupled = initial.coupled.map((list) =>
        list.length === members.size && list.every((id) => members.has(id)) ? [...this.arriving] : list
      );
    }
    const steps: StepResult[] = [];
    const states: WorldState[] = [];
    const record = (stepId: Id, outcome: Outcome): void => {
      const result: StepResult = {
        stepId,
        index: steps.length,
        verb: outcome.verb,
        status: outcome.status,
        moved: outcome.moved,
        travel: outcome.travel
      };
      if (outcome.requested !== undefined) result.requested = outcome.requested;
      if (outcome.reason !== undefined) result.reason = outcome.reason;
      steps.push(result);
      states.push(this.snapshot());
    };
    record("arrival", this.guard("arrival", () => this.arrival()));
    for (const step of this.plan.work) record(step.id, this.guard(step.do, () => this.work(step)));
    record("departure", this.guard("departure", () => this.departure()));
    return { initial, states, steps };
  }

  /** Safety net for the never-throws constraint. A step that hits a bug is flagged, not fatal. */
  private guard(verb: string, play: () => Outcome): Outcome {
    try {
      return play();
    } catch (error) {
      return { verb, status: "needs_attention", moved: [], travel: [], reason: `internal: ${String(error)}` };
    }
  }

  // ---- initial placement (R2) ----

  private placeEquipment(): void {
    const placed = new Set<Id>();
    if (this.arriving.length > 0) {
      const rearToHead = [...this.arriving].reverse();
      const len = this.lengthOf(rearToHead);
      this.groups.push({ units: rearToHead, path: [{ track: this.main, fromFt: -len, toFt: 0 }] });
      for (const id of rearToHead) placed.add(id);
    }
    for (const cut of this.plan.consist.onSite ?? []) {
      const ids = (cut.list ?? []).map((c) => c.id).filter((id) => this.units.has(id) && !placed.has(id));
      if (ids.length === 0) continue;
      for (const id of ids) placed.add(id);
      const len = this.lengthOf(ids);
      const facility = this.g.facilities.get(cut.at);
      let path: Segment[];
      if (facility) {
        const start = facility.spots[(cut.spot ?? 1) - 1]?.fromFt ?? facility.startFt;
        path = [{ track: facility.track, fromFt: start, toFt: start + len }];
      } else if (this.g.tracks.has(cut.at)) {
        const total = this.g.tracks.get(cut.at)!.totalFt;
        path = [{ track: cut.at, fromFt: total - len, toFt: total }];
      } else {
        // Nowhere to stand: keep the cars off the drawing at the far end.
        path = [{ track: this.main, fromFt: this.mainTotal, toFt: this.mainTotal + len }];
      }
      this.groups.push({ units: ids, path });
    }
    for (const id of this.units.keys()) {
      if (!placed.has(id)) {
        placed.add(id);
        const len = this.lengthOf([id]);
        this.groups.push({ units: [id], path: [{ track: this.main, fromFt: this.mainTotal, toFt: this.mainTotal + len }] });
      }
    }
    for (const cut of [...this.plan.consist.cuts, ...(this.plan.consist.onSite ?? [])]) {
      for (const car of cut.list ?? []) {
        if (this.units.get(car.id)?.kind === "car") this.loaded[car.id] = (car.state ?? cut.state) === "loaded";
      }
    }
  }

  // ---- snapshots ----

  private snapshot(): WorldState {
    const places: Record<Id, Place> = {};
    for (const group of this.groups) {
      for (const [id, segs] of this.unitSegments(group)) {
        const off = this.offstageEnd(segs);
        places[id] = off ? { offstage: off } : { occupies: segs };
      }
    }
    const ordered: Record<Id, Place> = {};
    for (const id of this.units.keys()) {
      const place = places[id];
      if (place) ordered[id] = place;
    }
    const coupled = [...this.groups]
      .sort((a, b) => this.indexOf(a.units[0]) - this.indexOf(b.units[0]))
      .map((group) => [...group.units]);
    return { places: ordered, facing: { ...this.facing }, coupled, loaded: { ...this.loaded } };
  }

  /** Each unit's slice of its group's path, rear to head. */
  private unitSegments(group: Group): Map<Id, Segment[]> {
    const out = new Map<Id, Segment[]>();
    let at = 0;
    for (const id of group.units) {
      const len = this.lengthOf([id]);
      out.set(id, slicePath(group.path, at, at + len));
      at += len;
    }
    return out;
  }

  /** R13: a unit whose whole path lies beyond a main boundary is offstage there. */
  private offstageEnd(segs: Segment[]): Boundary | undefined {
    if (segs.length === 0 || segs.some((s) => s.track !== this.main)) return undefined;
    if (segs.every((s) => Math.max(s.fromFt, s.toFt) <= 0)) return "arrival_end";
    if (segs.every((s) => Math.min(s.fromFt, s.toFt) >= this.mainTotal)) return "far_end";
    return undefined;
  }

  // ---- arrival and departure (R3, R4) ----

  private arrival(): Outcome {
    const group = this.arriving.length > 0 ? this.groupOf(this.arriving[0]!) : undefined;
    if (!group) return { verb: "arrival", status: "needs_attention", moved: [], travel: [], reason: "nothing arrives: the plan has no locos or cars" };
    let wanted: Wanted[];
    const stop = this.plan.arrival.stop;
    if (stop) {
      const resolved = this.resolveWanted({ stop });
      if ("error" in resolved) return { verb: "arrival", status: "needs_attention", moved: [], travel: [], reason: resolved.error, requested: { stop } };
      wanted = resolved.wanted;
    } else {
      const onMain = [...this.g.switches.values()].filter((s) => s.on === this.main).map((s) => s.atFt);
      const first = onMain.length > 0 ? Math.min(...onMain) : this.lengthOf(this.arriving) + APPROACH_MARGIN_FT;
      wanted = [{ kind: "point", pos: { track: this.main, ft: first - ARRIVAL_SHORT_FT }, end: "lead" }];
    }
    const outcome = this.performMove(group, [this.candidate(group, "high")], wanted, [], { stop });
    return { ...outcome, verb: "arrival" };
  }

  private departure(): Outcome {
    const dep: Departure = this.plan.departure;
    const boundary: Boundary = sameWay(dep.direction, this.plan.arrival.direction) ? "far_end" : "arrival_end";
    const locoGroups = this.groups.filter((group) => group.units.some((id) => this.isLoco(id)));
    if (locoGroups.length === 0) return { verb: "departure", status: "needs_attention", moved: [], travel: [], reason: "no loco is in the plan to take the train out" };

    const named = this.expand(dep.cars ?? []);
    const inLocoGroups = new Set(locoGroups.flatMap((group) => group.units));
    const leftBehind = (dep.cars ?? []).filter((id) => this.expand([id]).units.some((u) => !inLocoGroups.has(u)));

    const moved: Id[] = [];
    let travel: Segment[] | null = null;
    let worst: StepStatus = "ok";
    for (const group of locoGroups) {
      const outcome = this.performMove(group, this.candidates(group), [{ kind: "offstage", name: boundary }], [], {});
      moved.push(...outcome.moved);
      if (travel === null && outcome.travel) travel = outcome.travel;
      worst = worse(worst, outcome.status);
    }
    const result: Outcome = { verb: "departure", status: worst, moved, travel };
    if (named.unknown.length > 0) {
      result.status = "needs_attention";
      result.reason = `${quoteList(named.unknown)} is not in this plan`;
    } else if (leftBehind.length > 0) {
      result.status = "needs_attention";
      result.reason = `departure.cars names ${quoteList(leftBehind)}, which is not coupled to the locos and stays behind`;
    }
    if (result.status !== "ok") result.requested = { cars: dep.cars, boundary };
    return result;
  }

  // ---- work steps ----

  private work(step: WorkStep): Outcome {
    if (step.do === "note") return this.nothing("note");
    if (step.actor === "customer") return this.customer(step);
    switch (step.do) {
      case "shove":
      case "pull":
      case "set_out":
      case "pick_up":
        return this.railroadMove(step);
      case "run_light":
        return this.runLight(step);
      case "cut_off":
        return this.cutOff(step);
      case "couple":
        return this.couple(step);
      case "uncouple":
        return this.uncouple(step);
      case "runaround":
        return this.attention("runaround", RUNAROUND_REASON);
      case "stop":
        return this.nothing("stop");
      default: {
        const verb = String((step as { do: unknown }).do);
        return this.attention(verb, `"${verb}" is not a step the engine knows`);
      }
    }
  }

  private customer(step: CustomerStep): Outcome {
    if (step.do === "move_cars") {
      if (!step.cars || step.cars.length === 0) return this.attention("move_cars", "move_cars names no cars");
      const named = this.expand(step.cars);
      if (named.unknown.length > 0) return this.attention("move_cars", `${quoteList(named.unknown)} is not in this plan`);
      const selected = this.selectGroup(named.units);
      if ("error" in selected) return this.attention("move_cars", selected.error);
      return this.move(selected.group, step, "move_cars", []);
    }
    if (!step.cars || step.cars.length === 0) return this.attention(step.do, `${step.do} names no cars`);
    const named = this.expand(step.cars);
    if (named.unknown.length > 0) return this.attention(step.do, `${quoteList(named.unknown)} is not in this plan`);
    for (const id of named.units) if (this.units.get(id)?.kind === "car") this.loaded[id] = step.do === "load";
    return this.nothing(step.do);
  }

  private railroadMove(step: RailroadStep): Outcome {
    const verb = step.do;
    let group: Group;
    if (step.cars && step.cars.length > 0) {
      const named = this.expand(step.cars);
      if (named.unknown.length > 0) return this.attention(verb, `${quoteList(named.unknown)} is not in this plan`);
      const selected = this.selectGroup(named.units);
      if ("error" in selected) return this.attention(verb, selected.error);
      group = selected.group;
    } else {
      const locoGroups = this.groups.filter((candidate) => candidate.units.some((id) => this.isLoco(id)));
      if (locoGroups.length === 0) return this.attention(verb, "no loco is in the plan");
      if (locoGroups.length > 1) return this.attention(verb, "the locos stand in separate groups; name the cars to move");
      group = locoGroups[0]!;
    }
    if (!group.units.some((id) => this.isLoco(id))) {
      return this.attention(verb, `no loco is coupled to ${quoteList(group.units)}; couple first`);
    }
    const outcome = this.move(group, step, verb, step.via ?? []);
    if (outcome.cand) outcome.verb = this.nameMove(outcome.cand, verb);
    return outcome;
  }

  private runLight(step: RailroadStep): Outcome {
    const verb = "run_light";
    let loco: Id;
    if (step.cars && step.cars.length > 0) {
      const named = this.expand(step.cars);
      if (named.unknown.length > 0) return this.attention(verb, `${quoteList(named.unknown)} is not in this plan`);
      const locos = named.units.filter((id) => this.isLoco(id));
      if (locos.length !== 1 || named.units.length !== 1) return this.attention(verb, "run_light should name one loco and nothing else");
      loco = locos[0]!;
    } else {
      const locos = [...this.units.values()].filter((u) => u.kind === "loco").map((u) => u.id);
      if (locos.length === 0) return this.attention(verb, "no loco is in the plan");
      if (locos.length > 1) return this.attention(verb, `name which loco runs light: ${quoteList(locos)}`);
      loco = locos[0]!;
    }
    const group = this.groupOf(loco)!;
    if (group.units.length > 1) {
      const others = group.units.filter((id) => id !== loco);
      return this.attention(verb, `${loco} is coupled to ${quoteList(others)}; cut off before running light`);
    }
    return this.move(group, step, verb, step.via ?? []);
  }

  /** Resolve the destination and perform the move, trying both ends of the group (R6). */
  private move(group: Group, spec: MoveSpec, verb: string, via: Id[]): Outcome {
    const resolved = this.resolveWanted(spec);
    if ("error" in resolved) return { ...this.attention(verb, resolved.error), requested: requestedOf(spec) };
    const outcome = this.performMove(group, this.candidates(group), resolved.wanted, this.viaAhead(via, group.path), spec);
    return { ...outcome, verb };
  }

  private cutOff(step: RailroadStep): Outcome {
    const verb = step.do;
    let group: Group | undefined;
    let loco: Id | undefined;
    if (step.cars && step.cars.length > 0) {
      const named = this.expand(step.cars);
      if (named.unknown.length > 0) return this.attention(verb, `${quoteList(named.unknown)} is not in this plan`);
      const locos = named.units.filter((id) => this.isLoco(id));
      if (locos.length > 0) {
        loco = locos[0]!;
        group = this.groupOf(loco);
      } else {
        const selected = this.selectGroup(named.units);
        if ("error" in selected) return this.attention(verb, selected.error);
        group = selected.group;
      }
    } else {
      const locoGroups = this.groups.filter((candidate) => candidate.units.some((id) => this.isLoco(id)));
      if (locoGroups.length === 0) return this.attention(verb, "no loco is in the plan");
      if (locoGroups.length > 1) return this.attention(verb, "the locos stand in separate groups; name the one to cut off");
      group = locoGroups[0]!;
      const locos = group.units.filter((id) => this.isLoco(id));
      if (locos.length === 1) loco = locos[0]!;
    }
    if (!group) return this.attention(verb, "nothing to cut off");
    if (group.units.length < 2) return this.attention(verb, `${quoteList(group.units)} is not coupled to anything`);

    let at: number;
    if (loco !== undefined) {
      const i = group.units.indexOf(loco);
      if (i === 0) at = 1;
      else if (i === group.units.length - 1) at = i;
      else return this.attention(verb, `${loco} is not at an end of its group, so it cannot cut off`);
    } else {
      const leading = countWhile(group.units, (id) => this.isLoco(id));
      const trailing = countWhile([...group.units].reverse(), (id) => this.isLoco(id));
      if (leading > 0 && leading < group.units.length) at = leading;
      else if (trailing > 0 && trailing < group.units.length) at = group.units.length - trailing;
      else return this.attention(verb, `no loco is at an end of ${quoteList(group.units)}`);
    }
    this.split(group, at);
    return this.nothing(verb);
  }

  private uncouple(step: RailroadStep): Outcome {
    if (!step.between) return this.cutOff(step);
    const [a, b] = step.between;
    const unknown = [a, b].filter((id) => !this.units.has(id));
    if (unknown.length > 0) return this.attention("uncouple", `${quoteList(unknown)} is not in this plan`);
    const group = this.groupOf(a);
    if (!group || !group.units.includes(b)) return this.attention("uncouple", `${a} and ${b} are not coupled together`);
    const i = group.units.indexOf(a);
    const j = group.units.indexOf(b);
    if (Math.abs(i - j) !== 1) return this.attention("uncouple", `${a} and ${b} are not next to each other`);
    this.split(group, Math.max(i, j));
    return this.nothing("uncouple");
  }

  private couple(step: RailroadStep): Outcome {
    const verb = "couple";
    let required: Id[] = [];
    if (step.cars && step.cars.length > 0) {
      const named = this.expand(step.cars);
      if (named.unknown.length > 0) return this.attention(verb, `${quoteList(named.unknown)} is not in this plan`);
      required = named.units;
    }
    const locos = [...this.units.values()].filter((u) => u.kind === "loco").map((u) => u.id);
    if (locos.length === 0) return this.attention(verb, "no loco is in the plan");
    for (const loco of locos) {
      const a = this.groupOf(loco)!;
      const last = this.lastLead[loco];
      const aEnds: EndName[] = last ? [last] : ["high", "low"];
      for (const aEnd of aEnds) {
        for (const b of this.groups) {
          if (b === a) continue;
          if (required.some((id) => !b.units.includes(id))) continue;
          for (const bEnd of ["low", "high"] as const) {
            const contact = this.contact(this.endOf(a, aEnd), this.endOf(b, bEnd), b);
            if (contact === undefined) continue;
            this.merge(a, aEnd, b, bEnd, contact);
            return this.nothing(verb);
          }
        }
      }
    }
    const what = required.length > 0 ? quoteList(required) : "nothing";
    return this.attention(verb, `${what} stands within ${COUPLE_REACH_FT} ft of the loco to couple to`);
  }

  // ---- the move itself (R6, R7) ----

  private performMove(group: Group, cands: Candidate[], wanted: Wanted[], via: Id[], spec: MoveSpec): Outcome {
    let best: MovePlan | undefined;
    for (const cand of cands) {
      for (const w of wanted) {
        const plan = this.evaluate(cand, w, via);
        if (plan && (!best || plan.d < best.d)) best = plan;
      }
    }
    if (!best) {
      const target = this.authoredTarget(wanted[0]!, group);
      this.placeAsAuthored(group, target);
      return {
        verb: "",
        status: "route_not_established",
        moved: [...group.units],
        travel: null,
        reason: `no route to ${describe(target.pos)}; the equipment is drawn there as authored`,
        requested: requestedOf(spec)
      };
    }
    const landed = this.apply(group, best);
    const past = this.pastEnd(landed.pos, landed.dir, best.target);
    const outcome: Outcome = { verb: "", status: past ? "past_end" : "ok", moved: [...group.units], travel: best.leadWalk, cand: best.cand };
    if (past) {
      outcome.reason = `${describe(landed.pos)} is past the end of the track; the stop is kept as authored`;
      outcome.requested = requestedOf(spec);
    }
    return outcome;
  }

  /** Can this end of the group reach what the step wants, and how far is it? */
  private evaluate(cand: Candidate, w: Wanted, via: Id[]): MovePlan | undefined {
    const leadPos = endOfPath(cand.path);
    const heading = headingAtEnd(cand.path);
    const target = this.targetFor(w, cand, leadPos, heading, via);
    if (!target) return undefined;
    const len = pathLength(cand.path);
    const route = this.g.route(leadPos, heading, target.pos, via);
    let d: number;
    if (target.end === "lead") {
      if (!route) return undefined;
      d = route.lengthFt;
    } else if (route) {
      d = route.lengthFt + len;
    } else {
      // The trailing end's target lies within the group's own path.
      const offset = offsetOnPath(cand.path, target.pos.track, target.pos.ft);
      if (offset === undefined) return undefined;
      d = offset;
    }
    const point: Segment = { track: leadPos.track, fromFt: leadPos.ft, toFt: leadPos.ft };
    const leadWalk = this.g.walk(leadPos, heading, d, via, target.pos) ?? this.g.walk(leadPos, heading, d, [], target.pos) ?? [point];
    return { cand, d, target, leadWalk };
  }

  private targetFor(w: Wanted, cand: Candidate, leadPos: Pos, heading: Heading, via: Id[]): Target | undefined {
    switch (w.kind) {
      case "point":
        return { pos: w.pos, end: w.end };
      case "offstage":
        return this.offstageTarget(w.name, pathLength(cand.path));
      case "beyond": {
        if (w.onBranch) return { pos: { track: w.sw.to, ft: w.ft }, end: w.end };
        const toPoints = this.g.route(leadPos, heading, { track: w.sw.on, ft: w.sw.atFt }, []);
        if (!toPoints) return undefined;
        const last = toPoints.segments[toPoints.segments.length - 1];
        let dir: 1 | -1;
        if (!last) dir = heading === "up" ? 1 : -1;
        else if (last.track === w.sw.on) dir = last.toFt >= last.fromFt ? 1 : -1;
        else dir = w.sw.approach === "facing" ? -1 : 1;
        return { pos: { track: w.sw.on, ft: w.sw.atFt + dir * w.ft }, end: w.end };
      }
      case "track": {
        let entryFt: number;
        let dir: 1 | -1;
        if (leadPos.track === w.track) {
          entryFt = leadPos.ft;
          dir = heading === "up" ? 1 : -1;
        } else {
          const probe = this.g.walk(leadPos, heading, PROBE_FT, via, { track: w.track, ft: 0 });
          const first = probe?.find((s) => s.track === w.track);
          if (!first) return undefined;
          entryFt = first.fromFt;
          dir = first.toFt >= first.fromFt ? 1 : -1;
        }
        return { pos: { track: w.track, ft: this.defaultStopFt(w.track, entryFt, dir) }, end: "lead" };
      }
      default:
        return undefined;
    }
  }

  /** The default stop on a track: 100 ft short of the next switch ahead, or of the end of track. */
  private defaultStopFt(track: Id, entryFt: number, dir: 1 | -1): number {
    const ahead = [...this.g.switches.values()]
      .filter((s) => s.on === track && (s.atFt - entryFt) * dir > 0)
      .map((s) => s.atFt)
      .sort((a, b) => (a - b) * dir);
    const next = ahead[0];
    if (next !== undefined) return next - dir * SHORT_OF_SWITCH_FT;
    const endFt = dir > 0 ? (this.g.tracks.get(track)?.totalFt ?? 0) : 0;
    return endFt - dir * SHORT_OF_SWITCH_FT;
  }

  private offstageTarget(name: Boundary, len: number): Target {
    const ft = name === "arrival_end" ? -len : this.mainTotal + len;
    return { pos: { track: this.main, ft }, end: "lead", offstage: name };
  }

  /** Where the authored target is when no route reaches it: used to draw the equipment there anyway. */
  private authoredTarget(w: Wanted, group: Group): Target {
    switch (w.kind) {
      case "point":
        return { pos: w.pos, end: w.end };
      case "offstage":
        return this.offstageTarget(w.name, pathLength(group.path));
      case "beyond":
        if (w.onBranch) return { pos: { track: w.sw.to, ft: w.ft }, end: w.end };
        return { pos: { track: w.sw.on, ft: w.sw.atFt + (w.sw.approach === "facing" ? -w.ft : w.ft) }, end: w.end };
      case "track":
        return { pos: { track: w.track, ft: this.defaultStopFt(w.track, 0, 1) }, end: "lead" };
      default:
        return { pos: { track: this.main, ft: 0 }, end: "lead" };
    }
  }

  /** Extend the path at the lead by the walk, trim the same distance from the trailing end, re-lay the units (R7, R9). */
  private apply(group: Group, plan: MovePlan): { pos: Pos; dir: 1 | -1 } {
    const cand = plan.cand;
    const len = pathLength(cand.path);
    const full = cleanPath([...cand.path, ...plan.leadWalk]);
    let newPath = slicePath(full, plan.d, plan.d + len);
    if (newPath.length === 0) {
      const at = full.length > 0 ? endOfPath(full) : endOfPath(cand.path);
      newPath = [{ track: at.track, fromFt: at.ft, toFt: at.ft }];
    }
    const before = this.lay(cand.path, cand.units);
    const after = this.lay(newPath, cand.units);
    for (const id of cand.units) {
      const was = travelDir(before.get(id));
      const now = travelDir(after.get(id));
      if (was !== undefined && now !== undefined && was !== now) this.facing[id] = this.facing[id] === "up" ? "down" : "up";
    }
    const lead = endOfPath(newPath);
    const dir = travelDir(newPath) ?? (headingAtEnd(cand.path) === "up" ? 1 : -1);
    group.units = [...cand.units];
    group.path = newPath;
    const flipped = canonicalize(group);
    for (const id of group.units) this.lastLead[id] = flipped ? "low" : "high";
    return { pos: lead, dir };
  }

  /** Each unit's slice of a path laid from its start, keyed by unit. */
  private lay(path: Segment[], units: Id[]): Map<Id, Segment[]> {
    const out = new Map<Id, Segment[]>();
    let at = 0;
    for (const id of units) {
      const len = this.lengthOf([id]);
      out.set(id, slicePath(path, at, at + len));
      at += len;
    }
    return out;
  }

  /** R14: the lead ran past a buffer stop, or off the main when it was not meant to leave. */
  private pastEnd(lead: Pos, dir: 1 | -1, target: Target): boolean {
    const info = this.g.tracks.get(lead.track);
    if (!info) return false;
    let end;
    if (dir > 0 && lead.ft > info.totalFt) end = info.ends.end;
    else if (dir < 0 && lead.ft < 0) end = info.ends.start;
    else return false;
    if (end.kind === "buffer") return true;
    if (end.kind === "boundary") return target.offstage === undefined;
    return false;
  }

  /** No route: stand the group on the target's track with the named end at the target. */
  private placeAsAuthored(group: Group, target: Target): void {
    const len = pathLength(group.path);
    const { track, ft } = target.pos;
    group.path = target.end === "lead" ? [{ track, fromFt: ft - len, toFt: ft }] : [{ track, fromFt: ft, toFt: ft + len }];
  }

  // ---- destinations ----

  private resolveWanted(spec: MoveSpec): { wanted: Wanted[] } | { error: string } {
    const to = spec.to;
    let facility: FacilityInfo | undefined;
    let toTrack: Id | undefined;
    if (to !== undefined && to !== "offstage") {
      facility = this.g.facilities.get(to);
      if (facility) toTrack = facility.track;
      else if (this.g.tracks.has(to)) toTrack = to;
      else return { error: `"${to}" is not a track or facility in this plan` };
    }
    const stop = spec.stop;
    if (stop) {
      if ("offstage" in stop) return { wanted: [{ kind: "offstage", name: stop.offstage }] };
      if ("beyond" in stop) {
        const sw = this.g.switches.get(stop.beyond);
        if (!sw) return { error: `switch "${stop.beyond}" is not in this plan` };
        const onBranch = toTrack !== undefined && this.reachedThrough(toTrack, sw.id);
        return { wanted: [{ kind: "beyond", sw, ft: stop.ft, end: stop.end, onBranch }] };
      }
      if (!this.g.tracks.has(stop.track)) return { error: `track "${stop.track}" is not in this plan` };
      return { wanted: [{ kind: "point", pos: { track: stop.track, ft: stop.ft }, end: stop.end }] };
    }
    if (spec.spot !== undefined) {
      const f = facility ?? (toTrack !== undefined ? this.firstFacilityOn(toTrack) : undefined);
      if (!f) return { error: `spot ${spec.spot} needs a facility, and the step names none` };
      const s = f.spots.find((sp) => sp.n === spec.spot);
      if (!s) return { error: `spot ${spec.spot} is not at ${to}, which has ${f.spots.length} spots` };
      return { wanted: [{ kind: "point", pos: { track: f.track, ft: s.toFt }, end: "lead" }] };
    }
    if (to === "offstage") {
      return { wanted: [{ kind: "offstage", name: "arrival_end" }, { kind: "offstage", name: "far_end" }] };
    }
    if (facility) {
      const last = facility.spots[facility.spots.length - 1];
      return { wanted: [{ kind: "point", pos: { track: facility.track, ft: last ? last.toFt : facility.endFt }, end: "lead" }] };
    }
    if (toTrack !== undefined) return { wanted: [{ kind: "track", track: toTrack }] };
    return { error: "the step has no destination: give it a to, a spot or a stop" };
  }

  private firstFacilityOn(track: Id): FacilityInfo | undefined {
    for (const f of this.g.facilities.values()) if (f.track === track) return f;
    return undefined;
  }

  /** Is a track reached through this switch, by the chain of start switches up toward the main? */
  private reachedThrough(track: Id, swId: Id): boolean {
    const seen = new Set<Id>();
    let current: Id | undefined = track;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      const start: End | undefined = this.g.tracks.get(current)?.ends.start;
      if (!start || start.kind !== "switch") return false;
      if (start.switch === swId) return true;
      const parent: Id | undefined = this.g.switches.get(start.switch)?.on;
      current = parent;
    }
    return false;
  }

  /** Via switches the group already stands on or past are not asked of the route again. */
  private viaAhead(via: Id[], path: Segment[]): Id[] {
    return via.filter((id) => {
      const sw = this.g.switches.get(id);
      if (!sw) return true;
      return !path.some(
        (s) => s.track === sw.to || (s.track === sw.on && Math.min(s.fromFt, s.toFt) <= sw.atFt && Math.max(s.fromFt, s.toFt) >= sw.atFt)
      );
    });
  }

  // ---- groups ----

  private candidates(group: Group): Candidate[] {
    return [this.candidate(group, "high"), this.candidate(group, "low")];
  }

  private candidate(group: Group, lead: EndName): Candidate {
    if (lead === "high") return { lead, path: [...group.path], units: [...group.units] };
    return { lead, path: flipPath(group.path), units: [...group.units].reverse() };
  }

  private endOf(group: Group, end: EndName): Pos {
    if (end === "high") return endOfPath(group.path);
    const first = group.path[0]!;
    return { track: first.track, ft: first.fromFt };
  }

  /**
   * Two group ends touch: the same point on one track within COUPLE_REACH_FT, or
   * the two sides of a switch's points. Returns how far group b has to shift
   * to close the gap, or undefined when they do not touch.
   */
  private contact(a: Pos, b: Pos, groupB: Group): number | undefined {
    if (a.track === b.track) {
      const gap = a.ft - b.ft;
      if (gap === 0) return 0;
      if (Math.abs(gap) <= COUPLE_REACH_FT && groupB.path.every((s) => s.track === b.track)) return gap;
      return undefined;
    }
    for (const s of this.g.switches.values()) {
      const parent = (p: Pos): boolean => p.track === s.on && p.ft === s.atFt;
      const branch = (p: Pos): boolean => p.track === s.to && p.ft === 0;
      if ((parent(a) && branch(b)) || (branch(a) && parent(b))) return 0;
    }
    return undefined;
  }

  private merge(a: Group, aEnd: EndName, b: Group, bEnd: EndName, shift: number): void {
    const bPath = shift === 0 ? b.path : b.path.map((s) => ({ track: s.track, fromFt: s.fromFt + shift, toFt: s.toFt + shift }));
    const aPart = aEnd === "high" ? { path: a.path, units: a.units } : { path: flipPath(a.path), units: [...a.units].reverse() };
    const bPart = bEnd === "low" ? { path: bPath, units: b.units } : { path: flipPath(bPath), units: [...b.units].reverse() };
    const merged: Group = { units: [...aPart.units, ...bPart.units], path: cleanPath([...aPart.path, ...bPart.path]) };
    canonicalize(merged);
    this.groups = this.groups.filter((group) => group !== a && group !== b);
    this.groups.push(merged);
  }

  private split(group: Group, at: number): void {
    const len = pathLength(group.path);
    const offset = this.lengthOf(group.units.slice(0, at));
    const first: Group = { units: group.units.slice(0, at), path: slicePath(group.path, 0, offset) };
    const second: Group = { units: group.units.slice(at), path: slicePath(group.path, offset, len) };
    const i = this.groups.indexOf(group);
    this.groups.splice(i, 1, first, second);
  }

  private groupOf(id: Id): Group | undefined {
    return this.groups.find((group) => group.units.includes(id));
  }

  /** The one coupled group holding every named unit, or why there is not one. */
  private selectGroup(ids: Id[]): { group: Group } | { error: string } {
    if (ids.length === 0) return { error: "the step names no equipment" };
    const found: Group[] = [];
    for (const id of ids) {
      const group = this.groupOf(id);
      if (group && !found.includes(group)) found.push(group);
    }
    if (found.length === 0) return { error: `${quoteList(ids)} is not on the drawing` };
    if (found.length > 1) {
      const names = found.map((group) => quoteList(group.units)).join(" and ");
      return { error: `${names} are not coupled together; move them one at a time` };
    }
    return { group: found[0]! };
  }

  /** Group ids become their cars (groupsOf); unit ids stay; anything else is unknown. */
  private expand(ids: Id[]): { units: Id[]; unknown: Id[] } {
    const units: Id[] = [];
    const unknown: Id[] = [];
    for (const id of ids) {
      const members = this.groupIds[id];
      if (members) {
        for (const m of members) if (this.units.has(m) && !units.includes(m)) units.push(m);
      } else if (this.units.has(id)) {
        if (!units.includes(id)) units.push(id);
      } else {
        unknown.push(id);
      }
    }
    return { units, unknown };
  }

  /** R8: a move is named from where the power stands in the direction of travel. */
  private nameMove(cand: Candidate, fallback: string): string {
    if (cand.units.every((id) => this.isLoco(id))) return "run_light";
    if (this.isLoco(cand.units[cand.units.length - 1]!)) return "pull";
    if (this.isLoco(cand.units[0]!)) return "shove";
    return fallback;
  }

  private isLoco(id: Id): boolean {
    return this.units.get(id)?.kind === "loco";
  }

  private lengthOf(ids: Id[]): number {
    return ids.reduce((sum, id) => sum + (this.units.get(id)?.lengthFt ?? 0), 0);
  }

  private indexOf(id: Id | undefined): number {
    return id === undefined ? Number.MAX_SAFE_INTEGER : (this.order.get(id) ?? Number.MAX_SAFE_INTEGER);
  }

  private nothing(verb: string): Outcome {
    return { verb, status: "ok", moved: [], travel: [] };
  }

  private attention(verb: string, reason: string): Outcome {
    return { verb, status: "needs_attention", moved: [], travel: [], reason };
  }
}

// ---- path helpers ----

/** Make the first segment rise, reversing the unit order with it. Returns whether it flipped. */
function canonicalize(group: Group): boolean {
  const first = group.path[0];
  if (!first || first.toFt >= first.fromFt) return false;
  group.path = flipPath(group.path);
  group.units.reverse();
  return true;
}

function endOfPath(path: Segment[]): Pos {
  const last = path[path.length - 1]!;
  return { track: last.track, ft: last.toFt };
}

function headingAtEnd(path: Segment[]): Heading {
  const last = path[path.length - 1]!;
  return last.toFt >= last.fromFt ? "up" : "down";
}

/** The direction, relative to rising ft, of the last stretch of a path (undefined for an empty one). */
function travelDir(path: Segment[] | undefined): 1 | -1 | undefined {
  const last = path?.[path.length - 1];
  if (!last) return undefined;
  return last.toFt >= last.fromFt ? 1 : -1;
}

function sameWay(a: Direction, b: Direction): boolean {
  return a === b;
}

const RANK: Record<StepStatus, number> = { ok: 0, past_end: 1, route_not_established: 2, needs_attention: 3 };

function worse(a: StepStatus, b: StepStatus): StepStatus {
  return RANK[b] > RANK[a] ? b : a;
}

function countWhile(ids: Id[], test: (id: Id) => boolean): number {
  let n = 0;
  while (n < ids.length && test(ids[n]!)) n += 1;
  return n;
}

function quoteList(ids: Id[]): string {
  return ids.map((id) => `"${id}"`).join(", ");
}

function describe(pos: Pos): string {
  return `${pos.track} ${pos.ft} ft`;
}

function requestedOf(spec: MoveSpec): unknown {
  const out: Record<string, unknown> = {};
  if (spec.to !== undefined) out.to = spec.to;
  if (spec.via !== undefined) out.via = spec.via;
  if (spec.spot !== undefined) out.spot = spec.spot;
  if (spec.stop !== undefined) out.stop = spec.stop;
  return out;
}
