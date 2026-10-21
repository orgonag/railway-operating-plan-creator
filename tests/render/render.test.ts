// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { cloneJson } from "../../src/core/schema/clone";
import { materialize, unitsOf } from "../../src/core/engine/materialize";
import { buildGraph } from "../../src/core/engine/graph";
import { simulate } from "../../src/core/engine/simulate";
import { layout, type Drawing } from "../../src/core/layout/layout";
import { placeUnits, type Sprite } from "../../src/core/layout/place";
import {
  fitPxPerFt,
  frameOf,
  renderDrawing,
  renderOptions,
  renderSprites,
  screenAngleDeg,
  toScreen,
  MARGIN_PX,
  type RenderOptions
} from "../../src/render/render";
import { silhouette, SILHOUETTE_HEIGHT_PX } from "../../src/render/silhouettes";
import { theme } from "../../src/render/theme";

const demoM = materialize(validateFile(demoJson).plan as PlanReading).plan;
const g = buildGraph(demoM);
const drawing = layout(demoM, g);
const units = new Map(unitsOf(demoM).map((u) => [u.id, u]));
const sim = simulate(demoM, g);

const o: RenderOptions = { pxPerFt: 1, laneGapPx: 90, showMarks: true, showSpots: false };

function svgEl(): SVGSVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

function rendered(d: Drawing = drawing, opts: RenderOptions = o): SVGSVGElement {
  const svg = svgEl();
  renderDrawing(svg, d, opts);
  return svg;
}

function spriteLayer(svg: SVGSVGElement): SVGGElement {
  const layer = svg.querySelector("g.sprites");
  if (!layer) throw new Error("no sprite layer");
  return layer as SVGGElement;
}

function car(over: Partial<Sprite> = {}): Sprite {
  return {
    id: "C1",
    kind: "car",
    type: "covered_hopper_large",
    loaded: true,
    lengthFt: 60,
    mark: "ABCX",
    number: "1001",
    centre: { xFt: 1580, lane: 1 },
    tangent: { dxFt: 1, dLane: 0 },
    ...over
  };
}

