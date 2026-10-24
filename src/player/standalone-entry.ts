/**
 * The standalone player bundle: built as an IIFE that sets window.ROPC.
 * `mount` runs the same checks a file goes through (validateFile,
 * materialize) and lists any problems above the player with textContent.
 */

import { materialize } from "../core/engine/materialize";
import { validateFile } from "../core/schema/validateFile";
import { createPlayer, type Player } from "./player";

export const COULD_NOT_OPEN_TEXT = "This plan could not be opened.";

export function mount(root: HTMLElement, raw: unknown): Player | null {
  const problems = document.createElement("ul");
  problems.className = "problems";
  root.appendChild(problems);
  const add = (text: string): void => {
    const li = document.createElement("li");
    li.textContent = text;
    problems.appendChild(li);
  };
  const checked = validateFile(raw);
  for (const p of checked.problems) add(`${p.path}: ${p.message}${p.repaired ? " (repaired)" : ""}`);
  if (!checked.plan) {
    add(COULD_NOT_OPEN_TEXT);
    return null;
  }
  const made = materialize(checked.plan);
  for (const p of made.problems) add(`${p.path}: ${p.message}`);
  const holder = document.createElement("div");
  root.appendChild(holder);
  return createPlayer(holder, made.plan);
}
