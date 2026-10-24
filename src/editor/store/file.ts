/**
 * Plan files: Download gives the plan as PlanReading JSON, Open reads one
 * back through the same checks a share link or an import goes through.
 */

import { materialize } from "../../core/engine/materialize";
import type { FileProblem, PlanReading } from "../../core/schema/types";
import { validateFile } from "../../core/schema/validateFile";

export const FILE_SUFFIX = ".reading.json";

/** The plan's title as a safe file stem: "Spur 2: North End" becomes "spur-2-north-end". Empty titles give "plan". */
export function fileStem(plan: PlanReading): string {
  const stem = plan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem.length > 0 ? stem : "plan";
}

export function planFileName(plan: PlanReading): string {
  return fileStem(plan) + FILE_SUFFIX;
}

/** Offer a file for download through a temporary link. Works in any browser; nothing is sent anywhere. */
export function downloadText(name: string, text: string, type: string, doc: Document = document): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(plan: PlanReading, doc?: Document): void {
  downloadText(planFileName(plan), JSON.stringify(plan, null, 2), "application/json", doc);
}

export async function readPlanFile(file: File): Promise<{ plan: PlanReading | null; problems: FileProblem[] }> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { plan: null, problems: [{ path: "", message: `This file is not JSON: ${e instanceof Error ? e.message : String(e)}`, repaired: false }] };
  }
  const checked = validateFile(raw);
  if (!checked.plan) return checked;
  const made = materialize(checked.plan);
  return { plan: made.plan, problems: [...checked.problems, ...made.problems] };
}
