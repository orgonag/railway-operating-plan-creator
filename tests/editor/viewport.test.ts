import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { buildGraph } from "../../src/core/engine/graph";
import { materialize } from "../../src/core/engine/materialize";
import { layout } from "../../src/core/layout/layout";
import { validateFile } from "../../src/core/schema/validateFile";
import { frameOf, renderOptions } from "../../src/render/render";
import { drawingToScreen, fitView, MAX_PX_PER_FT, MIN_PX_PER_FT, panBy, screenToDrawing, viewBoxOf, zoomAt, type View } from "../../src/editor/viewport";

const demo = materialize(validateFile(demoJson).plan!).plan;
const drawing = layout(demo, buildGraph(demo));
const frameFor = (v: View) => frameOf(drawing, renderOptions({ pxPerFt: v.pxPerFt, laneGapPx: v.laneGapPx }));

describe("viewport", () => {
  test("fitView shows the whole drawing width at the fitted scale", () => {
    const v = fitView(drawing, 1000, 500);
    const frame = frameFor(v);
    expect(frame.widthPx).toBeCloseTo(1000, 0);
    expect(v.panX).toBeCloseTo(frame.xMinPx, 5);
    const left = drawingToScreen(v, frame, { xFt: 0, lane: 0 });
    const right = drawingToScreen(v, frame, { xFt: drawing.widthFt, lane: 0 });
    expect(left.x).toBeCloseTo(40, 5);
    expect(right.x).toBeCloseTo(960, 5);
  });

  test("zoomAt keeps the drawing point under the anchor fixed", () => {
    const v = fitView(drawing, 1000, 500);
    const anchor = { x: 300, y: 200 };
    const before = screenToDrawing(v, frameFor(v), anchor);
    const z = zoomAt(v, 1.25, anchor);
    expect(z.pxPerFt).toBeCloseTo(v.pxPerFt * 1.25, 9);
    const after = screenToDrawing(z, frameFor(z), anchor);
    expect(after.xFt).toBeCloseTo(before.xFt, 6);
    expect(after.lane).toBeCloseTo(before.lane, 6);
    const back = drawingToScreen(z, frameFor(z), before);
    expect(back.x).toBeCloseTo(anchor.x, 6);
    expect(back.y).toBeCloseTo(anchor.y, 6);
  });

  test("zoom clamps between MIN_PX_PER_FT and MAX_PX_PER_FT", () => {
    const v = fitView(drawing, 1000, 500);
    let z = v;
    for (let i = 0; i < 40; i++) z = zoomAt(z, 2, { x: 0, y: 0 });
    expect(z.pxPerFt).toBe(MAX_PX_PER_FT);
    for (let i = 0; i < 40; i++) z = zoomAt(z, 0.5, { x: 0, y: 0 });
    expect(z.pxPerFt).toBe(MIN_PX_PER_FT);
  });

  test("screenToDrawing inverts drawingToScreen after a pan", () => {
    const v = panBy(fitView(drawing, 1000, 500), 120, -35);
    expect(v.panX).toBeCloseTo(fitView(drawing, 1000, 500).panX + 120, 9);
    const frame = frameFor(v);
    const p = { xFt: 1234.5, lane: 1 };
    const s = drawingToScreen(v, frame, p);
    const q = screenToDrawing(v, frame, s);
    expect(q.xFt).toBeCloseTo(p.xFt, 6);
    expect(q.lane).toBeCloseTo(p.lane, 6);
  });

  test("viewBoxOf starts at the pan and spans the canvas size", () => {
    const v = panBy(fitView(drawing, 1000, 500), 10, 20);
    expect(viewBoxOf(v, frameFor(v), 1000, 500)).toBe(`${v.panX} ${v.panY} 1000 500`);
  });
});
