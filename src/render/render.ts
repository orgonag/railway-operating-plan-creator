/**
 * SVG renderer: draws what the core computed, in pixels.
 *
 * Nothing here measures distance. The drawing arrives in feet and lanes; the
 * only arithmetic is the screen mapping
 *   x_px = xFt * pxPerFt + marginPx
 *   y_px = baselinePx - lane * laneGapPx
 * and the screen angle of a tangent, which depends on that stretch.
 *
 * `renderDrawing` lays down the static picture (tracks, facilities, labels)
 * and leaves an empty `g.sprites` layer. `renderSprites` fills that layer for
 * one step and may be called again for every step. The frame the drawing was
 * rendered with is kept on the sprite layer as data attributes so sprites land
 * on the same rails without the caller passing it around.
 *
 * User text (names, labels, marks) goes in with textContent only.
 */

import type { DrawPoint, Drawing, DrawnFacility, Tangent } from "../core/layout/layout";
import type { Sprite } from "../core/layout/place";
import type { StepStatus } from "../core/engine/state";
import { SILHOUETTE_HEIGHT_PX, SVG_NS, silhouette } from "./silhouettes";
import { theme } from "./theme";

export interface RenderOptions {
  pxPerFt: number;
  laneGapPx: number;
  showMarks: boolean;
  /** Draw each facility's spot ticks and numbers. Off by default: spots place cars but clutter the drawing. */
  showSpots: boolean;
}

export const DEFAULT_LANE_GAP_PX = 90;
export const MARGIN_PX = 40;

/** Space kept above the highest lane and below the lowest, beyond the lane gap. */
const HEADER_PX = 44;
const FOOTER_PX = 30;

export const ROUTE_NOT_ESTABLISHED_TEXT = "Route not established";

/** The pixel frame a drawing is rendered in; the viewBox is (xMinPx, 0, widthPx, heightPx). */
export interface Frame {
  marginPx: number;
  baselinePx: number;
  xMinPx: number;
  widthPx: number;
  heightPx: number;
}

export function renderOptions(over: Partial<RenderOptions> = {}): RenderOptions {
  return { pxPerFt: 1, laneGapPx: DEFAULT_LANE_GAP_PX, showMarks: false, showSpots: false, ...over };
}

/** The x and lane extent of everything the drawing places. */
function extent(d: Drawing): { xMinFt: number; xMaxFt: number; laneMin: number; laneMax: number } {
  let xMinFt = 0;
  let xMaxFt = d.widthFt;
  let laneMin = 0;
  let laneMax = 0;
  const see = (xFt: number, lane: number): void => {
    xMinFt = Math.min(xMinFt, xFt);
    xMaxFt = Math.max(xMaxFt, xFt);
    laneMin = Math.min(laneMin, lane);
    laneMax = Math.max(laneMax, lane);
  };
  for (const t of d.tracks) for (const p of t.points) see(p.xFt, p.lane);
  for (const f of d.facilities) {
    see(f.fromXFt, f.lane);
    see(f.toXFt, f.lane);
  }
  for (const b of d.bufferStops) see(b.xFt, b.lane);
  return { xMinFt, xMaxFt, laneMin, laneMax };
}

export function frameOf(d: Drawing, o: RenderOptions): Frame {
  const e = extent(d);
  const topRoom = HEADER_PX + o.laneGapPx * 0.5;
  const bottomRoom = FOOTER_PX + o.laneGapPx * 0.35;
  const baselinePx = topRoom + e.laneMax * o.laneGapPx;
  return {
    marginPx: MARGIN_PX,
    baselinePx,
    xMinPx: e.xMinFt * o.pxPerFt,
    widthPx: (e.xMaxFt - e.xMinFt) * o.pxPerFt + 2 * MARGIN_PX,
    heightPx: baselinePx - e.laneMin * o.laneGapPx + bottomRoom
  };
}

/** The scale that fits the drawing's x range into a width, margins included. */
export function fitPxPerFt(d: Drawing, widthPx: number): number {
  const e = extent(d);
  const span = Math.max(1, e.xMaxFt - e.xMinFt);
  return Math.max(0.01, (widthPx - 2 * MARGIN_PX) / span);
}

