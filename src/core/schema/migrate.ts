import { cloneJson } from "./clone";
import { CAR_TYPES, SCHEMA_VERSION, type FileProblem } from "./types";

/**
 * Brings an older PlanReading document up to the current schema version, one
 * version at a time: 0.2 to 0.3, then 0.3 to 1. Every change is listed as a
 * repaired problem so the person can see what was done. The input is not
 * changed; a deep copy is returned. Anything that is not an object with a known
 * schemaVersion comes back as it was, with one unrepaired problem.
 *
 * Only the shape is handled here. Whether the result is a valid plan is for
 * validateFile to decide.
 */
export function migrate(raw: unknown): { doc: unknown; problems: FileProblem[] } {
  const problems: FileProblem[] = [];
  if (!isRecord(raw)) {
    problems.push({ path: "", message: "The file is not a plan object.", repaired: false });
    return { doc: raw, problems };
  }
  let doc: Record<string, unknown> = cloneJson(raw);
  const version = doc.schemaVersion;
  if (version === SCHEMA_VERSION) return { doc, problems };
  if (version !== "0.2" && version !== "0.3") {
    problems.push({
      path: "schemaVersion",
      message: `Unknown schema version ${JSON.stringify(version)}. This build reads versions 0.2, 0.3 and ${SCHEMA_VERSION}.`,
      repaired: false
    });
    return { doc, problems };
  }
  if (version === "0.2") doc = from02to03(doc, problems);
  doc = from03to1(doc, problems);
  return { doc, problems };
}

/** 0.3 added arrival.enters, replaced the unsure list with provenance, and fixed the car type list. */
function from02to03(doc: Record<string, unknown>, problems: FileProblem[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc, schemaVersion: "0.3" };

  if (isRecord(out.arrival) && out.arrival.enters === undefined) {
    out.arrival = { ...out.arrival, enters: "left" };
    problems.push({
      path: "arrival.enters",
      message: "A 0.2 file does not say which side the train enters from. Set to left.",
      repaired: true
    });
  }

  if (Array.isArray(out.unsure)) {
    const provenance: Record<string, unknown> = isRecord(out.provenance) ? { ...out.provenance } : {};
    for (const path of out.unsure) {
      if (typeof path === "string" && provenance[path] === undefined) provenance[path] = { status: "assumed" };
    }
    out.provenance = provenance;
    delete out.unsure;
    problems.push({
      path: "unsure",
      message: "The unsure list became provenance entries marked assumed.",
      repaired: true
    });
  }

  if (isRecord(out.consist)) {
    const consist = { ...out.consist };
    for (const key of ["cuts", "onSite"] as const) {
      const cuts = consist[key];
      if (!Array.isArray(cuts)) continue;
      consist[key] = cuts.map((cut, i) => {
        if (!isRecord(cut) || typeof cut.carType !== "string" || isCarType(cut.carType)) return cut;
        problems.push({
          path: `consist.${key}[${i}].carType`,
          message: `Car type ${JSON.stringify(cut.carType)} is not one of the known silhouettes. Set to generic.`,
          repaired: true
        });
        return { ...cut, carType: "generic" };
      });
    }
    out.consist = consist;
  }

  return out;
}

/** 1 gives every step a permanent id and names offstage ends by the main's boundaries. */
function from03to1(doc: Record<string, unknown>, problems: FileProblem[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc, schemaVersion: SCHEMA_VERSION };
  const enters = isRecord(out.arrival) ? out.arrival.enters : undefined;
  if (!Array.isArray(out.work)) return out;

  const taken = collectIds(out);
  let next = 1;
  const given: string[] = [];
  const offstagePaths: string[] = [];

  out.work = out.work.map((step: unknown, i: number) => {
    if (!isRecord(step)) return step;
    let result = step;
    if (typeof result.id !== "string") {
      while (taken.has(`S${next}`)) next += 1;
      const id = `S${next}`;
      taken.add(id);
      given.push(id);
      result = { id, ...result };
    }
    if (isRecord(result.stop) && (result.stop.offstage === "left" || result.stop.offstage === "right")) {
      const end = result.stop.offstage === enters ? "arrival_end" : "far_end";
      result = { ...result, stop: { offstage: end } };
      offstagePaths.push(`work[${i}].stop.offstage`);
    }
    return result;
  });

  if (given.length > 0) {
    problems.push({
      path: "work",
      message: `Steps had no ids. Given ${given.join(", ")}.`,
      repaired: true
    });
  }
  for (const path of offstagePaths) {
    problems.push({
      path,
      message: `Offstage was a screen side. Renamed to the end of the main it stands for, given the train enters from the ${String(enters)}.`,
      repaired: true
    });
  }
  return out;
}

/** Every id string anywhere in the document, so new step ids cannot collide with anything. */
function collectIds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, into);
  } else if (isRecord(value)) {
    if (typeof value.id === "string") into.add(value.id);
    for (const child of Object.values(value)) collectIds(child, into);
  }
  return into;
}

function isCarType(value: string): boolean {
  return (CAR_TYPES as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
