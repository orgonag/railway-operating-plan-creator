export interface Point {
  x: number;
  y: number;
}
export interface Track {
  id: string;
  turnout?: string;
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
  translate?: boolean;
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
  pauseSeconds?: number;
  needsReview?: boolean;
}
export interface Deck {
  canvasWidth?: number;
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
    canvasWidth: 9600,
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
    pauseSeconds: pauseSeconds(prev),
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
/** Track geometry is a suggestion, never a constraint on authored equipment positions. */
export function movementRoute(
  tracks: Track[],
  start: Point,
  end: Point,
): Point[] {
  const suggested = route(tracks, start, end);
  if (!suggested)
    return [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ];
  const path: Point[] = [];
  for (const p of [start, ...suggested, end]) {
    if (path.length && near(path[path.length - 1]!, p)) continue;
    path.push({ x: p.x, y: p.y });
    // Endpoint projections can add a pointless out-and-back along a straight line.
    while (path.length >= 3) {
      const [a, b, c] = path.slice(-3) as [Point, Point, Point];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (
        Math.abs(cross) >
        0.001 * Math.max(1, distance(a, b) * distance(b, c))
      )
        break;
      path.splice(path.length - 2, 1);
    }
  }
  if (path.length < 2 || reverses(path))
    return [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ];
  return path;
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
    if (motion.translate) {
      const p = along(motion.path, len * progress);
      return {
        ...u,
        x: u.x + p.x - motion.path[0]!.x,
        y: u.y + p.y - motion.path[0]!.y,
      };
    }
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
    const turn =
      ((((p.angle + direction - u.angle + 180) % 360) + 360) % 360) - 180;
    return { ...u, ...p, angle: u.angle + turn };
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
    const approach = movementRoute(deck.tracks, unit, path[0]!);
    const last = approach[approach.length - 1]!,
      prev = approach[approach.length - 2]!;
    const behind =
      (last.x - prev.x) * Math.cos(r) + (last.y - prev.y) * Math.sin(r) > 0;
    if (behind && pathLength(approach) > 0.1)
      motion.approaches![uid] = approach;
    else motion.offsets![uid] = pathLength(approach);
  }

  // Curved cuts can follow tracks, but arbitrary/off-track arrangements must not
  // collapse onto a projected route. Translate the selection intact in that case.
  const initialUnits = animatedUnits(before, motion, 0);
  const destinationTrack = snap(path[path.length - 1]!, deck.tracks);
  const destinationOffTrack =
    !destinationTrack ||
    distance(destinationTrack.point, path[path.length - 1]!) > 0.1;
  if (
    destinationOffTrack ||
    initialUnits.some(
      (u, i) =>
        distance(u, before[i]!) > 0.1 ||
        Math.cos(((u.angle - before[i]!.angle) * Math.PI) / 180) < 0.99999,
    )
  ) {
    motion.translate = true;
    delete motion.approaches;
    delete motion.offsets;
  }
  slide.units = animatedUnits(before, motion, 1);
  slide.motion = motion;
  delete slide.needsReview;
  deck.slides.slice(index + 1).forEach((s) => (s.needsReview = true));
}
export function parseDeck(text: string): Deck {
  const d = JSON.parse(text) as Deck;
  const point = (p: Point): boolean =>
    !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
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
    !d.tracks.every(
      (t) =>
        typeof t.id === "string" &&
        (t.turnout === undefined || typeof t.turnout === "string") &&
        point(t.a) &&
        point(t.b),
    ) ||
    !Array.isArray(d.labels) ||
    !d.labels.every(annotation) ||
    !Array.isArray(d.slides) ||
    !d.slides.length
  )
    throw new Error("This is not a railway slide plan.");
  if (
    d.canvasWidth !== undefined &&
    ![1200, 2400, 4800, 9600].includes(d.canvasWidth)
  )
    throw new Error("Unsupported drawing size.");
  for (const s of d.slides) {
    if (s?.needsReview !== undefined && typeof s.needsReview !== "boolean")
      throw new Error("Invalid review status.");
    if (
      s.pauseSeconds !== undefined &&
      (!Number.isFinite(s.pauseSeconds) ||
        s.pauseSeconds < 0 ||
        s.pauseSeconds > 3600)
    )
      throw new Error("Pause must be between 0 and 3600 seconds.");
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.title !== "string" ||
      typeof s.text !== "string" ||
      !Array.isArray(s.annotations) ||
      !s.annotations.every(annotation) ||
      !Array.isArray(s.units) ||
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
      s.motion?.translate !== undefined &&
      typeof s.motion.translate !== "boolean"
    )
      throw new Error("Invalid movement mode.");
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

