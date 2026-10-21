/**
 * Silhouettes: side views of rolling stock, built with DOM methods only.
 *
 * Each silhouette is a <g> whose origin is the unit's centre on the rail line.
 * x runs along the unit (negative to the left), y is negative above the rail.
 * The unit is drawn at its length in px and a fixed height; the renderer
 * translates and rotates the group onto the track.
 *
 * The unit's length is its planning length, measured over the couplers. The
 * body is inset from each end and a knuckle coupler fills the gap, so two
 * coupled units meet knuckle to knuckle with daylight between their bodies.
 *
 * Shapes are recognisable but simple. An unknown type falls back to the
 * generic box. All markup here is application-owned; no user text enters.
 */

import { theme } from "./theme";

export const SVG_NS = "http://www.w3.org/2000/svg";

/** About 0.3 of the default 90 px lane gap. */
export const SILHOUETTE_HEIGHT_PX = 27;

/** Clearance between the rail line and the underside of the body. */
const FLOOR_PX = 5;
const WHEEL_R_PX = 2.4;

/** Coupler centre line: just above the wheel tops, in the lower part of the body band. */
const COUPLER_Y_PX = -(FLOOR_PX + 2);
const COUPLER_HEAD_H_PX = 4;

/** Planning lengths the coupler allowance is scaled from: 2.5 ft at each end. */
const COUPLER_FT = 2.5;
const CAR_FT = 60;
const LOCO_FT = 80;

/**
 * Room left at each end of a unit for its coupler, in px. At least 3 px so the
 * coupler is visible at any scale, 2.5 ft of the unit's planning length when
 * that is more, and never more than 15% of the length per end so the body
 * keeps at least 70% of it.
 */
export function couplerInsetPx(lengthPx: number, kind: "loco" | "car"): number {
  const ft = kind === "loco" ? LOCO_FT : CAR_FT;
  return Math.min(Math.max(3, (lengthPx * COUPLER_FT) / ft), lengthPx * 0.15);
}

export type Shape = "generic" | "covered_hopper_large" | "tank_general" | "boxcar_50" | "six_axle";

const SHAPES: ReadonlySet<string> = new Set<Shape>(["generic", "covered_hopper_large", "tank_general", "boxcar_50", "six_axle"]);

export function shapeFor(type: string, kind: "loco" | "car"): Shape {
  if (!SHAPES.has(type)) return "generic";
  const shape = type as Shape;
  // A loco shape on a car (or the reverse) would mislead; fall back to the box.
  if ((shape === "six_axle") !== (kind === "loco")) return "generic";
  return shape;
}

export function silhouette(type: string, kind: "loco" | "car", lengthPx: number, loaded: boolean): SVGGElement {
  const shape = shapeFor(type, kind);
  const g = el("g");
  g.setAttribute("class", `silhouette ${shape}`);
  g.setAttribute("data-shape", shape);
  g.setAttribute("data-length-px", String(lengthPx));
  const paint = kind === "loco" ? { fill: theme.loco, stroke: theme.loco } : loaded ? { fill: theme.loaded, stroke: theme.loaded } : { fill: "none", stroke: theme.empty };
  const L = lengthPx;
  const h = SILHOUETTE_HEIGHT_PX;
  // The body is drawn centred at its own length, so each body shape is unaware
  // of the couplers: it just gets a shorter length than the unit.
  const inset = couplerInsetPx(L, kind);
  const B = L - 2 * inset;
  g.setAttribute("data-coupler-inset-px", num(inset));
  switch (shape) {
    case "covered_hopper_large":
      g.appendChild(hopperBody(B, h, paint));
      break;
    case "tank_general":
      g.appendChild(tankFrame(B));
      g.appendChild(tankBody(B, h, paint));
      g.appendChild(tankDome(B, h, paint));
      break;
    case "boxcar_50":
      g.appendChild(box(B, h, paint));
      g.appendChild(door(B, h, paint));
      break;
    case "six_axle":
      g.appendChild(locoBody(B, h, paint));
      break;
    case "generic":
      g.appendChild(box(B, h, paint));
      break;
  }
  g.appendChild(coupler(L, inset, -1));
  g.appendChild(coupler(L, inset, 1));
  g.appendChild(wheels(L, shape === "six_axle" ? 6 : 4, paint.stroke));
  return g;
}

