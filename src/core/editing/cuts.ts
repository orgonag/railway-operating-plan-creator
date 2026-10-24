/**
 * The uncouple steps a selection implies. To move some cars as one group they
 * must be a contiguous run of one coupled group; the run is cut free of what
 * stands on either side of it, one uncouple per side.
 */

import type { WorldState } from "../engine/state";
import type { Id } from "../schema/types";

export interface CutPlan {
  /** Adjacent pairs to split, each in rising-ft order like `coupled`. */
  uncouples: [Id, Id][];
  /** The run that moves, rear to head along its group's path. */
  movingUnits: Id[];
}

export function planCut(state: WorldState, selected: Id[]): CutPlan | null {
  if (selected.length === 0) return null;
  const wanted = new Set(selected);
  const group = state.coupled.find((units) => units.some((id) => wanted.has(id)));
  if (!group) return null;
  if (selected.some((id) => !group.includes(id))) return null;
  const indexes = group.map((id, i) => (wanted.has(id) ? i : -1)).filter((i) => i >= 0);
  const first = indexes[0]!;
  const last = indexes[indexes.length - 1]!;
  if (last - first + 1 !== indexes.length) return null;
  const uncouples: [Id, Id][] = [];
  if (first > 0) uncouples.push([group[first - 1]!, group[first]!]);
  if (last < group.length - 1) uncouples.push([group[last]!, group[last + 1]!]);
  return { uncouples, movingUnits: group.slice(first, last + 1) };
}