/** Fixed automatic animation duration; only the hold is author-controlled. */
export const MOVEMENT_MS = 2200;
export const DEFAULT_PAUSE = 3;
export function pauseSeconds(slide: Slide): number {
  return slide.pauseSeconds ?? DEFAULT_PAUSE;
}
export function movementMs(slide: Slide, index: number): number {
  return index > 1 && slide.motion ? MOVEMENT_MS : 0;
}
export function durationMs(slide: Slide, index: number): number {
  return movementMs(slide, index) + pauseSeconds(slide) * 1000;
}
export function totalMs(deck: Deck): number {
  return deck.slides.reduce((sum, s, i) => sum + durationMs(s, i), 0);
}
export function frameAt(
  deck: Deck,
  elapsed: number,
): { index: number; progress: number } {
  let index = 0;
  for (; index < deck.slides.length - 1; index++) {
    const duration = durationMs(deck.slides[index]!, index);
    if (elapsed < duration) break;
    elapsed -= duration;
  }
  const movement = movementMs(deck.slides[index]!, index);
  const t = movement ? Math.min(1, Math.max(0, elapsed / movement)) : 1;
  return { index, progress: t * t * (3 - 2 * t) };
}
/** Prefer exact endpoints, then rail connections, then grid; tolerance is supplied in world units. */
export function trackSnap(
  p: Point,
  tracks: Track[],
  tolerance = 12,
): { point: Point; connected: boolean } {
  const endpoints = tracks.flatMap((t) => [t.a, t.b]);
  const nearest = endpoints.sort((a, b) => distance(a, p) - distance(b, p))[0];
  if (nearest && distance(nearest, p) <= tolerance)
    return { point: copy(nearest), connected: true };
  const rail = snap(p, tracks);
  if (rail && distance(rail.point, p) <= tolerance)
    return { point: rail.point, connected: true };
  return {
    point: { x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 },
    connected: false,
  };
}
/** Orthogonal drawing; test raw pointer proximity before rounding to the grid. */
export function straightEnd(
  start: Point,
  target: Point,
  tracks: Track[],
  enabled = true,
  tolerance = 12,
): Point {
  if (!enabled) return { ...target };
  const horizontal =
    Math.abs(target.x - start.x) >= Math.abs(target.y - start.y);
  const raw = horizontal
    ? { x: target.x, y: start.y }
    : { x: start.x, y: target.y };
  const candidates = tracks
    .flatMap((t) => [t.a, t.b])
    .filter((p) =>
      horizontal
        ? Math.abs(p.y - start.y) < 0.1
        : Math.abs(p.x - start.x) < 0.1,
    );
  const endpoint = candidates.sort(
    (a, b) => distance(a, raw) - distance(b, raw),
  )[0];
  if (endpoint && distance(endpoint, raw) <= tolerance) return copy(endpoint);
  // Intersect the chosen axis with any rail; never bend the new line to meet it.
  let best: Point | undefined,
    nearest = tolerance;
  for (const t of tracks) {
    const span = horizontal ? t.b.y - t.a.y : t.b.x - t.a.x;
    if (Math.abs(span) < 0.001) continue;
    const f = (horizontal ? start.y - t.a.y : start.x - t.a.x) / span;
    if (f < 0 || f > 1) continue;
    const p = {
      x: t.a.x + f * (t.b.x - t.a.x),
      y: t.a.y + f * (t.b.y - t.a.y),
    };
    const d = distance(p, raw);
    if (d <= nearest) {
      nearest = d;
      best = p;
    }
  }
  return (
    best ??
    (horizontal
      ? { x: Math.round(target.x / 20) * 20, y: start.y }
      : { x: start.x, y: Math.round(target.y / 20) * 20 })
  );
}
/** Translate a selection rigidly; the closest moved endpoint chooses a single connection. */
export function translateTracks(
  selected: Track[],
  rest: Track[],
  delta: Point,
  enabled = true,
  tolerance = 12,
): { tracks: Track[]; connection?: Point } {
  let dx = delta.x,
    dy = delta.y,
    connection: Point | undefined;
  if (enabled) {
    let best = tolerance;
    // Endpoints have priority over projections onto rail interiors.
    for (const endpointOnly of [true, false]) {
      let found = false;
      for (const t of selected)
        for (const p of [t.a, t.b]) {
          const target = { x: p.x + delta.x, y: p.y + delta.y };
          const candidates = endpointOnly
            ? rest.flatMap((t) => [t.a, t.b])
            : rest.map((t) => project(target, t.a, t.b));
          for (const q of candidates) {
            const d = distance(target, q);
            if (d <= best) {
              best = d;
              dx = delta.x + q.x - target.x;
              dy = delta.y + q.y - target.y;
              connection = copy(q);
              found = true;
            }
          }
        }
      if (found) break;
    }
    if (!connection) {
      dx = Math.round(delta.x / 20) * 20;
      dy = Math.round(delta.y / 20) * 20;
    }
  }
  return {
    tracks: selected.map((t) => ({
      ...t,
      a: { x: t.a.x + dx, y: t.a.y + dy },
      b: { x: t.b.x + dx, y: t.b.y + dy },
    })),
    connection,
  };
}

