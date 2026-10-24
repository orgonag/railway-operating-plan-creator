/**
 * Materialize: give every piece of equipment and every step a permanent id,
 * and expand the shortcuts that need no state into saved steps.
 *
 * Rules:
 * - A counted group with no list gets cars `<groupId>-1..n`. Once a list exists
 *   nothing is ever renamed; the count follows the list.
 * - Locos get `L1..Ln`, allocated only for locos not already listed.
 * - Every step keeps the id it has. A step with none gets `S<n>`, like migrate.
 * - `set_out` becomes a `shove` (same cars, to, via, spot, stop, callout, text)
 *   followed by a `cut_off` of the same cars. The saved verb is a default:
 *   whether the power shoves or pulls depends on the state, and Task 5 names
 *   the move from the state when it plays it.
 * - `pick_up` becomes a `couple` of the cars followed by a `pull` with the
 *   original to, via, spot and stop.
 * - The second step of an expansion gets `<originalId>b`, or the next letter
 *   that does not collide.
 * - `runaround` stays one step in the file: the engine expands it at replay
 *   time (simulate, with core/editing/runaround) into cut off, run light legs
 *   and couple, whose results carry the step's id with the suffixes a to e.
 *   The editor's Runaround button writes those single steps into the plan
 *   instead, so plans saved from the editor hold single actions only.
 * - The authored text stays on the first step of an expansion: the move for
 *   `set_out`, the couple for `pick_up`. The second step gets an empty text.
 * - The two steps of an expansion share no arrays or objects; each gets its
 *   own copy of cars, via, stop and callout.
 *
 * Assumes validateFile has already run, so ids are unique on the way in.
 * Idempotent: materializing a materialized plan changes nothing.
 */

import { cloneJson } from "../schema/clone";
import type {
  Car,
  CarType,
  Cut,
  FileProblem,
  Id,
  Loco,
  LocoType,
  OnSiteCut,
  PlanReading,
  RailroadStep,
  WorkStep
} from "../schema/types";

export const DEFAULT_CAR_LENGTH_FT = 60;
export const DEFAULT_LOCO_LENGTH_FT = 80;
export const DEFAULT_CAR_TYPE: CarType = "generic";
export const DEFAULT_LOCO_TYPE: LocoType = "six_axle";

export interface Unit {
  id: Id;
  kind: "loco" | "car";
  type: string;
  lengthFt: number;
  mark?: string;
  number?: string;
}

export interface MaterializeResult {
  plan: PlanReading;
  problems: FileProblem[];
}

export function materialize(input: PlanReading): MaterializeResult {
  const plan = cloneJson(input);
  const problems: FileProblem[] = [];
  const taken = collectIds(plan);

  materializeLocos(plan, taken, problems);
  plan.consist.cuts.forEach((cut, i) => materializeGroup(cut, `consist.cuts[${i}]`, taken, problems));
  (plan.consist.onSite ?? []).forEach((cut, i) => materializeGroup(cut, `consist.onSite[${i}]`, taken, problems));
  plan.work = materializeWork(plan.work, taken);

  return { plan, problems };
}

/** Every unit in the plan, locos first, then the arriving cuts, then on-site cars. */
export function unitsOf(plan: PlanReading): Unit[] {
  const units: Unit[] = [];
  const locos = plan.consist.locos;
  for (const loco of locos.list ?? []) {
    units.push({
      id: loco.id,
      kind: "loco",
      type: loco.type ?? locos.type ?? DEFAULT_LOCO_TYPE,
      lengthFt: loco.lengthFt ?? locos.lengthFt ?? plan.locoLength?.ft ?? DEFAULT_LOCO_LENGTH_FT
    });
  }
  const groups: Array<Cut | OnSiteCut> = [...plan.consist.cuts, ...(plan.consist.onSite ?? [])];
  for (const group of groups) {
    for (const car of group.list ?? []) {
      const unit: Unit = {
        id: car.id,
        kind: "car",
        type: car.type ?? group.carType ?? DEFAULT_CAR_TYPE,
        lengthFt: car.lengthFt ?? group.carLengthFt ?? plan.carLength?.ft ?? DEFAULT_CAR_LENGTH_FT
      };
      if (car.mark !== undefined) unit.mark = car.mark;
      if (car.number !== undefined) unit.number = car.number;
      units.push(unit);
    }
  }
  return units;
}

