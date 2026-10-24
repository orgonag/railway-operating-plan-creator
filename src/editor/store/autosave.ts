/**
 * Autosave: every history change is written to this browser after a short
 * quiet period, with a status the editor shows ("Saved in this browser").
 * Undo and redo count as changes, so what is saved is always what is shown.
 */

import type { History } from "../../core/commands/history";
import { savePlan } from "./storage";

export type SaveStatus = "saved" | "saving" | "failed";

export const SAVE_DELAY_MS = 300;

export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Saved in this browser",
  saving: "Saving",
  failed: "Could not save in this browser"
};

/** Returns a detach function. A pending save is written at once on detach and when the page hides. */
export function attachAutosave(history: History, localId: string, onStatus: (s: SaveStatus) => void, storage?: Storage): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    try {
      savePlan(localId, history.plan, storage);
      onStatus("saved");
    } catch {
      onStatus("failed");
    }
  };

  const flushPending = (): void => {
    if (timer !== undefined) flush();
  };

  const unsubscribe = history.subscribe(() => {
    if (timer === undefined) onStatus("saving");
    else clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  });

  const win = typeof window !== "undefined" ? window : undefined;
  win?.addEventListener("pagehide", flushPending);

  return () => {
    unsubscribe();
    win?.removeEventListener("pagehide", flushPending);
    flushPending();
  };
}