/** A turnout is one selectable object made of two connected segments. */
export function turnoutTracks(
  anchor: Point,
  orientation: number,
  group = id(),
): Track[] {
  const sx = orientation < 2 ? 1 : -1,
    sy = orientation % 2 === 0 ? -1 : 1;
  const bend = { x: anchor.x + sx * 80, y: anchor.y + sy * 60 };
  return [
    { id: id(), turnout: group, a: copy(anchor), b: bend },
    {
      id: id(),
      turnout: group,
      a: copy(bend),
      b: { x: bend.x + sx * 120, y: bend.y },
    },
  ];
}
/** Reject stacked rails and interior crossings, but allow endpoint junctions. */
export function pageSize(deck: Pick<Deck, "canvasWidth">): {
  width: number;
  height: number;
} {
  const width = deck.canvasWidth ?? 1200;
  return { width, height: (width * 700) / 1200 };
}
/** One content frame for every slide/export; the editor itself has no page edges. */
export function drawingBounds(deck: Deck): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const ps: Point[] = deck.tracks.flatMap((t) => [t.a, t.b]);
  for (const a of [
    ...deck.labels,
    ...deck.slides.flatMap((s) => s.annotations),
  ]) {
    ps.push(a.a, a.b);
    if (a.kind === "text") ps.push({ x: a.a.x + a.text.length * 12, y: a.a.y });
  }
  deck.slides.forEach((s, i) => {
    ps.push(...s.units);
    if (s.motion && i > 1) {
      ps.push(...s.motion.path);
      for (let n = 0; n <= 60; n++)
        ps.push(...animatedUnits(deck.slides[i - 1]!.units, s.motion, n / 60));
    }
  });
  if (!ps.length) return { x: 0, y: 0, width: 1200, height: 700 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of ps) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const width = Math.max(
    1200,
    maxX - minX + 160,
    ((maxY - minY + 160) * 1200) / 700,
  );
  const height = (width * 700) / 1200;
  return {
    x: (minX + maxX - width) / 2,
    y: (minY + maxY - height) / 2,
    width,
    height,
  };
}
export function drawingViewBox(deck: Deck): string {
  const b = drawingBounds(deck);
  return `${b.x} ${b.y} ${b.width} ${b.height}`;
}
export function validateTracks(
  added: Track[],
  existing: Track[],
  page?: { width: number; height: number },
): void {
  const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
  for (let i = 0; i < added.length; i++) {
    const a = added[i]!;
    if (distance(a.a, a.b) < 2)
      throw new Error("Track is too short. Choose an end farther away.");
    if (
      page &&
      [a.a, a.b].some(
        (p) => p.x < 0 || p.x > page.width || p.y < 0 || p.y > page.height,
      )
    )
      throw new Error(
        "Outside the drawing page. Choose a larger Drawing size, or zoom out to see the edges.",
      );
    for (const b of [...existing, ...added.slice(0, i)]) {
      const r = sub(a.b, a.a),
        s = sub(b.b, b.a),
        q = sub(b.a, a.a),
        den = cross(r, s);
      if (Math.abs(den) < 0.001) {
        if (Math.abs(cross(q, r)) > 0.01) continue;
        const len = r.x * r.x + r.y * r.y;
        const t = (q.x * r.x + q.y * r.y) / len,
          v = sub(b.b, a.a),
          u = (v.x * r.x + v.y * r.y) / len;
        if (
          (Math.min(1, Math.max(t, u)) - Math.max(0, Math.min(t, u))) *
            Math.sqrt(len) >
          0.5
        )
          throw new Error(
            "That overlaps an existing track. Connect at an end or choose a clear spot.",
          );
      } else {
        const t = cross(q, s) / den,
          u = cross(q, r) / den;
        if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999)
          throw new Error(
            "That crosses another track. Shorten the line or choose another turnout direction.",
          );
      }
    }
  }
}
