/**
 * Standalone HTML: one file holding the plan as JSON, the player bundle and
 * the P1 preview style, in the demo's look. It makes no network requests;
 * the font falls back to the system monospace.
 */

import type { PlanReading } from "../core/schema/types";
import { downloadText, fileStem } from "../editor/store/file";

export const STANDALONE_TITLE_SUFFIX = " | Railway Operating Plan";

/** The P1 preview page's style, with the player rules the editor also uses. */
export const STANDALONE_CSS = `
:root { --ink: #0e1013; --paper: #f2efe6; --gold: #d9c48c; --steel: #8a9199; --rail: #3b424b; --loco: #e8432f; --loaded: #e0ad4b;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--ink); color: var(--paper); font-family: var(--mono); font-size: 14px; line-height: 1.5; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 48px; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 24px; margin-bottom: 16px; }
h1 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: 0.02em; }
.description { color: var(--steel); margin: 0 0 16px; }
.problems { color: var(--loaded); margin: 0 0 12px; padding-left: 20px; }
.problems:empty { display: none; }
.player .stage { border: 1px solid var(--rail); border-radius: 6px; overflow: hidden; background: var(--ink); }
.player svg.plan { display: block; width: 100%; height: auto; }
.player .caption { margin: 16px 0 8px; min-height: 3.5em; }
.player .step-count { color: var(--gold); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.player .step-text { margin: 4px 0 0; font-size: 15px; }
.player .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 16px; }
.player button { font: inherit; color: var(--paper); background: #15181c; border: 1px solid var(--rail); border-radius: 4px; padding: 6px 14px; cursor: pointer; }
.player button:hover:not(:disabled) { border-color: var(--gold); }
.player button:disabled { color: var(--steel); cursor: default; }
.player .dots { display: flex; gap: 6px; margin-left: 12px; }
.player .dot { width: 12px; height: 12px; padding: 0; border-radius: 50%; border: 1px solid var(--steel); background: transparent; }
.player .dot.current { background: var(--gold); border-color: var(--gold); }
.player .notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.player .note { display: grid; grid-template-columns: 7em 1fr; gap: 12px; padding: 8px 12px; border-left: 3px solid var(--steel); background: #15181c; }
.player .note.heads_up { border-left-color: var(--loaded); }
.player .note-level { color: var(--steel); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.player .note.heads_up .note-level { color: var(--loaded); }
.player .unit.route-unclear { animation: fade-in 1.5s ease-out; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 0.55; } }
`;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON that is safe inside a script element: no "</" can end it early. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}

export function standaloneHtml(plan: PlanReading, playerScript: string): string {
  const title = escapeHtml(plan.title);
  const description = plan.description ? `<p class="description">${escapeHtml(plan.description)}</p>` : "";
  // The player script is inlined as given; it is our own build and holds no "</script>".
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}${STANDALONE_TITLE_SUFFIX}</title>`,
    `<style>${STANDALONE_CSS}</style>`,
    "</head>",
    "<body>",
    "<main>",
    `<header><h1>${title}</h1></header>`,
    description,
    '<div id="mount"></div>',
    "</main>",
    `<script type="application/json" id="plan">${jsonForScript(plan)}</script>`,
    `<script>${playerScript}</script>`,
    '<script>ROPC.mount(document.getElementById("mount"), JSON.parse(document.getElementById("plan").textContent));</script>',
    "</body>",
    "</html>"
  ].join("\n");
}

export function standaloneFileName(plan: PlanReading): string {
  return fileStem(plan) + ".html";
}

export function downloadStandalone(plan: PlanReading, playerScript: string, doc?: Document): void {
  downloadText(standaloneFileName(plan), standaloneHtml(plan, playerScript), "text/html", doc);
}
