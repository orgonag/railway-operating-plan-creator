/**
 * Runaround: the single steps a `runaround` shortcut stands for. The loco
 * cuts off, runs clear of the near switch, runs around through a siding that
 * joins its track at both ends, comes back to the other end of the cars and
 * couples. Each leg is one heading, so the engine can play it as it plays
 * any run_light step; the engine expands a saved `runaround` the same way at
 * replay time, and the editor writes the single steps into the plan.
 */

import type { Segment, TrackGraph } from "../engine/graph";
import { CLEAR_FT } from "../engine/graph";
import { unitsOf } from "../engine/materialize";
import type { WorldState } from "../engine/state";
import type { Id, PlanReading, RailroadStep } from "../schema/types";

export interface RunaroundPlan {
  steps: Omit<RailroadStep, "id">[];
  sidingId: Id;
}

export const NO_SIDING_REASON = "No siding joins this track at both ends, so the engine can't run the power around";

/** How far past a switch the loco runs before it reverses: clear of the fouling zone. */
const CLEAR_MARGIN_FT = CLEAR_FT;

function span(segs: Segment[]): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of segs) {
    lo = Math.min(lo, s.fromFt, s.toFt);
    hi = Math.max(hi, s.fromFt, s.toFt);
  }
  return { lo, hi };
}

/** A siding that leaves `track` at one switch and rejoins it at another, with where its switches sit on the track. */
export function sidingAround(g: TrackGraph, track: Id): { id: Id; lo: number; hi: number; lowSwitch: Id; highSwitch: Id } | null {
  for (const t of g.tracks.values()) {
    if (t.ends.start.kind !== "switch" || t.ends.end.kind !== "switch") continue;
    const a = g.switches.get(t.ends.start.switch);
    const b = g.switches.get(t.ends.end.switch);
    if (!a || !b || a.on !== track || b.on !== track) continue;
    const [low, high] = a.atFt <= b.atFt ? [a, b] : [b, a];
    return { id: t.id, lo: low.atFt, hi: high.atFt, lowSwitch: low.id, highSwitch: high.id };
  }
  return null;
}

/**
 * The single steps a runaround stands for from this state, or null when the
 * loco is not coupled to cars standing on one track that a siding joins at
 * both ends.
 */
export function expandRunaround(plan: PlanReading, g: TrackGraph, state: WorldState, locoId: Id): RunaroundPlan | null {
  const units = new Map(unitsOf(plan).map((u) => [u.id, u]));
  const loco = units.get(locoId);
  if (!loco || loco.kind !== "loco") return null;
  const group = state.coupled.find((grp) => grp.includes(locoId));
  if (!group || group.length < 2) return null;
  const cars = group.filter((id) => id !== locoId);
  const locoPlace = state.places[locoId];
  if (!locoPlace || !("occupies" in locoPlace) || locoPlace.occupies.length === 0) return null;
  const track = locoPlace.occupies[0]!.track;
  if (locoPlace.occupies.some((s) => s.track !== track)) return null;
  const carSegs: Segment[] = [];
  for (const id of cars) {
    const p = state.places[id];
    if (!p || !("occupies" in p)) return null;
    carSegs.push(...p.occupies.filter((s) => s.track === track));
  }
  if (carSegs.length === 0) return null;
  const siding = sidingAround(g, track);
  if (!siding) return null;

  const locoSpan = span(locoPlace.occupies);
  const carSpan = span(carSegs);
  const locoLen = loco.lengthFt;
  const sidingName = plan.tracks.find((t) => t.id === siding.id)?.name ?? siding.id;
  const trackName = plan.tracks.find((t) => t.id === track)?.name ?? track;
  /** True when the loco stands on the low-ft side of its cars and must come round to the high side. */
  const fromLow = locoSpan.hi <= carSpan.lo;
  const steps: Omit<RailroadStep, "id">[] = [];
  const legs: Omit<RailroadStep, "id">[] = [];

  steps.push({ actor: "railroad", do: "cut_off", cars: [locoId], text: "The locomotive cuts off from the cars." });

  if (fromLow) {
    // Back clear of the low switch, then up through the siding and clear of the high switch, then back to the cars' high end.
    const clearLow = siding.lo - CLEAR_MARGIN_FT;
    if (locoSpan.hi > clearLow) {
      legs.push({
        actor: "railroad",
        do: "run_light",
        cars: [locoId],
        to: track,
        text: `It runs back along ${trackName}, clear of the turnout.`,
        stop: { track, ft: Math.max(locoLen, clearLow), end: "rear" }
      });
    }
    legs.push({
      actor: "railroad",
      do: "run_light",
      cars: [locoId],
      to: track,
      via: [siding.lowSwitch, siding.highSwitch],
      text: `It runs around the cars through ${sidingName} and comes out clear of the far turnout.`,
      stop: { track, ft: siding.hi + CLEAR_MARGIN_FT, end: "rear" }
    });
    legs.push({
      actor: "railroad",
      do: "run_light",
      cars: [locoId],
      to: track,
      text: "It runs back to the other end of the cars.",
      stop: { track, ft: carSpan.hi, end: "lead" }
    });
  } else {
    const clearHigh = siding.hi + CLEAR_MARGIN_FT;
    if (locoSpan.lo < clearHigh) {
      legs.push({
        actor: "railroad",
        do: "run_light",
        cars: [locoId],
        to: track,
        text: `It runs ahead along ${trackName}, clear of the turnout.`,
        stop: { track, ft: clearHigh, end: "rear" }
      });
    }
    legs.push({
      actor: "railroad",
      do: "run_light",
      cars: [locoId],
      to: track,
      via: [siding.highSwitch, siding.lowSwitch],
      text: `It runs around the cars through ${sidingName} and comes out clear of the far turnout.`,
      stop: { track, ft: Math.max(locoLen, siding.lo - CLEAR_MARGIN_FT), end: "rear" }
    });
    legs.push({
      actor: "railroad",
      do: "run_light",
      cars: [locoId],
      to: track,
      text: "It runs back to the other end of the cars.",
      stop: { track, ft: carSpan.lo, end: "lead" }
    });
  }
  steps.push(...legs);
  steps.push({ actor: "railroad", do: "couple", cars: [...cars], text: "It couples to the cars at their other end." });
  return { steps, sidingId: siding.id };
}
