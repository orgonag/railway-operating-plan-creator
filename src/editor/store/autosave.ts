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

/** Returns a detach function. A pending save is dropped on detach. */
export function attachAutosave(history: History, localId: string, onStatus: (s: SaveStatus) => void, storage?: Storage): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    try {
      savePlan(localId, history.plan, storage);
      onStatus("saved");
    } catch {
      onStatus("failed");
    }
  };

  const unsubscribe = history.subscribe(() => {
    if (timer === undefined) onStatus("saving");
    else clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  });

  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}
