/**
 * Opening a share link: the plan in the link is saved as a new local copy
 * and becomes the last opened plan. Plans already saved are never replaced.
 */

import type { FileProblem, PlanReading } from "../../core/schema/types";
import { decodeShare, isShareHash } from "../../export/share";
import { newLocalId, savePlan, setLastOpenedId } from "./storage";

export const COPY_PREFIX = "Copy of ";

export function copyTitle(title: string): string {
  return title.startsWith(COPY_PREFIX) ? title : COPY_PREFIX + title;
}

export interface OpenedShare {
  localId: string;
  plan: PlanReading;
  problems: FileProblem[];
}

/** Null when the hash is not a share link or cannot be opened; nothing is saved then. */
export async function openShareHash(hash: string, storage?: Storage): Promise<OpenedShare | null> {
  if (!isShareHash(hash)) return null;
  const r = await decodeShare(hash);
  if (!r.plan) return null;
  const plan: PlanReading = { ...r.plan, title: copyTitle(r.plan.title) };
  const localId = newLocalId();
  try {
    savePlan(localId, plan, storage);
    setLastOpenedId(localId, storage);
  } catch {
    // The browser refused the write (storage full or blocked): open nothing rather than a copy that cannot be kept.
    return null;
  }
  return { localId, plan, problems: r.problems };
}
