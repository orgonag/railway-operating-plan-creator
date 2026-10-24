/**
 * The Export button: a small menu under it with the standalone page, the
 * SVG of the step on show and an SVG of every step.
 */

import playerScript from "../../app/generated/player.iife.js?raw";
import { downloadStandalone } from "../export/standalone";
import { downloadAllSvgs, downloadSvg } from "../export/svg";
import { openContextMenu } from "./contextMenu";
import type { Editor } from "./editor";

export const EXPORT_ITEMS = [
  { action: "standalone", label: "Standalone page", title: "One HTML file that plays this plan, with no network needed" },
  { action: "svg-step", label: "SVG of this step", title: "A still picture of the step on show" },
  { action: "svg-all", label: "SVG of every step", title: "One SVG file per step; the browser may ask to allow several downloads" }
] as const;

export const EXPORTING_ALL_TEXT = "Downloading one SVG per step; the browser may ask to allow several downloads";

export function attachExportTools(editor: Editor): () => void {
  return editor.registerTool("export", () => {
    const b = editor.toolbar.button("export");
    const r = b.getBoundingClientRect();
    const host = editor.root.getBoundingClientRect();
    const menu = openContextMenu(
      editor.root,
      { x: r.left - host.left, y: r.bottom - host.top },
      EXPORT_ITEMS.map((item) => ({
        action: item.action,
        label: item.label,
        onPick: () => runExport(editor, item.action)
      }))
    );
    menu.classList.add("export-menu");
    for (const item of EXPORT_ITEMS) {
      const button = menu.querySelector<HTMLButtonElement>(`[data-action="${item.action}"]`);
      if (button) button.title = item.title;
    }
  });
}

export function runExport(editor: Editor, action: (typeof EXPORT_ITEMS)[number]["action"]): void {
  const plan = editor.history.plan;
  switch (action) {
    case "standalone":
      downloadStandalone(plan, playerScript);
      break;
    case "svg-step":
      downloadSvg(plan, editor.state().stepIndex);
      break;
    case "svg-all":
      editor.setStatus(EXPORTING_ALL_TEXT);
      void downloadAllSvgs(plan);
      break;
  }
}
