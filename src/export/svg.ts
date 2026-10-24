/**
 * SVG stills: one drawing per step, rendered with the P1 renderer at a
 * width that fits, with the sprites of that step's state and a title that
 * carries the caption.
 */

import { buildGraph } from "../core/engine/graph";
import { unitsOf } from "../core/engine/materialize";
import { simulate } from "../core/engine/simulate";
import { layout } from "../core/layout/layout";
import { placeUnits } from "../core/layout/place";
import type { PlanReading } from "../core/schema/types";
import { downloadText, fileStem } from "../editor/store/file";
import { captionFor } from "../player/player";
import { fitPxPerFt, frameOf, renderDrawing, renderOptions, renderSprites } from "../render/render";

const SVG_NS = "http://www.w3.org/2000/svg";
export const DEFAULT_SVG_WIDTH_PX = 1200;
export const SVG_DOWNLOAD_GAP_MS = 250;

export function svgForStep(plan: PlanReading, stepIndex: number, widthPx = DEFAULT_SVG_WIDTH_PX): string {
  const g = buildGraph(plan);
  const sim = simulate(plan, g);
  const drawing = layout(plan, g);
  const units = new Map(unitsOf(plan).map((u) => [u.id, u]));
  const i = Math.min(Math.max(0, stepIndex), sim.steps.length - 1);
  const step = sim.steps[i];
  const state = sim.states[i] ?? sim.initial;
  const o = renderOptions({ pxPerFt: fitPxPerFt(drawing, widthPx) });
  const svg = document.createElementNS(SVG_NS, "svg");
  renderDrawing(svg, drawing, o);
  const frame = frameOf(drawing, o);
  svg.setAttribute("width", String(Math.round(frame.widthPx)));
  svg.setAttribute("height", String(Math.round(frame.heightPx)));
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = step ? captionFor(plan, step) : plan.title;
  svg.insertBefore(title, svg.firstChild);
  const layer = svg.querySelector("g.sprites") as SVGGElement | null;
  if (layer) renderSprites(layer, placeUnits(drawing, g, state, units), o, step?.status);
  return new XMLSerializer().serializeToString(svg);
}

export function svgFileName(plan: PlanReading, stepIndex: number): string {
  return `${fileStem(plan)}-step-${stepIndex + 1}.svg`;
}

export function downloadSvg(plan: PlanReading, stepIndex: number, doc?: Document): void {
  downloadText(svgFileName(plan, stepIndex), svgForStep(plan, stepIndex), "image/svg+xml", doc);
}

/** One download per step, a short gap apart so the browser takes them all; it may ask to allow several downloads. */
export async function downloadAllSvgs(plan: PlanReading, doc?: Document, delayMs = SVG_DOWNLOAD_GAP_MS): Promise<void> {
  const total = simulate(plan, buildGraph(plan)).steps.length;
  for (let i = 0; i < total; i++) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    downloadSvg(plan, i, doc);
  }
}