/** The arriving train, head first: cuts in list order with the locos at the head or rear. */
export function initialOrder(plan: PlanReading): Id[] {
  const locos = (plan.consist.locos.list ?? []).map((l) => l.id);
  const cars = plan.consist.cuts.flatMap((cut) => (cut.list ?? []).map((car) => car.id));
  return plan.arrival.locos === "head" ? [...locos, ...cars] : [...cars, ...locos];
}

/** Each cut and on-site cut id mapped to its car ids, head to rear. */
export function groupsOf(plan: PlanReading): Record<Id, Id[]> {
  const out: Record<Id, Id[]> = {};
  for (const group of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    out[group.id] = (group.list ?? []).map((car) => car.id);
  }
  return out;
}

function materializeLocos(plan: PlanReading, taken: Set<string>, problems: FileProblem[]): void {
  const locos = plan.consist.locos;
  if (locos.list) {
    if (locos.count !== locos.list.length) {
      problems.push({
        path: "consist.locos.count",
        message: `Says ${locos.count} locos but lists ${locos.list.length}. The list wins.`,
        repaired: true
      });
      locos.count = locos.list.length;
    }
    return;
  }
  const list: Loco[] = [];
  let n = 1;
  for (let i = 0; i < locos.count; i += 1) {
    while (taken.has(`L${n}`)) n += 1;
    const id = `L${n}`;
    taken.add(id);
    list.push({ id });
  }
  locos.list = list;
}

function materializeGroup(group: Cut | OnSiteCut, path: string, taken: Set<string>, problems: FileProblem[]): void {
  if (group.list) {
    if (group.cars !== group.list.length) {
      problems.push({
        path: `${path}.cars`,
        message: `Says ${group.cars} cars but lists ${group.list.length}. The list wins.`,
        repaired: true
      });
      group.cars = group.list.length;
    }
    return;
  }
  const list: Car[] = [];
  let n = 1;
  for (let i = 0; i < group.cars; i += 1) {
    while (taken.has(`${group.id}-${n}`)) n += 1;
    const id = `${group.id}-${n}`;
    taken.add(id);
    list.push({ id });
  }
  group.list = list;
}

function materializeWork(work: WorkStep[], taken: Set<string>): WorkStep[] {
  const out: WorkStep[] = [];
  let next = 1;
  for (const original of work) {
    let step = original;
    if (typeof step.id !== "string" || step.id === "") {
      while (taken.has(`S${next}`)) next += 1;
      const id = `S${next}`;
      taken.add(id);
      step = { ...step, id };
    }
    if (step.actor === "railroad" && step.do === "set_out") {
      const move: RailroadStep = { ...step, do: "shove" };
      const cutOff: RailroadStep = { id: suffixId(step.id, taken), actor: "railroad", do: "cut_off", text: "" };
      if (step.cars) cutOff.cars = [...step.cars];
      out.push(orderFields(move), cutOff);
    } else if (step.actor === "railroad" && step.do === "pick_up") {
      const couple: RailroadStep = { id: step.id, actor: "railroad", do: "couple", text: step.text };
      if (step.cars) couple.cars = [...step.cars];
      if (step.callout) couple.callout = cloneJson(step.callout);
      const move: RailroadStep = { id: suffixId(step.id, taken), actor: "railroad", do: "pull", text: "" };
      if (step.cars) move.cars = [...step.cars];
      if (step.to !== undefined) move.to = step.to;
      if (step.via) move.via = [...step.via];
      if (step.spot !== undefined) move.spot = step.spot;
      if (step.stop) move.stop = cloneJson(step.stop);
      out.push(couple, move);
    } else {
      out.push(step);
    }
  }
  return out;
}

/** `<id>b`, or the next letter that nothing else in the plan uses. */
function suffixId(base: Id, taken: Set<string>): Id {
  const letters = "bcdefghijklmnopqrstuvwxyz";
  for (const letter of letters) {
    const id = `${base}${letter}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  const id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Keep id, actor, do first so saved files read the same way as authored ones. */
function orderFields(step: RailroadStep): RailroadStep {
  const { id, actor, do: verb, ...rest } = step;
  return { id, actor, do: verb, ...rest };
}

/** Every id string anywhere in the document, so new ids cannot collide with anything. */
function collectIds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, into);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string") into.add(record.id);
    for (const child of Object.values(record)) collectIds(child, into);
  }
  return into;
}
