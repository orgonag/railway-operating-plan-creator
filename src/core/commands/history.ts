/**
 * History: the plan plus undo and redo over it.
 *
 * One `dispatch` is one entry however many commands it carries, so a drag
 * that adds a cut, a move and a second step comes back with one Undo
 * (spec 5.6, "one gesture, one Undo"). Entries hold whole-plan snapshots,
 * not inverse commands: plans are a few kilobytes and a snapshot cannot
 * drift from what was shown. A dispatch that changes nothing, or that a
 * command refused, adds no entry.
 */

import type { Id, PlanReading } from "../schema/types";
import { applyCommands, type Command, type CommandResult } from "./commands";

export interface HistoryEntry {
  label: string;
  commands: Command[];
  before: PlanReading;
  after: PlanReading;
  created: Id[];
}

export interface History {
  readonly plan: PlanReading;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** One entry however many commands; returns the result of applying them. A result whose plan equals the current plan adds no entry. */
  dispatch(commands: Command | Command[], label: string): CommandResult;
  undo(): boolean;
  redo(): boolean;
  /** Replace the plan without an entry and clear both stacks (open a file, pick a template). */
  reset(plan: PlanReading): void;
  /** Called after every change to `plan`, with the entry label or "undo", "redo", "reset". */
  subscribe(fn: (plan: PlanReading, cause: string) => void): () => void;
  /** Undo entries, newest last, for an undo menu. */
  entries(): readonly HistoryEntry[];
}

export const HISTORY_LIMIT = 200;

export function createHistory(initial: PlanReading): History {
  let plan = initial;
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  const listeners = new Set<(plan: PlanReading, cause: string) => void>();

  function notify(cause: string): void {
    for (const fn of [...listeners]) fn(plan, cause);
  }

  return {
    get plan() {
      return plan;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    dispatch(commands, label) {
      const list = Array.isArray(commands) ? commands : [commands];
      const result = applyCommands(plan, list);
      if (result.problems.length > 0 || JSON.stringify(result.plan) === JSON.stringify(plan)) {
        return { plan, created: result.created, problems: result.problems };
      }
      past.push({ label, commands: list, before: plan, after: result.plan, created: result.created });
      if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
      future.length = 0;
      plan = result.plan;
      notify(label);
      return result;
    },
    undo() {
      const entry = past.pop();
      if (!entry) return false;
      future.push(entry);
      plan = entry.before;
      notify("undo");
      return true;
    },
    redo() {
      const entry = future.pop();
      if (!entry) return false;
      past.push(entry);
      plan = entry.after;
      notify("redo");
      return true;
    },
    reset(next) {
      plan = next;
      past.length = 0;
      future.length = 0;
      notify("reset");
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    entries() {
      return past;
    }
  };
}
