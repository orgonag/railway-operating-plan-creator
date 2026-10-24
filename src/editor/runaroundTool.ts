/**
 * The Runaround button: writes the single steps a runaround stands for
 * (cut off, run light clear, run light around through the siding, run light
 * back, couple) after the step on show, as one history entry. Enabled only
 * when the loco's cars stand on a track that a siding joins at both ends.
 */

import { expandRunaround, NO_SIDING_REASON } from "../core/editing/runaround";
import type { Command } from "../core/commands/commands";
import type { Id } from "../core/schema/types";
import type { Editor } from "./editor";

export function attachRunaroundTool(editor: Editor): () => void {
  function locoId(): Id | undefined {
    const { selection, computed } = editor.state();
    const locos = [...computed.units.values()].filter((u) => u.kind === "loco").map((u) => u.id);
    if (selection.kind === "units") {
      const picked = selection.ids.find((id) => locos.includes(id));
      if (picked) return picked;
    }
    return locos.length === 1 ? locos[0] : undefined;
  }

  function expansion(): ReturnType<typeof expandRunaround> {
    const { plan, computed, stepIndex } = editor.state();
    const loco = locoId();
    if (!loco) return null;
    const state = computed.sim.states[stepIndex] ?? computed.sim.initial;
    return expandRunaround(plan, computed.g, state, loco);
  }

  const detachDraw = editor.onDraw(() => editor.toolbar.setEnabled("runaround", expansion() !== null));

  const detachTool = editor.registerTool("runaround", () => {
    const r = expansion();
    if (!r) {
      editor.setStatus(NO_SIDING_REASON);
      return;
    }
    const at = Math.min(editor.state().stepIndex, editor.history.plan.work.length);
    const commands: Command[] = r.steps.map((step, i) => ({ name: "addStep", step, index: at + i }));
    const result = editor.dispatch(commands, "runaround");
    const last = result.created[result.created.length - 1];
    if (last) editor.select({ kind: "step", id: last });
  });

  return () => {
    detachDraw();
    detachTool();
  };
}
