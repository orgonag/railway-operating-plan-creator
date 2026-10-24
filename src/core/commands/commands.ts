/**
 * The command set: every change to a plan, from a button, a drag or later an
 * agent, is one of these applied by `applyCommand`. It is a pure function:
 * the input plan is never touched, the result is a new plan.
 *
 * Rules:
 * - A command never throws on a schema-valid plan and never makes one
 *   invalid. What it cannot do (an unknown id) becomes a problem and the
 *   plan comes back unchanged.
 * - Deleting a track, facility or car leaves the steps that name it alone.
 *   The engine marks those steps needs_attention; nothing is invented.
 * - Ids come from `newId`, so anything created can be referred to at once.
 *   `created` lists them in the order they were made.
 */

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";

import { cloneJson } from "../schema/clone";
import { validateFile } from "../schema/validateFile";
import { COMMANDS } from "./schemas";
import type {
  Car,
  CarState,
  CarType,
  Cut,
  Direction,
  FacilityKind,
  FileProblem,
  Id,
  LocoType,
  OnSiteCut,
  PlanReading,
  RailroadStep,
  Side,
  Stop,
  Switch,
  Track,
  TrackEnd,
  TrackRole,
  WorkStep
} from "../schema/types";
import { nextId, usedIds } from "./ids";

export type FlipAxis = "up_down" | "left_right";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A step as addStep takes it: any step shape, with the id optional. */
export type StepInput = DistributiveOmit<WorkStep, "id"> & { id?: Id };

export type Command =
  | { name: "setTitle"; title: string; description?: string }
  | { name: "setArrival"; direction?: Direction; enters?: Side; locos?: "head" | "rear"; text?: string; stop?: Stop | null }
  | { name: "setDeparture"; direction?: Direction; text?: string; cars?: Id[] }
  | { name: "setLocos"; count: number; type?: LocoType; lengthFt?: number }
  | {
      name: "addTurnout";
      trackId: Id;
      distanceFt: number;
      side: Side;
      approach: "facing" | "trailing";
      branchId?: Id;
      branchRole?: TrackRole;
      branchLengthFt?: number;
      /** Its place among the track's switches; later ones shift up. Without it the switch goes last. */
      order?: number;
    }
  | { name: "flipTurnout"; switchId: Id; axis: FlipAxis }
  | { name: "setSwitchDistance"; switchId: Id; distanceFt: number }
  | { name: "setTrack"; trackId: Id; label?: string; role?: TrackRole; lengthFt?: number; end?: TrackEnd }
  | { name: "deleteTrack"; trackId: Id }
  | { name: "addFacility"; trackId: Id; startFt: number; lengthFt: number; label: string; kind: FacilityKind; facilityId?: Id }
  | { name: "setFacility"; facilityId: Id; label?: string; kind?: FacilityKind; startFt?: number; lengthFt?: number; spots?: number }
  | { name: "deleteFacility"; facilityId: Id }
  | { name: "addCars"; count: number; type: CarType; state: CarState; cutId?: Id; for?: Id }
  | { name: "placeCars"; count: number; type: CarType; state: CarState; at: Id; spot?: number; cutId?: Id }
  | { name: "setCar"; carId: Id; type?: CarType; state?: CarState; mark?: string; number?: string; lengthFt?: number | null }
  | { name: "deleteCar"; carId: Id }
  | { name: "addStep"; step: StepInput; index?: number }
  | { name: "setStep"; stepId: Id; patch: Partial<Omit<RailroadStep, "id">> }
  | { name: "deleteStep"; stepId: Id }
  | { name: "reorderStep"; stepId: Id; index: number };

export type CommandName = Command["name"];

export const REJOIN_FLIP_TEXT = "A siding that rejoins leaves facing and comes back trailing; flip up/down moves it to the other side of the track";

export interface CommandResult {
  plan: PlanReading;
  created: Id[];
  problems: FileProblem[];
}

export const DEFAULT_BRANCH_LENGTH_FT = 400;

export function applyCommands(plan: PlanReading, cmds: Command[]): CommandResult {
  const created: Id[] = [];
  const problems: FileProblem[] = [];
  let current = plan;
  for (const cmd of cmds) {
    const r = applyCommand(current, cmd);
    current = r.plan;
    created.push(...r.created);
    problems.push(...r.problems);
  }
  return { plan: current, created, problems };
}