export function toScreen(p: DrawPoint, o: RenderOptions, frame: Frame): { x: number; y: number } {
  return { x: p.xFt * o.pxPerFt + frame.marginPx, y: frame.baselinePx - p.lane * o.laneGapPx };
}

/** Screen angle of a tangent in degrees; negative turns up the page. */
export function screenAngleDeg(tangent: Tangent, o: RenderOptions): number {
  const deg = (Math.atan2(-tangent.dLane * o.laneGapPx, tangent.dxFt * o.pxPerFt) * 180) / Math.PI;
  // A flat tangent gives -0 from atan2; keep it a plain 0 so values compare equal.
  return deg === 0 ? 0 : deg;
}

// ---- drawing ----

export function renderDrawing(svg: SVGSVGElement, d: Drawing, o: RenderOptions): void {
  const frame = frameOf(d, o);
  clear(svg);
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `${num(frame.xMinPx)} 0 ${num(frame.widthPx)} ${num(frame.heightPx)}`);
  svg.setAttribute("font-family", theme.font);
  svg.setAttribute("font-size", "12");
  svg.appendChild(styleSheet());

  const bg = el("rect");
  bg.setAttribute("class", "background");
  bg.setAttribute("x", num(frame.xMinPx));
  bg.setAttribute("y", "0");
  bg.setAttribute("width", num(frame.widthPx));
  bg.setAttribute("height", num(frame.heightPx));
  bg.setAttribute("fill", theme.ink);
  svg.appendChild(bg);

  svg.appendChild(facilitiesLayer(d, o, frame));
  svg.appendChild(tracksLayer(d, o, frame));
  svg.appendChild(buffersLayer(d, o, frame));
  svg.appendChild(labelsLayer(d, frame));

  const sprites = el("g");
  sprites.setAttribute("class", "sprites");
  rememberFrame(sprites, frame);
  svg.appendChild(sprites);
}