/**
 * A knuckle coupler at one end (side -1 left, 1 right): a draft bar from the
 * body end outward, finishing in a small knuckle head whose outer face is
 * exactly at the unit's end. Drawn in steel so it reads as hardware.
 */
function coupler(L: number, inset: number, side: -1 | 1): SVGGElement {
  const g = el("g");
  g.setAttribute("class", "coupler");
  g.setAttribute("data-side", side < 0 ? "left" : "right");
  const end = (side * L) / 2;
  const bodyEnd = side * (L / 2 - inset);
  const headW = Math.min(3, inset * 0.5);
  const headInner = end - side * headW;

  const bar = el("line");
  bar.setAttribute("class", "draft-bar");
  bar.setAttribute("x1", num(bodyEnd));
  bar.setAttribute("x2", num(headInner));
  bar.setAttribute("y1", num(COUPLER_Y_PX));
  bar.setAttribute("y2", num(COUPLER_Y_PX));
  bar.setAttribute("stroke", theme.steel);
  bar.setAttribute("stroke-width", "1.5");
  g.appendChild(bar);

  const head = el("rect");
  head.setAttribute("class", "knuckle");
  head.setAttribute("x", num(Math.min(end, headInner)));
  head.setAttribute("y", num(COUPLER_Y_PX - COUPLER_HEAD_H_PX / 2));
  head.setAttribute("width", num(headW));
  head.setAttribute("height", num(COUPLER_HEAD_H_PX));
  head.setAttribute("rx", "0.8");
  head.setAttribute("fill", theme.steel);
  head.setAttribute("stroke", "none");
  g.appendChild(head);
  return g;
}

