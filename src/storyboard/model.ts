export interface Point {
  x: number;
  y: number;
}
export interface Track {
  id: string;
  a: Point;
  b: Point;
}
export interface Unit extends Point {
  id: string;
  cut: string;
  kind: "loco" | "loaded" | "empty";
  angle: number;
  flipped: boolean;
}
export interface Annotation {
  id: string;
  kind: "text" | "arrow" | "end";
  a: Point;
  b: Point;
  text: string;
}
export interface Motion {
  ids: string[];
  path: Point[];
  approaches?: Record<string, Point[]>;
  offsets?: Record<string, number>;
}
export interface Slide {
  id: string;
  title: string;
  text: string;
  units: Unit[];
  annotations: Annotation[];
  motion?: Motion;
}
export interface Deck {
  format: "railway-slides-1";
  title: string;
  tracks: Track[];
  labels: Annotation[];
  slides: Slide[];
}
let sequence = 0;
export const id = (): string => `s${Date.now().toString(36)}-${++sequence}`;
export const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function blank(): Deck {
  return {
    format: "railway-slides-1",
    title: "Untitled operating plan",
    tracks: [],
    labels: [],
    slides: [
      { id: id(), title: "Track layout", text: "", units: [], annotations: [] },
    ],
  };
}
export function nextSlide(deck: Deck): Slide {
  const prev = deck.slides[deck.slides.length - 1]!;
  const slide: Slide = {
    id: id(),
    title:
      deck.slides.length === 1
        ? "Starting snapshot"
        : `Service step ${deck.slides.length - 1}`,
    text: "",
    units: copy(prev.units),
    annotations: [],
  };
  deck.slides.push(slide);
  return slide;
}
export function project(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function snap(
  p: Point,
  tracks: Track[],
): { point: Point; track: Track; angle: number } | undefined {
  let best: ReturnType<typeof snap>,
    min = Infinity;
  for (const track of tracks) {
    const point = project(p, track.a, track.b),
      d = distance(p, point);
    if (d < min) {
      min = d;
      best = {
        point,
        track,
        angle:
          (Math.atan2(track.b.y - track.a.y, track.b.x - track.a.x) * 180) /
          Math.PI,
      };
    }
  }
  return best;
}
const near = (a: Point, b: Point): boolean => distance(a, b) < 0.1;
/** Geometric routing only: endpoints touching a line form junctions. Crossing lines do not. */
export function route(
  tracks: Track[],
  start: Point,
  end: Point,
): Point[] | undefined {
  const from = snap(start, tracks),
    to = snap(end, tracks);
  if (!from || !to) return;
  const nodes: Point[] = [];
  const node = (p: Point): number => {
    const i = nodes.findIndex((n) => near(n, p));
    if (i >= 0) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  tracks.forEach((t) => {
    node(t.a);
    node(t.b);
  });
  const s = node(from.point),
    target = node(to.point);
  const edges = new Map<number, { to: number; d: number }[]>();
  for (const t of tracks) {
    const on = nodes
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => distance(p, project(p, t.a, t.b)) < 0.1)
      .sort((a, b) => distance(a.p, t.a) - distance(b.p, t.a));
    for (let i = 1; i < on.length; i++) {
      const a = on[i - 1]!,
        b = on[i]!,
        d = distance(a.p, b.p);
      edges.set(a.i, [...(edges.get(a.i) ?? []), { to: b.i, d }]);
      edges.set(b.i, [...(edges.get(b.i) ?? []), { to: a.i, d }]);
    }
  }
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    pending = new Set(nodes.map((_, i) => i));
  costs[s] = 0;
  while (pending.size) {
    let u = -1;
    for (const i of pending) if (u < 0 || costs[i]! < costs[u]!) u = i;
    if (u < 0 || !Number.isFinite(costs[u])) break;
    pending.delete(u);
    if (u === target) break;
    for (const e of edges.get(u) ?? []) {
      const cost = costs[u]! + e.d;
      if (cost < costs[e.to]!) {
        costs[e.to] = cost;
        previous[e.to] = u;
      }
    }
  }
  if (!Number.isFinite(costs[target])) return;
  const result: Point[] = [];
  for (let i = target; i >= 0; i = previous[i]!) {
    result.unshift(nodes[i]!);
    if (i === s) break;
  }
  return result.length > 1 ? result : [from.point, to.point];
}
export const pathLength = (path: Point[]): number =>
  path.slice(1).reduce((sum, p, i) => sum + distance(path[i]!, p), 0);
export function along(path: Point[], at: number): Point & { angle: number } {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!,
      b = path[i]!,
      len = distance(a, b);
    if (at <= len || i === path.length - 1) {
      const t = len ? at / len : 0;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    at -= len;
  }
  return { ...(path[0] ?? { x: 0, y: 0 }), angle: 0 };
}
export function reverses(path: Point[]): boolean {
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2]!,
      b = path[i - 1]!,
      c = path[i]!;
    const l = distance(a, b) * distance(b, c);
    if (
      l > 0 &&
      ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / l < -0.1
    )
      return true;
  }
  return false;
}
/** Every selected unit follows the same curve at its authored longitudinal offset. */
export function animatedUnits(
  before: Unit[],
  motion: Motion,
  progress: number,
): Unit[] {
  const anchor = before.find((u) => u.id === motion.ids[0]);
  if (!anchor || motion.path.length < 2) return copy(before);
  const first = along(motion.path, 0),
    r = (first.angle * Math.PI) / 180,
    len = pathLength(motion.path);
  return before.map((u) => {
    if (!motion.ids.includes(u.id)) return copy(u);
    const offset =
      motion.offsets?.[u.id] ??
      (u.x - anchor.x) * Math.cos(r) + (u.y - anchor.y) * Math.sin(r);
    const approach = motion.approaches?.[u.id];
    const travel = approach
      ? [...approach, ...motion.path.slice(1)]
      : motion.path;
    const p = along(travel, len * progress + (approach ? 0 : offset));
    const initialAngle = along(travel, approach ? 0 : offset).angle;
    const direction =
      Math.cos(((u.angle - initialAngle) * Math.PI) / 180) < 0 ? 180 : 0;
    return { ...u, ...p, angle: p.angle + direction };
  });
}
export function selectedInBox(units: Unit[], a: Point, b: Point): string[] {
  return units
    .filter(
      (u) =>
        u.x >= Math.min(a.x, b.x) &&
        u.x <= Math.max(a.x, b.x) &&
        u.y >= Math.min(a.y, b.y) &&
        u.y <= Math.max(a.y, b.y),
    )
    .map((u) => u.id);
}
export function moveSlide(
  deck: Deck,
  index: number,
  ids: string[],
  path: Point[],
): void {
  if (index < 2) throw new Error("Movements start at Step 3.");
  if (index !== deck.slides.length - 1)
    throw new Error("Remove later steps before changing this movement.");
  if (path.length < 2 || pathLength(path) < 1)
    throw new Error("Choose a different destination.");
  if (reverses(path))
    throw new Error(
      "End this step before reversing. Add the reverse movement on the next slide.",
    );
  const slide = deck.slides[index]!,
    before = deck.slides[index - 1]!.units;
  if (!ids.length || ids.some((id) => !before.some((u) => u.id === id)))
    throw new Error("Select equipment to move.");
  const motion: Motion = {
    ids: [...ids],
    path: copy(path),
    approaches: {},
    offsets: {},
  };
  const initial = along(path, 0),
    r = (initial.angle * Math.PI) / 180;
  for (const uid of ids) {
    const unit = before.find((u) => u.id === uid)!;
    const approach = route(deck.tracks, unit, path[0]!);
    if (!approach)
      throw new Error("Selected equipment must share a connected track route.");
    const last = approach[approach.length - 1]!,
      prev = approach[approach.length - 2]!;
    const behind =
      (last.x - prev.x) * Math.cos(r) + (last.y - prev.y) * Math.sin(r) > 0;
    if (behind && pathLength(approach) > 0.1)
      motion.approaches![uid] = approach;
    else motion.offsets![uid] = pathLength(approach);
  }

  slide.units = animatedUnits(before, motion, 1);
  slide.motion = motion;
}
export function parseDeck(text: string): Deck {
  const d = JSON.parse(text) as Deck;
  const point = (p: Point): boolean =>
    !!p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) < 100000 &&
    Math.abs(p.y) < 100000;
  const annotation = (a: Annotation): boolean =>
    !!a &&
    typeof a.id === "string" &&
    ["text", "arrow", "end"].includes(a.kind) &&
    point(a.a) &&
    point(a.b) &&
    typeof a.text === "string";
  if (
    !d ||
    d.format !== "railway-slides-1" ||
    typeof d.title !== "string" ||
    !Array.isArray(d.tracks) ||
    d.tracks.length > 2000 ||
    !d.tracks.every(
      (t) => typeof t.id === "string" && point(t.a) && point(t.b),
    ) ||
    !Array.isArray(d.labels) ||
    !d.labels.every(annotation) ||
    !Array.isArray(d.slides) ||
    !d.slides.length ||
    d.slides.length > 1000
  )
    throw new Error("This is not a railway slide plan.");
  for (const s of d.slides) {
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.title !== "string" ||
      typeof s.text !== "string" ||
      !Array.isArray(s.annotations) ||
      !s.annotations.every(annotation) ||
      !Array.isArray(s.units) ||
      s.units.length > 2000 ||
      !s.units.every(
        (u) =>
          point(u) &&
          typeof u.id === "string" &&
          typeof u.cut === "string" &&
          ["loco", "loaded", "empty"].includes(u.kind) &&
          Number.isFinite(u.angle) &&
          typeof u.flipped === "boolean",
      ) ||
      new Set(s.units.map((u) => u.id)).size !== s.units.length
    )
      throw new Error("Invalid slide data.");
    if (
      s.motion?.approaches &&
      !Object.values(s.motion.approaches).every(
        (p) => Array.isArray(p) && p.length >= 2 && p.every(point),
      )
    )
      throw new Error("Invalid approach path.");
    if (
      s.motion?.offsets &&
      !Object.values(s.motion.offsets).every(Number.isFinite)
    )
      throw new Error("Invalid movement offset.");
    if (
      s.motion &&
      (!Array.isArray(s.motion.ids) ||
        !s.motion.ids.every((i) => s.units.some((u) => u.id === i)) ||
        !Array.isArray(s.motion.path) ||
        s.motion.path.length < 2 ||
        !s.motion.path.every(point) ||
        reverses(s.motion.path))
    )
      throw new Error("Invalid movement path.");
  }
  return d;
}