describe("renderDrawing", () => {
  test("draws one path per track and one box per facility", () => {
    const svg = rendered();
    const paths = svg.querySelectorAll("g.tracks path.track");
    expect(paths.length).toBe(drawing.tracks.length);
    expect(paths.length).toBe(2);
    const ids = [...paths].map((p) => p.getAttribute("data-id")).sort();
    expect(ids).toEqual(["MAIN", "SPUR1"]);
    // MAIN runs from x 0 to x 1670 on lane 0, the full width: the path starts at the margin on the baseline.
    const frame = frameOf(drawing, o);
    const main = svg.querySelector('path.track[data-id="MAIN"]')!;
    expect(main.getAttribute("d")).toBe(`M ${MARGIN_PX} ${frame.baselinePx} L ${1670 + MARGIN_PX} ${frame.baselinePx}`);
    expect(main.getAttribute("stroke")).toBe(theme.rail);

    const boxes = svg.querySelectorAll("g.facilities rect.facility");
    expect(boxes.length).toBe(drawing.facilities.length);
    expect(boxes.length).toBe(1);
    const racks = boxes[0]!;
    expect(racks.getAttribute("data-id")).toBe("RACKS");
    expect(Number(racks.getAttribute("x"))).toBe(1310 + MARGIN_PX);
    expect(Number(racks.getAttribute("width"))).toBe(360);
    expect(racks.getAttribute("stroke")).toBe(theme.gold);
    const label = svg.querySelector("g.facilities text.facility-label")!;
    expect(label.textContent).toBe("Unloading racks");
    expect(label.getAttribute("fill")).toBe(theme.gold);
    // Spots are not drawn unless asked for: the box and its name are enough.
    expect(svg.querySelectorAll("g.facilities .spot").length).toBe(0);
    expect(svg.querySelectorAll("g.facilities .spot-number").length).toBe(0);
    // The drawing calls renderDrawing twice without doubling anything.
    renderDrawing(svg, drawing, o);
    expect(svg.querySelectorAll("path.track").length).toBe(2);
    expect(svg.querySelectorAll("rect.facility").length).toBe(1);
    expect(svg.getAttribute("font-family")).toContain("JetBrains Mono");
    expect(svg.getAttribute("font-family")).toContain("monospace");
    expect(svg.getAttribute("viewBox")).toBeTruthy();
    expect(svg.querySelector("rect.background")!.getAttribute("fill")).toBe(theme.ink);
  });

  test("renderOptions leaves spots off; showSpots draws a tick and a number for each of the five spots", () => {
    expect(renderOptions().showSpots).toBe(false);
    expect(renderOptions().showMarks).toBe(false);
    const off = rendered(drawing, renderOptions({ pxPerFt: 1, laneGapPx: 90 }));
    expect(off.querySelectorAll("g.facilities rect.facility").length).toBe(1);
    expect(off.querySelector("g.facilities text.facility-label")!.textContent).toBe("Unloading racks");
    expect(off.querySelectorAll("g.facilities .spot").length).toBe(0);
    expect(off.querySelectorAll("g.facilities .spot-number").length).toBe(0);

    const on = rendered(drawing, { ...o, showSpots: true });
    const ticks = on.querySelectorAll("g.facilities rect.spot");
    const numbers = on.querySelectorAll("g.facilities text.spot-number");
    expect(ticks.length).toBe(5);
    expect(numbers.length).toBe(5);
    expect([...numbers].map((n) => n.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    // Spot 1 spans x 1310 to 1370 at 1 px/ft: the tick is inset 1 px each side.
    const first = ticks[0]!;
    expect(first.getAttribute("data-n")).toBe("1");
    expect(Number(first.getAttribute("x"))).toBe(1310 + MARGIN_PX + 1);
    expect(Number(first.getAttribute("width"))).toBe(58);
    expect(first.getAttribute("fill")).toBe(theme.gold);
  });

  test("labels the compass points and the arrival arrow", () => {
    const svg = rendered();
    const left = svg.querySelector("text.compass-left")!;
    const right = svg.querySelector("text.compass-right")!;
    expect(left.textContent).toBe("West");
    expect(right.textContent).toBe("East");
    expect(Number(left.getAttribute("x"))).toBeLessThan(Number(right.getAttribute("x")));
    const arrow = svg.querySelector("g.arrival-arrow")!;
    expect(arrow.getAttribute("data-side")).toBe("left");
    expect(arrow.querySelector("text")!.textContent).toBe("Eastbound");
    expect(arrow.querySelector("path")).not.toBeNull();

    const mirrored = cloneJson(demoM);
    mirrored.arrival.enters = "right";
    const dm = layout(materialize(mirrored).plan, buildGraph(materialize(mirrored).plan));
    const svg2 = rendered(dm);
    expect(svg2.querySelector("text.compass-left")!.textContent).toBe("East");
    expect(svg2.querySelector("text.compass-right")!.textContent).toBe("West");
    expect(svg2.querySelector("g.arrival-arrow")!.getAttribute("data-side")).toBe("right");
    // One buffer stop drawn for SPUR1.
    expect(svg2.querySelectorAll("g.buffers .buffer-stop").length).toBe(1);
  });

  test("toScreen maps feet and lanes with the margin and the lane gap; fitPxPerFt fills the width", () => {
    const frame = frameOf(drawing, o);
    expect(toScreen({ xFt: 0, lane: 0 }, o, frame)).toEqual({ x: MARGIN_PX, y: frame.baselinePx });
    expect(toScreen({ xFt: 100, lane: 1 }, o, frame)).toEqual({ x: 100 + MARGIN_PX, y: frame.baselinePx - 90 });
    const half = { ...o, pxPerFt: 0.5 };
    expect(toScreen({ xFt: 100, lane: -1 }, half, frameOf(drawing, half))).toEqual({
      x: 50 + MARGIN_PX,
      y: frameOf(drawing, half).baselinePx + 90
    });
    // The demo spans x 0 to 1670 ft. Filling 1750 px leaves 2 margins of 40.
    expect(fitPxPerFt(drawing, 1750)).toBeCloseTo(1670 / 1670, 6);
    expect(fitPxPerFt(drawing, 915)).toBeCloseTo(835 / 1670, 6);
    // The viewBox covers the x range plus both margins.
    const svg = rendered();
    const [vx, vy, vw, vh] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(vx).toBe(0);
    expect(vy).toBe(0);
    expect(vw).toBe(1670 + 2 * MARGIN_PX);
    expect(vh).toBe(frame.heightPx);
    expect(frame.heightPx).toBeGreaterThan(frame.baselinePx);
  });
});

describe("screenAngleDeg", () => {
  test("screenAngleDeg for the 240 ft turnout is about 20.6 at 1 px/ft and about 36.9 at 0.5 px/ft with a 90 px gap", () => {
    expect(screenAngleDeg({ dxFt: 240, dLane: 1 }, { pxPerFt: 1, laneGapPx: 90, showMarks: false, showSpots: false })).toBeCloseTo(-20.56, 1);
    expect(screenAngleDeg({ dxFt: 240, dLane: 1 }, { pxPerFt: 0.5, laneGapPx: 90, showMarks: false, showSpots: false })).toBeCloseTo(-36.87, 1);
    expect(screenAngleDeg({ dxFt: 1, dLane: 0 }, o)).toBe(0);
    // A mirrored flat tangent is a half turn either way round.
    expect(Math.abs(screenAngleDeg({ dxFt: -1, dLane: 0 }, o))).toBe(180);
  });
});

describe("silhouette", () => {
  test("silhouettes exist for generic, covered_hopper_large, tank_general, boxcar_50 and six_axle; unknown types fall back to generic", () => {
    const shapes = ["generic", "covered_hopper_large", "tank_general", "boxcar_50"] as const;
    for (const s of shapes) {
      const el = silhouette(s, "car", 120, true);
      expect(el.tagName.toLowerCase()).toBe("g");
      expect(el.getAttribute("data-shape")).toBe(s);
      expect(el.querySelector(".body")).not.toBeNull();
    }
    const loco = silhouette("six_axle", "loco", 160, false);
    expect(loco.getAttribute("data-shape")).toBe("six_axle");
    expect(loco.querySelector(".body")!.getAttribute("fill")).toBe(theme.loco);
    expect(loco.querySelectorAll(".wheel").length).toBe(6);

    expect(silhouette("no_such_type", "car", 120, true).getAttribute("data-shape")).toBe("generic");
    expect(silhouette("no_such_type", "loco", 160, false).getAttribute("data-shape")).toBe("generic");
    // The known shapes differ from one another, not just by name.
    const boxcar = silhouette("boxcar_50", "car", 120, true);
    expect(boxcar.querySelector(".door")).not.toBeNull();
    expect(silhouette("generic", "car", 120, true).querySelector(".door")).toBeNull();
    expect(silhouette("tank_general", "car", 120, true).querySelector(".body")!.getAttribute("rx")).not.toBeNull();
    expect(silhouette("covered_hopper_large", "car", 120, true).querySelector("path.body")!.getAttribute("d")).toContain("L");
  });

  test("a sprite is drawn at its length in px", () => {
    // Generic silhouette: body rect spans the length, centred on the origin.
    const el = silhouette("generic", "car", 120, true);
    expect(el.getAttribute("data-length-px")).toBe("120");
    const body = el.querySelector("rect.body")!;
    expect(Number(body.getAttribute("x"))).toBe(-60);
    expect(Number(body.getAttribute("width"))).toBe(120);
    expect(Number(body.getAttribute("y"))).toBeLessThan(0);
    expect(Number(body.getAttribute("height"))).toBeLessThanOrEqual(SILHOUETTE_HEIGHT_PX);

    // Through renderSprites at 2 px/ft a 60 ft car is 120 px and an 80 ft loco is 160 px.
    const two = { ...o, pxPerFt: 2 };
    const svg = rendered(drawing, two);
    const sprites = placeUnits(drawing, g, sim.states[1]!, units);
    renderSprites(spriteLayer(svg), sprites, two);
    const c1 = svg.querySelector('g.unit[data-id="C1"]')!;
    expect(c1.querySelector("g[data-length-px]")!.getAttribute("data-length-px")).toBe("120");
    const l1 = svg.querySelector('g.unit[data-id="L1"]')!;
    expect(l1.querySelector("g[data-length-px]")!.getAttribute("data-length-px")).toBe("160");
    expect(c1.classList.contains("car")).toBe(true);
    expect(l1.classList.contains("loco")).toBe(true);
    expect(svg.querySelectorAll("g.unit").length).toBe(sprites.length);
    // C1 stands at x 1580 on lane 1: translated there and unrotated.
    const frame = frameOf(drawing, two);
    expect(c1.getAttribute("transform")).toBe(`translate(${1580 * 2 + MARGIN_PX} ${frame.baselinePx - 90}) rotate(0)`);
    // A sprite on the turnout diagonal is rotated by the screen angle.
    const layer = spriteLayer(svg);
    renderSprites(layer, [car({ centre: { xFt: 700, lane: 0.5 }, tangent: { dxFt: 1, dLane: 1 / 240 } })], two);
    const diag = svg.querySelector('g.unit[data-id="C1"]')!;
    const rotate = /rotate\(([-\d.]+)\)/.exec(diag.getAttribute("transform") ?? "");
    expect(rotate).not.toBeNull();
    expect(Number(rotate![1])).toBeCloseTo(screenAngleDeg({ dxFt: 1, dLane: 1 / 240 }, two), 1);
    expect(Number(rotate![1])).toBeCloseTo(-10.62, 1);
    expect(diag.getAttribute("transform")).toContain(`translate(${700 * 2 + MARGIN_PX} ${frame.baselinePx - 45})`);
  });

  test("loaded and empty cars differ in fill", () => {
    const loaded = silhouette("covered_hopper_large", "car", 120, true).querySelector(".body")!;
    const empty = silhouette("covered_hopper_large", "car", 120, false).querySelector(".body")!;
    expect(loaded.getAttribute("fill")).toBe(theme.loaded);
    expect(empty.getAttribute("fill")).toBe("none");
    expect(empty.getAttribute("stroke")).toBe(theme.empty);
    expect(loaded.getAttribute("fill")).not.toBe(empty.getAttribute("fill"));

    const svg = rendered();
    renderSprites(spriteLayer(svg), [car({ id: "A", loaded: true }), car({ id: "B", loaded: false, centre: { xFt: 1520, lane: 1 } })], o);
    const a = svg.querySelector('g.unit[data-id="A"]')!;
    const b = svg.querySelector('g.unit[data-id="B"]')!;
    expect(a.classList.contains("loaded")).toBe(true);
    expect(a.classList.contains("empty")).toBe(false);
    expect(b.classList.contains("empty")).toBe(true);
    expect(a.querySelector(".body")!.getAttribute("fill")).toBe(theme.loaded);
    expect(b.querySelector(".body")!.getAttribute("fill")).toBe("none");
    // Marks are drawn under the car when asked for, and not otherwise.
    expect(a.querySelector("text.mark")!.textContent).toBe("ABCX 1001");
    expect(Number(a.querySelector("text.mark")!.getAttribute("y"))).toBeGreaterThan(0);
    renderSprites(spriteLayer(svg), [car({ id: "A" })], { ...o, showMarks: false });
    expect(svg.querySelector('g.unit[data-id="A"] text.mark')).toBeNull();
  });

  test("route_not_established sprites get the dashed, faded class and a 'Route not established' label", () => {
    const svg = rendered();
    const layer = spriteLayer(svg);
    renderSprites(layer, [car()], o, "route_not_established");
    const unit = svg.querySelector('g.unit[data-id="C1"]')!;
    expect(unit.classList.contains("route-unclear")).toBe(true);
    const label = layer.querySelector("text.status-label")!;
    expect(label.textContent).toBe("Route not established");
    const style = svg.querySelector("style")!.textContent ?? "";
    expect(style).toMatch(/\.route-unclear\s*\{[^}]*opacity/);
    expect(style).toMatch(/\.route-unclear[^{]*\{[^}]*stroke-dasharray/);

    // An ok step clears both again.
    renderSprites(layer, [car()], o, "ok");
    expect(svg.querySelector("g.unit.route-unclear")).toBeNull();
    expect(layer.querySelector("text.status-label")).toBeNull();
    renderSprites(layer, [car()], o);
    expect(svg.querySelector("g.unit.route-unclear")).toBeNull();
  });

  test("a caption or mark containing <script> appears as literal text, not markup", () => {
    const hostile = "<script>alert(1)</script>";
    const d: Drawing = cloneJson(drawing);
    d.facilities[0]!.name = hostile;
    d.compass.left = hostile;
    d.arrivalArrow.label = hostile;
    const svg = rendered(d);
    expect(svg.querySelector("script")).toBeNull();
    expect(svg.querySelector("text.facility-label")!.textContent).toBe(hostile);
    expect(svg.querySelector("text.compass-left")!.textContent).toBe(hostile);
    expect(svg.querySelector("g.arrival-arrow text")!.textContent).toBe(hostile);
    renderSprites(spriteLayer(svg), [car({ mark: hostile, number: "<b>1</b>" })], o);
    expect(svg.querySelector("script")).toBeNull();
    expect(svg.querySelector("b")).toBeNull();
    expect(svg.querySelector("text.mark")!.textContent).toBe(`${hostile} <b>1</b>`);
    expect(svg.querySelector("text.mark")!.childNodes.length).toBe(1);
    expect(svg.querySelector("text.mark")!.firstChild!.nodeType).toBe(3);
  });
});
