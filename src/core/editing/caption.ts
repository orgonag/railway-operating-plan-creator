/**
 * The caption for a step made by dragging: "Shove 5 loads to Unloading racks".
 * Loads and empties are counted from the world state; a mixed set is "cars";
 * a loco alone runs light; the place is the facility or track name, or the
 * edge of the drawing the move leaves by.
 */

import type { WorldState } from "../engine/state";
import type { Id, PlanReading } from "../schema/types";
import type { Leg } from "./dragRoute";

export type CaptionVerb = "shove" | "pull" | "run_light" | "move";

const VERB_WORD: Record<CaptionVerb, string> = { shove: "Shove", pull: "Pull", run_light: "Run light", move: "Move" };

export function autoCaption(plan: PlanReading, state: WorldState, movingUnits: Id[], leg: Leg, verb: CaptionVerb): string {
  const cars = movingUnits.filter((id) => isCar(plan, id));
  const what = verb === "run_light" || cars.length === 0 ? "" : describeCars(cars, state);
  const place = describePlace(plan, leg, verb);
  return [VERB_WORD[verb], what, place].filter((s) => s.length > 0).join(" ");
}

function describeCars(cars: Id[], state: WorldState): string {
  const loaded = cars.filter((id) => state.loaded[id] === true).length;
  const n = cars.length;
  const one = n === 1;
  if (loaded === n) return `${n} ${one ? "load" : "loads"}`;
  if (loaded === 0) return `${n} ${one ? "empty" : "empties"}`;
  return `${n} ${one ? "car" : "cars"}`;
}

function describePlace(plan: PlanReading, leg: Leg, verb: CaptionVerb): string {
  if ("offstage" in leg.stop) return leg.stop.offstage === "arrival_end" ? "off the arrival end" : "off the far end";
  const preposition = verb === "pull" ? "onto" : "to";
  if (leg.to !== undefined && leg.to !== "offstage") {
    const facility = plan.facilities.find((f) => f.id === leg.to);
    if (facility) return `${preposition} ${facility.name}`;
  }
  const trackId = "track" in leg.stop ? leg.stop.track : plan.switches.find((s) => s.id === (leg.stop as { beyond: Id }).beyond)?.on;
  const track = plan.tracks.find((t) => t.id === trackId);
  return `${preposition} ${track?.name ?? trackId ?? "the track"}`;
}

function isCar(plan: PlanReading, id: Id): boolean {
  for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    if (cut.list?.some((c) => c.id === id)) return true;
  }
  return false;
}