export function applyCommand(plan: PlanReading, cmd: Command): CommandResult {
  const ctx = new Ctx(plan, cmd.name);
  const shape = checkShape(cmd);
  if (shape) {
    ctx.problems.push(shape);
    return ctx.result(plan);
  }
  switch (cmd.name) {
    case "setTitle":
      ctx.plan.title = cmd.title;
      setOrDelete(ctx.plan, "description", cmd.description);
      break;
    case "setArrival":
      assign(ctx.plan.arrival, cmd, ["direction", "enters", "locos", "text"]);
      if (cmd.stop === null) delete ctx.plan.arrival.stop;
      else if (cmd.stop !== undefined) ctx.plan.arrival.stop = cloneJson(cmd.stop);
      break;
    case "setDeparture":
      assign(ctx.plan.departure, cmd, ["direction", "text"]);
      if (cmd.cars !== undefined) ctx.plan.departure.cars = [...cmd.cars];
      break;
    case "setLocos":
      ctx.plan.consist.locos.count = cmd.count;
      assign(ctx.plan.consist.locos, cmd, ["type", "lengthFt"]);
      syncLocoList(ctx, cmd.count);
      break;
    case "addTurnout":
      addTurnout(ctx, cmd);
      break;
    case "flipTurnout": {
      const sw = ctx.find("switch", ctx.plan.switches, cmd.switchId, "switchId");
      if (!sw) break;
      const branch = ctx.plan.tracks.find((t) => t.id === sw.to);
      const partners = branch?.end === "rejoins" ? ctx.plan.switches.filter((x) => x.to === sw.to) : [sw];
      if (cmd.axis === "up_down") {
        // Both ends of a rejoining siding move together; a spur has one switch.
        for (const x of partners) x.side = x.side === "left" ? "right" : "left";
      } else if (partners.length > 1) {
        ctx.problems.push({ path: "flipTurnout.axis", message: REJOIN_FLIP_TEXT, repaired: false });
      } else sw.approach = sw.approach === "facing" ? "trailing" : "facing";
      break;
    }
    case "setSwitchDistance": {
      const sw = ctx.find("switch", ctx.plan.switches, cmd.switchId, "switchId");
      if (sw) sw.distanceFt = cmd.distanceFt;
      break;
    }
    case "setTrack": {
      const t = ctx.find("track", ctx.plan.tracks, cmd.trackId, "trackId");
      if (t) {
        if (cmd.label !== undefined) t.name = cmd.label;
        assign(t, cmd, ["role", "lengthFt", "end"]);
      }
      break;
    }
    case "deleteTrack":
      if (ctx.find("track", ctx.plan.tracks, cmd.trackId, "trackId")) deleteTracks(ctx.plan, [cmd.trackId]);
      break;
    case "addFacility": {
      if (!ctx.find("track", ctx.plan.tracks, cmd.trackId, "trackId")) break;
      if (cmd.facilityId !== undefined && !ctx.claim(cmd.facilityId, "facilityId")) break;
      const id = cmd.facilityId ?? ctx.id("F");
      ctx.plan.facilities.push({ id, name: cmd.label, kind: cmd.kind, track: cmd.trackId, startFt: cmd.startFt, lengthFt: cmd.lengthFt });
      ctx.created.push(id);
      break;
    }
    case "setFacility": {
      const f = ctx.find("facility", ctx.plan.facilities, cmd.facilityId, "facilityId");
      if (f) {
        if (cmd.label !== undefined) f.name = cmd.label;
        assign(f, cmd, ["kind", "startFt", "lengthFt", "spots"]);
      }
      break;
    }
    case "deleteFacility":
      if (ctx.find("facility", ctx.plan.facilities, cmd.facilityId, "facilityId")) {
        ctx.plan.facilities = ctx.plan.facilities.filter((f) => f.id !== cmd.facilityId);
      }
      break;
    case "addCars": {
      if (cmd.cutId !== undefined && !ctx.claim(cmd.cutId, "cutId")) break;
      const cut: Cut = { id: cmd.cutId ?? ctx.id("CUT"), cars: cmd.count, state: cmd.state, carType: cmd.type, list: [] };
      if (cmd.for !== undefined) cut.for = cmd.for;
      ctx.created.push(cut.id);
      cut.list = ctx.newCars(cmd.count);
      ctx.plan.consist.cuts.push(cut);
      break;
    }
    case "placeCars": {
      if (cmd.cutId !== undefined && !ctx.claim(cmd.cutId, "cutId")) break;
      const cut: OnSiteCut = { id: cmd.cutId ?? ctx.id("CUT"), cars: cmd.count, state: cmd.state, carType: cmd.type, at: cmd.at, list: [] };
      if (cmd.spot !== undefined) cut.spot = cmd.spot;
      ctx.created.push(cut.id);
      cut.list = ctx.newCars(cmd.count);
      (ctx.plan.consist.onSite ??= []).push(cut);
      break;
    }
    case "setCar": {
      const car = findCar(ctx.plan, cmd.carId);
      if (!car) {
        ctx.missing("car", cmd.carId, "carId");
        break;
      }
      assign(car, cmd, ["type", "state", "mark", "number"]);
      if (cmd.lengthFt === null) delete car.lengthFt;
      else if (cmd.lengthFt !== undefined) car.lengthFt = cmd.lengthFt;
      break;
    }
    case "deleteCar":
      if (!deleteCar(ctx.plan, cmd.carId)) ctx.missing("car", cmd.carId, "carId");
      break;
    case "addStep": {
      if (cmd.step.do === "stop" && !cmd.step.callout) {
        ctx.problems.push({ path: "addStep.step.callout", message: "a stop step needs a callout saying why the train waits", repaired: false });
        break;
      }
      if (cmd.step.id !== undefined && !ctx.claim(cmd.step.id, "step.id")) break;
      const step = cloneJson(cmd.step) as WorkStep;
      step.id = cmd.step.id ?? ctx.id("ST");
      const at = cmd.index === undefined ? ctx.plan.work.length : clampIndex(cmd.index, ctx.plan.work.length);
      ctx.plan.work.splice(at, 0, step);
      ctx.created.push(step.id);
      break;
    }
    case "setStep": {
      const step = ctx.find("step", ctx.plan.work, cmd.stepId, "stepId");
      if (!step) break;
      const target = step as unknown as Record<string, unknown>;
      // null and undefined both delete: a command that arrives as JSON can only say null.
      for (const [key, value] of Object.entries(cmd.patch)) {
        if (value === undefined || value === null) delete target[key];
        else target[key] = cloneJson(value);
      }
      break;
    }
    case "deleteStep":
      if (ctx.find("step", ctx.plan.work, cmd.stepId, "stepId")) ctx.plan.work = ctx.plan.work.filter((w) => w.id !== cmd.stepId);
      break;
    case "reorderStep": {
      const i = ctx.plan.work.findIndex((w) => w.id === cmd.stepId);
      if (i < 0) {
        ctx.missing("step", cmd.stepId, "stepId");
        break;
      }
      const [step] = ctx.plan.work.splice(i, 1);
      ctx.plan.work.splice(clampIndex(cmd.index, ctx.plan.work.length), 0, step!);
      break;
    }
  }
  return ctx.result(plan);
}

