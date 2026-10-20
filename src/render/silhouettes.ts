/**
 * Silhouettes: side views of rolling stock, built with DOM methods only.
 *
 * Each silhouette is a <g> whose origin is the unit's centre on the rail line.
 * x runs along the unit (negative to the left), y is negative above the rail.
 * The unit is drawn at its length in px and a fixed height; the renderer
 * translates and rotates the group onto the track.
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
  switch (shape) {
    case "covered_hopper_large":
      g.appendChild(hopperBody(L, h, paint));
      break;
    case "tank_general":
      g.appendChild(tankFrame(L));
      g.appendChild(tankBody(L, h, paint));
      g.appendChild(tankDome(L, h, paint));
      break;
    case "boxcar_50":
      g.appendChild(box(L, h, paint));
      g.appendChild(door(L, h, paint));
      break;
    case "six_axle":
      g.appendChild(locoBody(L, h, paint));
      break;
    case "generic":
      g.appendChild(box(L, h, paint));
      break;
  }
  g.appendChild(wheels(L, shape === "six_axle" ? 6 : 4, paint.stroke));
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
