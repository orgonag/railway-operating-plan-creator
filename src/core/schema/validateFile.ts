import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";

import schema from "../../../docs/schema/plan-reading.schema.json";
import { cloneJson } from "./clone";
import { migrate } from "./migrate";
import type { FileProblem, Id, PlanReading, Switch, Track } from "./types";

/**
 * File checks (spec 6.4): migrate, check the shape against the JSON Schema,
 * then the structural checks. Only a file whose shape is wrong is refused
 * (plan null). Everything else opens: duplicates are dropped (first kept),
 * and references that do not resolve are reported and left as authored.
 */
export function validateFile(raw: unknown): { plan: PlanReading | null; problems: FileProblem[] } {
  const migrated = migrate(raw);
  const problems = [...migrated.problems];
  if (problems.some((p) => !p.repaired)) return { plan: null, problems };

  if (!validateShape(migrated.doc)) {
    for (const error of validateShape.errors ?? []) problems.push(shapeProblem(error));
    return { plan: null, problems };
  }

  const plan = cloneJson(migrated.doc);
  dropDuplicateIds(plan, problems);
  checkReferences(plan, problems);
  checkTopology(plan, problems);
  return { plan, problems };
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateShape = ajv.compile<PlanReading>(schema);

function shapeProblem(error: ErrorObject): FileProblem {
  const path = error.instancePath
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((acc, part) => (/^\d+$/.test(part) ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part), "");
  return { path, message: `Does not match the schema: ${error.message ?? error.keyword}.`, repaired: false };
}

/** Spec 6.4 item 1, first half: every id is unique. The second holder of an id is dropped. */
function dropDuplicateIds(plan: PlanReading, problems: FileProblem[]): void {
  const seen = new Set<Id>();

  const keep = <T extends { id: Id }>(items: T[], path: string): T[] =>
    items.filter((item, i) => {
      if (seen.has(item.id)) {
        problems.push({
          path: `${path}[${i}].id`,
          message: `The id ${item.id} is already used. This entry was dropped and the first one kept.`,
          repaired: true
        });
        return false;
      }
      seen.add(item.id);
      return true;
    });

  plan.tracks = keep(plan.tracks, "tracks");
  plan.switches = keep(plan.switches, "switches");
  plan.facilities = keep(plan.facilities, "facilities");
  if (plan.consist.locos.list) plan.consist.locos.list = keep(plan.consist.locos.list, "consist.locos.list");
  plan.consist.cuts = keep(plan.consist.cuts, "consist.cuts");
  plan.consist.cuts.forEach((cut, i) => {
    if (cut.list) cut.list = keep(cut.list, `consist.cuts[${i}].list`);
  });
  if (plan.consist.onSite) {
    plan.consist.onSite = keep(plan.consist.onSite, "consist.onSite");
    plan.consist.onSite.forEach((cut, i) => {
      if (cut.list) cut.list = keep(cut.list, `consist.onSite[${i}].list`);
    });
  }
  plan.work = keep(plan.work, "work");
  if (plan.questions) plan.questions = keep(plan.questions, "questions");
}

/** Spec 6.4 item 1, second half, plus "every via switch exists". Nothing is changed; the plan still opens. */
function checkReferences(plan: PlanReading, problems: FileProblem[]): void {
  const tracks = new Set(plan.tracks.map((t) => t.id));
  const switches = new Set(plan.switches.map((s) => s.id));
  const facilities = new Set(plan.facilities.map((f) => f.id));
  const places = new Set([...tracks, ...facilities]);
  const units = new Set<Id>();
  for (const loco of plan.consist.locos.list ?? []) units.add(loco.id);
  for (const cut of [...plan.consist.cuts, ...(plan.consist.onSite ?? [])]) {
    units.add(cut.id);
    for (const car of cut.list ?? []) units.add(car.id);
  }
  const pinnable = new Set([...places, ...switches]);

  const expect = (path: string, id: Id | undefined, known: Set<Id>, what: string): void => {
    if (id !== undefined && !known.has(id)) {
      problems.push({ path, message: `No ${what} with the id ${id} is in the file.`, repaired: false });
    }
  };
  const expectEach = (path: string, ids: Id[] | undefined, known: Set<Id>, what: string): void => {
    ids?.forEach((id, i) => expect(`${path}[${i}]`, id, known, what));
  };
  const expectStop = (path: string, stop: PlanReading["arrival"]["stop"]): void => {
    if (!stop) return;
    if ("track" in stop) expect(`${path}.track`, stop.track, tracks, "track");
    if ("beyond" in stop) expect(`${path}.beyond`, stop.beyond, switches, "switch");
  };

  expect("arrival.on", plan.arrival.on, tracks, "track");
  expectStop("arrival.stop", plan.arrival.stop);
  plan.switches.forEach((s, i) => {
    expect(`switches[${i}].on`, s.on, tracks, "track");
    expect(`switches[${i}].to`, s.to, tracks, "track");
  });
  plan.facilities.forEach((f, i) => expect(`facilities[${i}].track`, f.track, tracks, "track"));
  plan.consist.cuts.forEach((c, i) => expect(`consist.cuts[${i}].for`, c.for, facilities, "facility"));
  plan.consist.onSite?.forEach((c, i) => expect(`consist.onSite[${i}].at`, c.at, places, "facility or track"));
  plan.work.forEach((step, i) => {
    const path = `work[${i}]`;
    if (step.callout) expect(`${path}.callout.at`, step.callout.at, pinnable, "switch, track or facility");
    if (step.do === "note") return;
    expectEach(`${path}.cars`, step.cars, units, "car, loco or cut");
    if (step.to !== "offstage") expect(`${path}.to`, step.to, places, "facility or track");
    expectStop(`${path}.stop`, step.stop);
    if (step.actor === "railroad") {
      expectEach(`${path}.via`, step.via, switches, "switch");
      expectEach(`${path}.between`, step.between, units, "car, loco or cut");
    }
  });
  expectEach("departure.cars", plan.departure.cars, units, "car, loco or cut");
}

/** Spec 6.4 items 2 and 3: the arrival is on a main, a switch joins two different tracks, and branches have the right number of switches. */
function checkTopology(plan: PlanReading, problems: FileProblem[]): void {
  const byId = new Map<Id, Track>(plan.tracks.map((t) => [t.id, t]));

  const arrivalTrack = byId.get(plan.arrival.on);
  if (arrivalTrack && arrivalTrack.role !== "main") {
    problems.push({
      path: "arrival.on",
      message: `The train arrives on ${arrivalTrack.id}, which is a ${arrivalTrack.role}, not a main track.`,
      repaired: false
    });
  }

  plan.switches.forEach((s: Switch, i) => {
    if (s.on === s.to) {
      problems.push({
        path: `switches[${i}].to`,
        message: `Switch ${s.id} leads from ${s.on} back to the same track.`,
        repaired: false
      });
    }
  });

  const reachedBy = new Map<Id, number>();
  for (const s of plan.switches) reachedBy.set(s.to, (reachedBy.get(s.to) ?? 0) + 1);
  plan.tracks.forEach((t, i) => {
    const count = reachedBy.get(t.id) ?? 0;
    if (t.role === "spur" && count !== 1) {
      problems.push({
        path: `tracks[${i}]`,
        message: `Spur ${t.id} should be reached by one switch; ${count} lead to it.`,
        repaired: false
      });
    } else if (t.role === "siding" && t.end === "rejoins" && count !== 2) {
      problems.push({
        path: `tracks[${i}]`,
        message: `Siding ${t.id} rejoins, so two switches should lead to it; ${count} do.`,
        repaired: false
      });
    }
  });
}