// ---- shape and readability checks ----

const validators = new Map<CommandName, ValidateFunction>();
let ajv: Ajv2020 | undefined;

/** The command against its own JSON Schema: wrong types, fractions where integers go, missing fields. */
function checkShape(cmd: Command): FileProblem | undefined {
  let validate = validators.get(cmd.name);
  if (!validate) {
    const doc = COMMANDS.find((c) => c.name === cmd.name);
    if (!doc) {
      const name = String((cmd as { name: unknown }).name);
      return { path: name, message: `unknown command ${name}`, repaired: false };
    }
    ajv ??= new Ajv2020({ allErrors: false, strict: true });
    validate = ajv.compile(doc.schema);
    validators.set(cmd.name, validate);
  }
  const name = cmd.name;
  if (validate(cmd)) return undefined;
  const err = validate.errors?.[0];
  const field = err?.instancePath ? err.instancePath.slice(1).replace(/\//g, ".") : (err?.params as { missingProperty?: string } | undefined)?.missingProperty ?? "command";
  return { path: `${name}.${field}`, message: `${field} ${err?.message ?? "is not valid"}`, repaired: false };
}

// ---- helpers ----

class Ctx {
  readonly plan: PlanReading;
  readonly created: Id[] = [];
  readonly problems: FileProblem[] = [];
  private readonly used: Set<Id>;

  constructor(
    input: PlanReading,
    private readonly command: CommandName
  ) {
    this.plan = cloneJson(input);
    this.used = usedIds(this.plan);
  }

  id(prefix: string): Id {
    return nextId(this.used, prefix);
  }

  newCars(count: number): Car[] {
    const cars: Car[] = [];
    for (let i = 0; i < count; i++) {
      const id = this.id("C");
      cars.push({ id });
      this.created.push(id);
    }
    return cars;
  }

  find<T extends { id: Id }>(thing: string, list: T[], id: Id, field: string): T | undefined {
    const found = list.find((x) => x.id === id);
    if (!found) this.missing(thing, id, field);
    return found;
  }

  missing(thing: string, id: Id, field: string): void {
    this.problems.push({ path: `${this.command}.${field}`, message: `no ${thing} with id ${id}`, repaired: false });
  }

  /** Take an id the caller chose; false (with a problem) when something already has it. */
  claim(id: Id, field: string): boolean {
    if (this.used.has(id)) {
      this.problems.push({ path: `${this.command}.${field}`, message: `the id ${id} is already used`, repaired: false });
      return false;
    }
    this.used.add(id);
    return true;
  }

  /**
   * The unchanged input when anything went wrong, so a failed command is a
   * true no-op. A result the file check could not read back is refused too:
   * what is shown must be what is saved.
   */
  result(input: PlanReading): CommandResult {
    if (this.problems.length === 0 && validateFile(this.plan).plan === null) {
      this.problems.push({ path: this.command, message: "this change would make the plan unreadable, so it was not made", repaired: false });
    }
    if (this.problems.length > 0) return { plan: input, created: [], problems: this.problems };
    return { plan: this.plan, created: this.created, problems: [] };
  }
}

function assign<T extends object, C extends object>(target: T, cmd: C, keys: (keyof T & keyof C)[]): void {
  for (const key of keys) {
    const value = cmd[key];
    if (value !== undefined) (target as Record<string, unknown>)[key as string] = cloneJson(value);
  }
}

function setOrDelete<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (value === undefined) return;
  (target as Record<string, unknown>)[key as string] = value;
}