function tracksLayer(d: Drawing, o: RenderOptions, frame: Frame): SVGGElement {
  const g = layer("tracks");
  for (const t of d.tracks) {
    const path = el("path");
    path.setAttribute("class", `track ${t.role}`);
    path.setAttribute("data-id", t.id);
    path.setAttribute("d", t.points.map((p, i) => `${i === 0 ? "M" : "L"} ${pt(p, o, frame)}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", theme.rail);
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    g.appendChild(path);
  }
  return g;
}

function facilitiesLayer(d: Drawing, o: RenderOptions, frame: Frame): SVGGElement {
  const g = layer("facilities");
  for (const f of d.facilities) g.appendChild(facility(f, o, frame));
  return g;
}

function facility(f: DrawnFacility, o: RenderOptions, frame: Frame): SVGGElement {
  const g = el("g");
  g.setAttribute("class", "facility-group");
  g.setAttribute("data-id", f.id);
  const a = toScreen({ xFt: f.fromXFt, lane: f.lane }, o, frame);
  const b = toScreen({ xFt: f.toXFt, lane: f.lane }, o, frame);
  const top = a.y - SILHOUETTE_HEIGHT_PX - 16;
  const bottom = a.y + o.laneGapPx * 0.2;

  const box = el("rect");
  box.setAttribute("class", "facility");
  box.setAttribute("data-id", f.id);
  box.setAttribute("x", num(a.x));
  box.setAttribute("y", num(top));
  box.setAttribute("width", num(b.x - a.x));
  box.setAttribute("height", num(bottom - top));
  box.setAttribute("fill", "none");
  box.setAttribute("stroke", theme.gold);
  box.setAttribute("stroke-width", "1.2");
  box.setAttribute("stroke-dasharray", "6 4");
  g.appendChild(box);

  const label = el("text");
  label.setAttribute("class", "facility-label");
  label.setAttribute("x", num(a.x + 6));
  label.setAttribute("y", num(top - 6));
  label.setAttribute("fill", theme.gold);
  label.textContent = f.name;
  g.appendChild(label);

  if (!o.showSpots) return g;
  for (const s of f.spots) {
    const sa = toScreen({ xFt: s.fromXFt, lane: f.lane }, o, frame);
    const sb = toScreen({ xFt: s.toXFt, lane: f.lane }, o, frame);
    const tick = el("rect");
    tick.setAttribute("class", "spot");
    tick.setAttribute("data-n", String(s.n));
    tick.setAttribute("x", num(sa.x + 1));
    tick.setAttribute("y", num(sa.y + 6));
    tick.setAttribute("width", num(Math.max(0, sb.x - sa.x - 2)));
    tick.setAttribute("height", "3");
    tick.setAttribute("fill", theme.gold);
    tick.setAttribute("opacity", "0.6");
    g.appendChild(tick);
    const n = el("text");
    n.setAttribute("class", "spot-number");
    n.setAttribute("x", num((sa.x + sb.x) / 2));
    n.setAttribute("y", num(sa.y + 20));
    n.setAttribute("text-anchor", "middle");
    n.setAttribute("font-size", "10");
    n.setAttribute("fill", theme.gold);
    n.textContent = String(s.n);
    g.appendChild(n);
  }
  return g;
}

function buffersLayer(d: Drawing, o: RenderOptions, frame: Frame): SVGGElement {
  const g = layer("buffers");
  for (const b of d.bufferStops) {
    const p = toScreen(b, o, frame);
    const stop = el("path");
    stop.setAttribute("class", "buffer-stop");
    stop.setAttribute("d", `M ${num(p.x)} ${num(p.y - 9)} V ${num(p.y + 6)}`);
    stop.setAttribute("stroke", theme.steel);
    stop.setAttribute("stroke-width", "4");
    stop.setAttribute("stroke-linecap", "round");
    g.appendChild(stop);
  }
  return g;
}

function labelsLayer(d: Drawing, frame: Frame): SVGGElement {
  const g = layer("labels");
  const leftX = frame.xMinPx + frame.marginPx;
  const rightX = frame.xMinPx + frame.widthPx - frame.marginPx;

  const left = text("compass-left", leftX, 16, d.compass.left);
  left.setAttribute("fill", theme.steel);
  g.appendChild(left);
  const right = text("compass-right", rightX, 16, d.compass.right);
  right.setAttribute("text-anchor", "end");
  right.setAttribute("fill", theme.steel);
  g.appendChild(right);

  const arrow = el("g");
  arrow.setAttribute("class", "arrival-arrow");
  arrow.setAttribute("data-side", d.arrivalArrow.side);
  const y = 36;
  const len = 36;
  const head = el("path");
  if (d.arrivalArrow.side === "left") {
    head.setAttribute("d", `M ${num(leftX)} ${y} H ${num(leftX + len)} M ${num(leftX + len - 6)} ${y - 5} L ${num(leftX + len)} ${y} L ${num(leftX + len - 6)} ${y + 5}`);
  } else {
    head.setAttribute("d", `M ${num(rightX)} ${y} H ${num(rightX - len)} M ${num(rightX - len + 6)} ${y - 5} L ${num(rightX - len)} ${y} L ${num(rightX - len + 6)} ${y + 5}`);
  }
  head.setAttribute("fill", "none");
  head.setAttribute("stroke", theme.gold);
  head.setAttribute("stroke-width", "2");
  head.setAttribute("stroke-linecap", "round");
  arrow.appendChild(head);
  const label = d.arrivalArrow.side === "left" ? text("arrival-label", leftX + len + 8, y + 4, d.arrivalArrow.label) : text("arrival-label", rightX - len - 8, y + 4, d.arrivalArrow.label);
  if (d.arrivalArrow.side === "right") label.setAttribute("text-anchor", "end");
  label.setAttribute("fill", theme.gold);
  arrow.appendChild(label);
  g.appendChild(arrow);
  return g;
}

// ---- sprites ----

export function renderSprites(layer: SVGGElement, sprites: Sprite[], o: RenderOptions, status?: StepStatus): void {
  const frame = recallFrame(layer) ?? frameFromSprites(sprites, o);
  clear(layer);
  const unclear = status === "route_not_established";
  for (const s of sprites) {
    const g = el("g");
    const classes = ["unit", s.kind, s.loaded ? "loaded" : "empty"];
    if (unclear) classes.push("route-unclear");
    g.setAttribute("class", classes.join(" "));
    g.setAttribute("data-id", s.id);
    g.setAttribute("data-type", s.type);
    const p = toScreen(s.centre, o, frame);
    g.setAttribute("transform", `translate(${num(p.x)} ${num(p.y)}) rotate(${num(screenAngleDeg(s.tangent, o))})`);
    g.appendChild(silhouette(s.type, s.kind, s.lengthFt * o.pxPerFt, s.loaded));
    if (o.showMarks && s.kind === "car" && (s.mark !== undefined || s.number !== undefined)) {
      const mark = text("mark", 0, 16, [s.mark, s.number].filter((v) => v !== undefined).join(" "));
      mark.setAttribute("text-anchor", "middle");
      mark.setAttribute("font-size", "10");
      mark.setAttribute("fill", theme.paper);
      g.appendChild(mark);
    }
    layer.appendChild(g);
  }
  if (unclear) {
    const label = text("status-label", frame.xMinPx + frame.widthPx / 2, 36, ROUTE_NOT_ESTABLISHED_TEXT);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", theme.paper);
    layer.appendChild(label);
  }
}

function rememberFrame(layer: SVGGElement, frame: Frame): void {
  layer.setAttribute("data-margin-px", String(frame.marginPx));
  layer.setAttribute("data-baseline-px", String(frame.baselinePx));
  layer.setAttribute("data-x-min-px", String(frame.xMinPx));
  layer.setAttribute("data-width-px", String(frame.widthPx));
  layer.setAttribute("data-height-px", String(frame.heightPx));
}

function recallFrame(layer: SVGGElement): Frame | undefined {
  const read = (name: string): number | undefined => {
    const v = layer.getAttribute(name);
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const marginPx = read("data-margin-px");
  const baselinePx = read("data-baseline-px");
  const xMinPx = read("data-x-min-px");
  const widthPx = read("data-width-px");
  const heightPx = read("data-height-px");
  if (marginPx === undefined || baselinePx === undefined || xMinPx === undefined || widthPx === undefined || heightPx === undefined) return undefined;
  return { marginPx, baselinePx, xMinPx, widthPx, heightPx };
}

/** A frame for a layer that renderDrawing did not make: wide enough for the sprites themselves. */
function frameFromSprites(sprites: Sprite[], o: RenderOptions): Frame {
  let laneMax = 0;
  let laneMin = 0;
  let xMinFt = 0;
  let xMaxFt = 0;
  for (const s of sprites) {
    laneMax = Math.max(laneMax, s.centre.lane);
    laneMin = Math.min(laneMin, s.centre.lane);
    xMinFt = Math.min(xMinFt, s.centre.xFt - s.lengthFt / 2);
    xMaxFt = Math.max(xMaxFt, s.centre.xFt + s.lengthFt / 2);
  }
  const baselinePx = HEADER_PX + o.laneGapPx * 0.5 + laneMax * o.laneGapPx;
  return {
    marginPx: MARGIN_PX,
    baselinePx,
    xMinPx: xMinFt * o.pxPerFt,
    widthPx: (xMaxFt - xMinFt) * o.pxPerFt + 2 * MARGIN_PX,
    heightPx: baselinePx - laneMin * o.laneGapPx + FOOTER_PX + o.laneGapPx * 0.35
  };
}

// ---- helpers ----

function styleSheet(): SVGStyleElement {
  const style = el("style");
  style.textContent = [
    ".route-unclear { opacity: 0.55; }",
    ".route-unclear .body { stroke-dasharray: 4 3; }",
    ".unit text { pointer-events: none; }"
  ].join("\n");
  return style;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function layer(name: string): SVGGElement {
  const g = el("g");
  g.setAttribute("class", name);
  return g;
}

function text(cls: string, x: number, y: number, content: string): SVGTextElement {
  const t = el("text");
  t.setAttribute("class", cls);
  t.setAttribute("x", num(x));
  t.setAttribute("y", num(y));
  t.textContent = content;
  return t;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function pt(p: DrawPoint, o: RenderOptions, frame: Frame): string {
  const s = toScreen(p, o, frame);
  return `${num(s.x)} ${num(s.y)}`;
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}
