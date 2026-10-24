/**
 * The view onto the drawing: a horizontal scale in pixels per foot and a
 * pan. The renderer draws at `pxPerFt` with a fixed lane gap, so zooming
 * stretches the track to scale while lane spacing and silhouettes keep their
 * size (the P1 look at every zoom). Pan is the top-left of the svg viewBox
 * in the renderer's pixel frame, so the screen position of a drawing point is
 *   sx = xFt * pxPerFt + marginPx - panX
 *   sy = baselinePx - lane * laneGapPx - panY
 */

import type { DrawPoint, Drawing } from "../core/layout/layout";
import { DEFAULT_LANE_GAP_PX, fitPxPerFt, frameOf, MARGIN_PX, renderOptions, type Frame } from "../render/render";

export interface View {
  pxPerFt: number;
  laneGapPx: number;
  /** Top-left of the viewBox, in the renderer's pixel frame. */
  panX: number;
  panY: number;
}

export const ZOOM_STEP = 1.25;
export const MIN_PX_PER_FT = 0.05;
export const MAX_PX_PER_FT = 4;

function clampScale(pxPerFt: number): number {
  return Math.min(MAX_PX_PER_FT, Math.max(MIN_PX_PER_FT, pxPerFt));
}

/** The whole drawing across the canvas width, vertically centred when the canvas is taller than the drawing. */
export function fitView(drawing: Drawing, widthPx: number, heightPx: number): View {
  const pxPerFt = clampScale(fitPxPerFt(drawing, widthPx));
  const frame = frameOf(drawing, renderOptions({ pxPerFt, laneGapPx: DEFAULT_LANE_GAP_PX }));
  const spare = heightPx - frame.heightPx;
  return { pxPerFt, laneGapPx: DEFAULT_LANE_GAP_PX, panX: frame.xMinPx, panY: spare > 0 ? -spare / 2 : 0 };
}

/** Zoom by a factor keeping the drawing point under `anchorPx` still. Lanes do not scale, so only panX moves. */
export function zoomAt(v: View, factor: number, anchorPx: { x: number; y: number }): View {
  const pxPerFt = clampScale(v.pxPerFt * factor);
  if (pxPerFt === v.pxPerFt) return v;
  // sx = xFt * s + margin - panX. Solve for xFt at the old scale, then for panX at the new one with sx fixed.
  const xFt = (anchorPx.x + v.panX - MARGIN_PX) / v.pxPerFt;
  const panX = xFt * pxPerFt + MARGIN_PX - anchorPx.x;
  return { ...v, pxPerFt, panX };
}

export function panBy(v: View, dx: number, dy: number): View {
  return { ...v, panX: v.panX + dx, panY: v.panY + dy };
}

export function drawingToScreen(v: View, frame: Frame, p: DrawPoint): { x: number; y: number } {
  return { x: p.xFt * v.pxPerFt + frame.marginPx - v.panX, y: frame.baselinePx - p.lane * v.laneGapPx - v.panY };
}

export function screenToDrawing(v: View, frame: Frame, p: { x: number; y: number }): DrawPoint {
  return { xFt: (p.x + v.panX - frame.marginPx) / v.pxPerFt, lane: (frame.baselinePx - (p.y + v.panY)) / v.laneGapPx };
}

export function viewBoxOf(v: View, _frame: Frame, widthPx: number, heightPx: number): string {
  return `${v.panX} ${v.panY} ${widthPx} ${heightPx}`;
}
