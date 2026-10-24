/**
 * Plans saved in this browser. One localStorage key per plan plus a small
 * index of what is saved. Every save re-reads the index and upserts only its
 * own id, so two tabs saving two plans never drop each other's entry. A
 * corrupt index lists nothing and is rebuilt by the next save; a plan that
 * no longer reads back is null, never an exception.
 */

import { materialize } from "../../core/engine/materialize";
import type { PlanReading } from "../../core/schema/types";
import { validateFile } from "../../core/schema/validateFile";

export interface SavedPlanMeta {
  localId: string;
  title: string;
  /** ISO time of the last save. */
  updatedAt: string;
}

export const INDEX_KEY = "ropc:index";
export const LAST_KEY = "ropc:last";

export function planKey(localId: string): string {
  return `ropc:plan:${localId}`;
}

export function newLocalId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

function store(storage?: Storage): Storage {
  return storage ?? globalThis.localStorage;
}

function readIndex(s: Storage): SavedPlanMeta[] {
  try {
    const raw = s.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is SavedPlanMeta =>
        typeof m === "object" && m !== null && typeof (m as SavedPlanMeta).localId === "string" && typeof (m as SavedPlanMeta).title === "string"
    );
  } catch {
    return [];
  }
}

function writeIndex(s: Storage, index: SavedPlanMeta[]): void {
  s.setItem(INDEX_KEY, JSON.stringify(index));
}

/** Saved plans, newest first. The index is kept in save order, so ties in time keep the later save first. */
export function listPlans(storage?: Storage): SavedPlanMeta[] {
  return readIndex(store(storage))
    .reverse()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

export function loadPlan(localId: string, storage?: Storage): PlanReading | null {
  const s = store(storage);
  try {
    const raw = s.getItem(planKey(localId));
    if (!raw) return null;
    const checked = validateFile(JSON.parse(raw));
    return checked.plan ? materialize(checked.plan).plan : null;
  } catch {
    return null;
  }
}

/** Writes the plan, then upserts this id in a freshly read index. Throws when the storage refuses the write. */
export function savePlan(localId: string, plan: PlanReading, storage?: Storage): void {
  const s = store(storage);
  s.setItem(planKey(localId), JSON.stringify(plan));
  const index = readIndex(s).filter((m) => m.localId !== localId);
  index.push({ localId, title: plan.title, updatedAt: new Date().toISOString() });
  writeIndex(s, index);
}

export function deletePlan(localId: string, storage?: Storage): void {
  const s = store(storage);
  s.removeItem(planKey(localId));
  writeIndex(
    s,
    readIndex(s).filter((m) => m.localId !== localId)
  );
}

export function lastOpenedId(storage?: Storage): string | null {
  return store(storage).getItem(LAST_KEY);
}

export function setLastOpenedId(localId: string, storage?: Storage): void {
  store(storage).setItem(LAST_KEY, localId);
}
