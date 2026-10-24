/**
 * Fresh ids for things a command creates. An id is `<prefix><n>` for the
 * first n >= 1 that collides with nothing in the plan: tracks, switches,
 * facilities, cuts (arriving and on site), cars, locos and steps all share
 * one namespace, so a new car can never be mistaken for an old track.
 */

import type { Id, PlanReading } from "../schema/types";

export function usedIds(plan: PlanReading): Set<Id> {
  const used = new Set<Id>();
  for (const t of plan.tracks) used.add(t.id);
  for (const s of plan.switches) used.add(s.id);
  for (const f of plan.facilities) used.add(f.id);
  for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    used.add(cut.id);
    for (const car of cut.list ?? []) used.add(car.id);
  }
  for (const loco of plan.consist.locos.list ?? []) used.add(loco.id);
  for (const w of plan.work) used.add(w.id);
  return used;
}

export function newId(plan: PlanReading, prefix: string): Id {
  return nextId(usedIds(plan), prefix);
}

/** Like newId, but against a set the caller keeps adding to, so several ids in one command stay distinct. */
export function nextId(used: Set<Id>, prefix: string): Id {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}
