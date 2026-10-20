/**
 * Notes: things to look at, read off the engine's world states (spec 6.4,
 * items 5 to 11). Notes never block a step; they say what the picture shows.
 *
 * Every rule reads the simulation, the saved plan (for what a step asked) and
 * the track graph (ranges and fouling zones). Nothing here re-implements plan
 * state. All note text is plain words with no em or en dashes.
 */

import type { Id, PlanReading, WorkStep } from "../schema/types";
import type { FacilityInfo, Segment, TrackGraph } from "./graph";
import { groupsOf, unitsOf, type Unit } from "./materialize";
import { RUNAROUND_REASON } from "./simulate";
import { segmentLength, type Simulation, type StepResult, type WorldState } from "./state";

export type NoteKind = "fit" | "fouling" | "buffer" | "power_end" | "unclear_route" | "sequence" | "runaround";
export type NoteLevel = "info" | "heads_up";

export interface Note {
  stepId: string;
  kind: NoteKind;
  level: NoteLevel;
  text: string;
  /** The track, switch or facility the note is about, when there is one. */
  at?: Id;
}

/** Slack below this is never used (global constraint). */
export const MIN_ALLOWANCE_PCT = 10;
export const UNCLEAR_ROUTE_TEXT = "The tool couldn't follow the route for this move. It plays as a straight slide; check it.";
export const DEPARTURE_LEFT_BEHIND_TEXT = "Some cars listed for departure are not on the train.";

export function notesFor(sim: Simulation, plan: PlanReading, g: TrackGraph): Note[] {
  const ctx = new Context(sim, plan, g);
  const notes: Note[] = [];
  sim.steps.forEach((step, i) => {
    const after = sim.states[i];
    if (!after) return;
    const before = i === 0 ? sim.initial : sim.states[i - 1]!;
    const saved = ctx.savedStep(step.stepId);
    notes.push(...fitNotes(ctx, step, saved, after));
    notes.push(...foulingNotes(ctx, step, after));
    notes.push(...bufferNotes(ctx, step, after));
    notes.push(...powerEndNotes(step, saved));
    notes.push(...unclearRouteNotes(step));
    notes.push(...sequenceAndRunaroundNotes(ctx, step, saved, before, after));
  });
  return notes;
}

/** What the rules share: unit kinds and lengths, saved steps by id, the plan's general lengths. */
class Context {
  readonly units = new Map<Id, Unit>();
  readonly groupIds: Record<Id, Id[]>;
  readonly carLengthFt: number;
  readonly allowancePct: number;
  private readonly steps = new Map<Id, WorkStep>();

  constructor(
    readonly sim: Simulation,
    readonly plan: PlanReading,
    readonly g: TrackGraph
  ) {
    for (const u of unitsOf(plan)) if (!this.units.has(u.id)) this.units.set(u.id, u);
    this.groupIds = groupsOf(plan);
    this.carLengthFt = plan.carLength?.ft ?? 60;
    this.allowancePct = Math.max(MIN_ALLOWANCE_PCT, plan.carLength?.allowancePct ?? MIN_ALLOWANCE_PCT);
    for (const step of plan.work) this.steps.set(step.id, step);
  }

  savedStep(stepId: string): WorkStep | undefined {
    return this.steps.get(stepId);
  }

  isLoco(id: Id): boolean {
    return this.units.get(id)?.kind === "loco";
  }

  isCar(id: Id): boolean {
    return this.units.get(id)?.kind === "car";
  }

  lengthOf(id: Id): number {
    return this.units.get(id)?.lengthFt ?? 0;
  }

  /** Group ids become their cars; unit ids stay; anything else is dropped. */
  expand(ids: Id[]): Id[] {
    const out: Id[] = [];
    for (const id of ids) {
      const members = this.groupIds[id];
      if (members) {
        for (const m of members) if (this.units.has(m) && !out.includes(m)) out.push(m);
      } else if (this.units.has(id) && !out.includes(id)) {
        out.push(id);
      }
    }
    return out;
  }

  /** The facility a saved step sends equipment to: its `to`, or the first facility on the `to` track when it has a `spot`. */
  facilityOf(saved: WorkStep | undefined): { id: Id; info: FacilityInfo } | undefined {
    if (!saved || saved.do === "note") return undefined;
    const to = saved.to;
    if (to === undefined) return undefined;
    const direct = this.g.facilities.get(to);
    if (direct) return { id: to, info: direct };
    if (saved.spot === undefined) return undefined;
    for (const [id, info] of this.g.facilities) if (info.track === to) return { id, info };
    return undefined;
  }

  facilityName(id: Id): string {
    return this.plan.facilities.find((f) => f.id === id)?.name ?? id;
  }
}

// ---- 5. fit ----

function fitNotes(ctx: Context, step: StepResult, saved: WorkStep | undefined, after: WorldState): Note[] {
  if (step.moved.length === 0) return [];
  const facility = ctx.facilityOf(saved);
  if (!facility) return [];
  const { startFt, endFt, track } = facility.info;
  const onRange = (id: Id): boolean => occupied(after, id).some((s) => s.track === track && overlapFt(s, startFt, endFt) > 0);

  const cars = Object.keys(after.places).filter((id) => ctx.isCar(id) && onRange(id));
  if (cars.length === 0) return [];
  const groupsWithCars = after.coupled.filter((group) => group.some((id) => cars.includes(id)));
  const locos = groupsWithCars.flatMap((group) => group.filter((id) => ctx.isLoco(id) && onRange(id)));

  const required = [...cars, ...locos].reduce((sum, id) => sum + ctx.lengthOf(id), 0);
  const withSlack = required * (1 + ctx.allowancePct / 100);
  const available = endFt - startFt;
  const level: NoteLevel = withSlack <= available ? "info" : "heads_up";
  const label = facilityLabel(ctx.facilityName(facility.id));
  const allGeneral = locos.length === 0 && cars.every((id) => ctx.lengthOf(id) === ctx.carLengthFt);

  const what = allGeneral
    ? `${cars.length} cars at ${ft(ctx.carLengthFt)} ft`
    : locos.length > 0
      ? `${cars.length} cars and the loco`
      : `${cars.length} cars`;
  let text = `${what} = ${ft(required)} ft, plus ${ft(ctx.allowancePct)}% for slack = ${ft(withSlack)} ft; the ${label} have ${ft(available)} ft.`;
  if (level === "heads_up" && allGeneral) text += ` Lengths are the general ${ft(ctx.carLengthFt)} ft planning length.`;
  return [{ stepId: step.stepId, kind: "fit", level, at: facility.id, text }];
}