interface Paint {
  fill: string;
  stroke: string;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function painted<T extends SVGElement>(node: T, cls: string, paint: Paint): T {
  node.setAttribute("class", cls);
  node.setAttribute("fill", paint.fill);
  node.setAttribute("stroke", paint.stroke);
  node.setAttribute("stroke-width", "1.5");
  node.setAttribute("stroke-linejoin", "round");
  return node;
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** A plain box: the generic car and the boxcar shell. */
function box(L: number, h: number, paint: Paint): SVGRectElement {
  const r = painted(el("rect"), "body", paint);
  r.setAttribute("x", num(-L / 2));
  r.setAttribute("y", num(-h));
  r.setAttribute("width", num(L));
  r.setAttribute("height", num(h - FLOOR_PX));
  return r;
}

/** The sliding door of a boxcar: two uprights just left of centre. */
function door(L: number, h: number, paint: Paint): SVGPathElement {
  const p = el("path");
  const w = Math.max(6, L * 0.14);
  const x0 = -w / 2;
  const top = -h + 2;
  const bottom = -FLOOR_PX - 1;
  p.setAttribute("class", "door");
  p.setAttribute("d", `M ${num(x0)} ${num(top)} V ${num(bottom)} M ${num(x0 + w)} ${num(top)} V ${num(bottom)}`);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", paint.fill === "none" ? paint.stroke : theme.ink);
  p.setAttribute("stroke-width", "1.2");
  return p;
}

/** A covered hopper: flat top, two sloped bays below. */
function hopperBody(L: number, h: number, paint: Paint): SVGPathElement {
  const p = painted(el("path"), "body", paint);
  const top = -h;
  const mid = -h * 0.55;
  const floor = -FLOOR_PX;
  const s = L * 0.1;
  const d = [
    `M ${num(-L / 2)} ${num(top)}`,
    `H ${num(L / 2)}`,
    `V ${num(mid)}`,
    `L ${num(L / 2 - s)} ${num(floor)}`,
    `H ${num(s)}`,
    `L 0 ${num(mid)}`,
    `L ${num(-s)} ${num(floor)}`,
    `H ${num(-L / 2 + s)}`,
    `L ${num(-L / 2)} ${num(mid)}`,
    "Z"
  ].join(" ");
  p.setAttribute("d", d);
  return p;
}

/** A tank car: a rounded cylinder on a thin frame, with a dome on top. */
function tankBody(L: number, h: number, paint: Paint): SVGRectElement {
  const r = painted(el("rect"), "body", paint);
  const barrel = h - FLOOR_PX - 3;
  r.setAttribute("x", num(-L / 2 + 2));
  r.setAttribute("y", num(-h + 1));
  r.setAttribute("width", num(L - 4));
  r.setAttribute("height", num(barrel));
  r.setAttribute("rx", num(barrel / 2));
  r.setAttribute("ry", num(barrel / 2));
  return r;
}

function tankDome(L: number, h: number, paint: Paint): SVGRectElement {
  const r = painted(el("rect"), "dome", paint);
  const w = Math.max(6, L * 0.1);
  r.setAttribute("x", num(-w / 2));
  r.setAttribute("y", num(-h - 3));
  r.setAttribute("width", num(w));
  r.setAttribute("height", "5");
  r.setAttribute("rx", "1.5");
  return r;
}

function tankFrame(L: number): SVGLineElement {
  const line = el("line");
  line.setAttribute("class", "frame");
  line.setAttribute("x1", num(-L / 2));
  line.setAttribute("x2", num(L / 2));
  line.setAttribute("y1", num(-FLOOR_PX - 1));
  line.setAttribute("y2", num(-FLOOR_PX - 1));
  line.setAttribute("stroke", theme.steel);
  line.setAttribute("stroke-width", "2");
  return line;
}

/** A road switcher: a long hood with a taller cab near one end. */
function locoBody(L: number, h: number, paint: Paint): SVGPathElement {
  const p = painted(el("path"), "body", paint);
  const floor = -FLOOR_PX;
  const hood = -h * 0.72;
  const nose = -h * 0.6;
  const cab = -h;
  const cabFrom = -L / 2 + L * 0.14;
  const cabTo = -L / 2 + L * 0.3;
  const d = [
    `M ${num(-L / 2)} ${num(floor)}`,
    `V ${num(nose)}`,
    `H ${num(cabFrom)}`,
    `V ${num(cab)}`,
    `H ${num(cabTo)}`,
    `V ${num(hood)}`,
    `H ${num(L / 2 - 3)}`,
    `L ${num(L / 2)} ${num(hood + 4)}`,
    `V ${num(floor)}`,
    "Z"
  ].join(" ");
  p.setAttribute("d", d);
  return p;
}

/** Wheel sets under the body, in pairs (two-axle trucks) at each end. */
function wheels(L: number, count: number, colour: string): SVGGElement {
  const g = el("g");
  g.setAttribute("class", "wheels");
  const inset = Math.min(L * 0.18, 18);
  const gap = Math.min(7, L * 0.08);
  const perTruck = count / 2;
  const trucks = [-L / 2 + inset, L / 2 - inset];
  for (const cx of trucks) {
    const start = cx - ((perTruck - 1) * gap) / 2;
    for (let i = 0; i < perTruck; i += 1) {
      const c = el("circle");
      c.setAttribute("class", "wheel");
      c.setAttribute("cx", num(start + i * gap));
      c.setAttribute("cy", num(-WHEEL_R_PX));
      c.setAttribute("r", num(WHEEL_R_PX));
      c.setAttribute("fill", theme.ink);
      c.setAttribute("stroke", colour);
      c.setAttribute("stroke-width", "1");
      g.appendChild(c);
    }
  }
  return g;
}
