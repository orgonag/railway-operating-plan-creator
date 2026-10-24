/**
 * The step strip: one card per step down the left, like slide thumbnails.
 * Cards show the step number, the verb, the caption, a dot when the engine
 * left a note, and the status when it is not ok. Clicking a card shows that
 * step and selects it.
 */

import type { StepResult } from "../core/engine/state";
import { captionFor, verbLabel } from "../player/player";
import { clear, el } from "./dom";
import type { EditorState } from "./model";

export interface StepStrip {
  root: HTMLUListElement;
  render(state: EditorState): void;
}

export function createStepStrip(onPick: (index: number) => void): StepStrip {
  const root = el("ul", "step-strip");
  root.setAttribute("aria-label", "Steps");
  return {
    root,
    render(state) {
      clear(root);
      const { sim, notes } = state.computed;
      sim.steps.forEach((step, i) => {
        const li = el("li", "step");
        li.dataset.index = String(i);
        li.dataset.stepId = step.stepId;
        if (i === state.stepIndex) li.classList.add("current");
        if (step.status !== "ok") li.classList.add(step.status);
        if (state.selection.kind === "step" && state.selection.id === step.stepId) li.classList.add("selected");
        const head = el("div", "step-head");
        head.appendChild(el("span", "step-number", String(i + 1)));
        head.appendChild(el("span", "step-verb", verbLabel(step.verb)));
        if (notes.some((n) => n.stepId === step.stepId)) {
          const dot = el("span", "note-dot");
          dot.title = notes
            .filter((n) => n.stepId === step.stepId)
            .map((n) => n.text)
            .join("\n");
          head.appendChild(dot);
        }
        li.appendChild(head);
        li.appendChild(el("p", "caption", captionFor(state.plan, step)));
        if (step.status !== "ok") li.appendChild(el("span", "status-word", statusWord(step)));
        li.addEventListener("click", () => onPick(i));
        root.appendChild(li);
      });
    }
  };
}

function statusWord(step: StepResult): string {
  switch (step.status) {
    case "needs_attention":
      return "Needs attention";
    case "route_not_established":
      return "Route not established";
    case "past_end":
      return "Past the end";
    default:
      return "";
  }
}