/** "Unloading racks" gives "racks"; a name that is only the prefix is used whole. */
function facilityLabel(name: string): string {
  const stripped = name.replace(/^(Unloading|Loading)\s+/, "").trim();
  return (stripped.length > 0 ? stripped : name).toLowerCase();
}

// ---- 6. fouling ----

function foulingNotes(ctx: Context, step: StepResult, after: WorldState): Note[] {
  if (step.status !== "ok" && step.status !== "past_end") return [];
  if (step.moved.length === 0) return [];
  const notes: Note[] = [];
  const seen = new Set<Id>();
  for (const zone of ctx.g.foulingZones()) {
    if (seen.has(zone.switch)) continue;
    const fouls = step.moved.some((id) => occupied(after, id).some((s) => s.track === zone.track && overlapFt(s, zone.fromFt, zone.toFt) > 0));
    if (!fouls) continue;
    seen.add(zone.switch);
    notes.push({ stepId: step.stepId, kind: "fouling", level: "heads_up", at: zone.switch, text: `These cars may be fouling ${zone.switch}.` });
  }
  return notes;
}

// ---- 7. buffer ----

function bufferNotes(ctx: Context, step: StepResult, after: WorldState): Note[] {
  if (step.status !== "past_end") return [];
  const track = lastTrack(step.travel) ?? step.moved.map((id) => lastTrack(occupied(after, id))).find((t) => t !== undefined) ?? ctx.plan.arrival.on;
  return [{ stepId: step.stepId, kind: "buffer", level: "heads_up", at: track, text: `Cars are past the end of ${track}.` }];
}

// ---- 8. power end ----

function powerEndNotes(step: StepResult, saved: WorkStep | undefined): Note[] {
  if (!saved || (saved.do !== "shove" && saved.do !== "pull")) return [];
  if (step.verb !== "shove" && step.verb !== "pull") return [];
  if (step.verb === saved.do) return [];
  return [
    {
      stepId: step.stepId,
      kind: "power_end",
      level: "heads_up",
      text: `The loco is on the other end for a ${saved.do}; this plays as a ${step.verb}.`
    }
  ];
}

// ---- 10. unclear route ----

function unclearRouteNotes(step: StepResult): Note[] {
  if (step.status !== "route_not_established") return [];
  return [{ stepId: step.stepId, kind: "unclear_route", level: "heads_up", text: UNCLEAR_ROUTE_TEXT }];
}

// ---- 9 and 11. runaround and work sequence ----

function sequenceAndRunaroundNotes(ctx: Context, step: StepResult, saved: WorkStep | undefined, before: WorldState, after: WorldState): Note[] {
  if (saved?.do === "runaround") {
    return [{ stepId: step.stepId, kind: "runaround", level: "heads_up", text: RUNAROUND_REASON }];
  }
  const heads = (text: string): Note => ({ stepId: step.stepId, kind: "sequence", level: "heads_up", text });

  if (step.stepId === "departure") {
    const named = ctx.expand(ctx.plan.departure.cars ?? []);
    const stayed = named.filter((id) => "occupies" in (after.places[id] ?? { occupies: [] }));
    if (stayed.length > 0) return [heads(DEPARTURE_LEFT_BEHIND_TEXT)];
  }

  if (step.status === "needs_attention") {
    return step.reason === undefined ? [] : [heads(sentence(step.reason))];
  }

  if (saved && saved.actor === "customer" && (saved.do === "unload" || saved.do === "load")) {
    const cars = ctx.expand(saved.cars ?? []).filter((id) => ctx.isCar(id));
    const wasLoaded = (id: Id): boolean => before.loaded[id] === true;
    if (saved.do === "unload" && cars.some((id) => !wasLoaded(id))) return [heads("Some of these cars are already empty.")];
    if (saved.do === "load" && cars.some((id) => wasLoaded(id))) return [heads("Some of these cars are already loaded.")];
  }
  return [];
}

// ---- helpers ----

function occupied(state: WorldState, id: Id): Segment[] {
  const place = state.places[id];
  return place && "occupies" in place ? place.occupies : [];
}

/** How much of a segment lies inside [fromFt, toFt] on its own track. */
function overlapFt(s: Segment, fromFt: number, toFt: number): number {
  const lo = Math.max(Math.min(s.fromFt, s.toFt), Math.min(fromFt, toFt));
  const hi = Math.min(Math.max(s.fromFt, s.toFt), Math.max(fromFt, toFt));
  return Math.max(0, hi - lo);
}

function lastTrack(path: Segment[] | null): Id | undefined {
  if (!path) return undefined;
  const last = path.filter((s) => segmentLength(s) > 0).pop() ?? path[path.length - 1];
  return last?.track;
}

/** Whole feet when whole, else one decimal. */
function ft(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** An engine reason as a plain sentence: it ends with a full stop. */
function sentence(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
