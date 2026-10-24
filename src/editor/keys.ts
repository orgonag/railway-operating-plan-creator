/**
 * Keyboard shortcuts, the usual ones: Ctrl+Z, Ctrl+Y, Delete, Esc, Ctrl+C
 * and Ctrl+V for steps. Keys are ignored while the person is typing in a
 * field. The handlers decide what the selection means for Delete and copy.
 */

import { isTyping } from "./dom";

export interface KeyHandlers {
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  escape(): void;
  copy(): void;
  paste(): void;
}

export function attachKeys(target: Document, h: KeyHandlers): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (isTyping(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let handled = true;
    if (ctrl && k === "z" && e.shiftKey) h.redo();
    else if (ctrl && k === "z") h.undo();
    else if (ctrl && k === "y") h.redo();
    else if (ctrl && k === "c") h.copy();
    else if (ctrl && k === "v") h.paste();
    else if (e.key === "Delete" || e.key === "Backspace") h.deleteSelection();
    else if (e.key === "Escape") h.escape();
    else handled = false;
    if (handled) e.preventDefault();
  };
  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
}