function clampIndex(i: number, length: number): number {
  return Math.max(0, Math.min(length, Math.floor(i)));
}

/** Keep a listed loco set in step with the count: drop extras from the rear, add fresh ids at the rear. */
function syncLocoList(ctx: Ctx, count: number): void {
  const locos = ctx.plan.consist.locos;
  if (!locos.list) return;
  if (locos.list.length > count) locos.list = locos.list.slice(0, count);
  while (locos.list.length < count) {
    const id = ctx.id("L");
    locos.list.push({ id });
    ctx.created.push(id);
  }
}

function addTurnout(ctx: Ctx, cmd: Extract<Command, { name: "addTurnout" }>): void {
  if (!ctx.find("track", ctx.plan.tracks, cmd.trackId, "trackId")) return;
  let branchId = cmd.branchId;
  if (branchId === undefined || !ctx.plan.tracks.some((t) => t.id === branchId)) {
    branchId ??= ctx.id("T");
    const branch: Track = { id: branchId, role: cmd.branchRole ?? "spur", lengthFt: cmd.branchLengthFt ?? DEFAULT_BRANCH_LENGTH_FT, end: "buffer_stop" };
    ctx.plan.tracks.push(branch);
    ctx.created.push(branchId);
  }
  const onTrack = ctx.plan.switches.filter((s) => s.on === cmd.trackId);
  let order: number;
  if (cmd.order !== undefined) {
    order = cmd.order;
    for (const s of onTrack) if ((s.order ?? 0) >= order) s.order = (s.order ?? 0) + 1;
  } else order = onTrack.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;
  const sw: Switch = { id: ctx.id("S"), on: cmd.trackId, to: branchId, side: cmd.side, approach: cmd.approach, order, distanceFt: cmd.distanceFt };
  ctx.plan.switches.push(sw);
  ctx.created.push(sw.id);
}

/** Remove tracks, the switches and facilities on them, and every branch reached only through those switches. */
function deleteTracks(plan: PlanReading, roots: Id[]): void {
  const gone = new Set<Id>(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const sw of plan.switches) {
      if (!gone.has(sw.on) || gone.has(sw.to)) continue;
      // The branch survives only if some other switch not on a deleted track still leads to it.
      const otherWay = plan.switches.some((o) => o !== sw && o.to === sw.to && !gone.has(o.on));
      if (!otherWay && sw.to !== plan.arrival.on) {
        gone.add(sw.to);
        grew = true;
      }
    }
  }
  plan.tracks = plan.tracks.filter((t) => !gone.has(t.id));
  plan.switches = plan.switches.filter((s) => !gone.has(s.on) && !gone.has(s.to));
  plan.facilities = plan.facilities.filter((f) => !gone.has(f.track));
}

function findCar(plan: PlanReading, carId: Id): Car | undefined {
  for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    const car = cut.list?.find((c) => c.id === carId);
    if (car) return car;
  }
  return undefined;
}

function deleteCar(plan: PlanReading, carId: Id): boolean {
  const lists: { cuts: (Cut | OnSiteCut)[]; set: (next: (Cut | OnSiteCut)[]) => void }[] = [
    { cuts: plan.consist.cuts, set: (next) => (plan.consist.cuts = next as Cut[]) },
    { cuts: plan.consist.onSite ?? [], set: (next) => (plan.consist.onSite = next as OnSiteCut[]) }
  ];
  for (const { cuts, set } of lists) {
    for (const cut of cuts) {
      const i = cut.list?.findIndex((c) => c.id === carId) ?? -1;
      if (i < 0) continue;
      cut.list!.splice(i, 1);
      cut.cars = cut.list!.length;
      if (cut.cars === 0) set(cuts.filter((c) => c !== cut));
      return true;
    }
  }
  return false;
}
