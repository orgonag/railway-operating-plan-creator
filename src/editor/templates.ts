/**
 * Templates: the plans New starts from. Every template is a materialized
 * PlanReading, so the editor can open it without a file check.
 */

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import runaroundJson from "../../docs/schema/examples/spur-with-runaround.reading.json";
import { materialize } from "../core/engine/materialize";
import { cloneJson } from "../core/schema/clone";
import type { PlanReading } from "../core/schema/types";
import { validateFile } from "../core/schema/validateFile";

export type TemplateId = "single_spur" | "spur_with_runaround" | "demo";

export interface Template {
  id: TemplateId;
  label: string;
  make(): PlanReading;
}

function singleSpur(): PlanReading {
  return materialize({
    schemaVersion: "1",
    title: "Untitled plan",
    arrival: { direction: "eastbound", enters: "left", on: "MAIN", locos: "rear", text: "The train arrives on the main line." },
    tracks: [
      { id: "MAIN", role: "main", name: "Main line", end: "continues" },
      { id: "SPUR1", role: "spur", name: "Customer spur", lengthFt: 600, end: "buffer_stop" }
    ],
    switches: [{ id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 }],
    facilities: [{ id: "F1", name: "Customer facility", kind: "other", track: "SPUR1", lengthFt: 300, spots: 5 }],
    consist: { locos: { count: 1, type: "six_axle" }, cuts: [] },
    work: [],
    departure: { direction: "eastbound", text: "The train leaves." }
  }).plan;
}

/** The spur-with-runaround example's track, siding, dock and train, with no work: the runaround is made with the Runaround button. */
function spurWithRunaround(): PlanReading {
  const example = materialize(validateFile(runaroundJson).plan!).plan;
  const { description: _description, questions: _questions, provenance: _provenance, ...rest } = example;
  return materialize({ ...cloneJson(rest), title: "Untitled plan", work: [] }).plan;
}

let demoCache: PlanReading | undefined;
function demo(): PlanReading {
  demoCache ??= materialize(validateFile(demoJson).plan!).plan;
  return cloneJson(demoCache);
}

export const TEMPLATES: readonly Template[] = [
  { id: "single_spur", label: "Single spur", make: singleSpur },
  { id: "spur_with_runaround", label: "Spur with runaround", make: spurWithRunaround },
  { id: "demo", label: "Customer service demo", make: demo }
];

export function templateById(id: TemplateId): Template {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
}
