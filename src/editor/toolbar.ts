/**
 * The toolbar: large buttons with an icon and a word, PowerPoint style.
 * Buttons that need a drag (Turnout, Track end, Facility) are drag sources
 * that later tasks attach to; here they are plain buttons with tooltips.
 */

import { el } from "./dom";
import { icon } from "./icons";

export interface ToolSpec {
  tool: string;
  label: string;
  title: string;
  disabled?: boolean;
}

export const TOOLS: readonly ToolSpec[] = [
  { tool: "new", label: "New", title: "Start a new plan from a template, or open one saved in this browser" },
  { tool: "open", label: "Open", title: "Open a plan file (.reading.json)" },
  { tool: "download", label: "Download", title: "Download this plan as a file" },
  { tool: "share", label: "Share", title: "Share this plan as a link (coming in a later step)", disabled: true },
  { tool: "undo", label: "Undo", title: "Undo (Ctrl+Z)" },
  { tool: "redo", label: "Redo", title: "Redo (Ctrl+Y)" },
  { tool: "turnout", label: "Turnout", title: "Drag onto a track to add a turnout and a new branch" },
  { tool: "track-end", label: "Track end", title: "Drag onto a branch to end it with a buffer stop" },
  { tool: "facility", label: "Facility", title: "Drag onto a track to place a customer facility" },
  { tool: "add-cars", label: "Add cars", title: "Add cars to the arriving train" },
  { tool: "place-cars", label: "Place cars", title: "Place cars already on site before the train arrives" },
  { tool: "zoom-in", label: "Zoom in", title: "Zoom in (Ctrl and mouse wheel also zooms)" },
  { tool: "zoom-out", label: "Zoom out", title: "Zoom out" },
  { tool: "fit", label: "Fit plan", title: "Fit the whole plan in the window" },
  { tool: "play", label: "Play", title: "Play the plan step by step" }
];

export interface Toolbar {
  root: HTMLElement;
  button(tool: string): HTMLButtonElement;
  setEnabled(tool: string, enabled: boolean): void;
}

export function createToolbar(onTool: (tool: string, button: HTMLButtonElement) => void): Toolbar {
  const root = el("div", "toolbar");
  root.setAttribute("role", "toolbar");
  const buttons = new Map<string, HTMLButtonElement>();
  for (const spec of TOOLS) {
    const b = el("button", "tool");
    b.type = "button";
    b.dataset.tool = spec.tool;
    b.title = spec.title;
    b.disabled = spec.disabled === true;
    b.appendChild(icon(spec.tool));
    b.appendChild(el("span", "tool-label", spec.label));
    b.addEventListener("click", () => onTool(spec.tool, b));
    buttons.set(spec.tool, b);
    root.appendChild(b);
  }
  return {
    root,
    button(tool) {
      const b = buttons.get(tool);
      if (!b) throw new Error(`no tool ${tool}`);
      return b;
    },
    setEnabled(tool, enabled) {
      const b = buttons.get(tool);
      if (b) b.disabled = !enabled;
    }
  };
}
