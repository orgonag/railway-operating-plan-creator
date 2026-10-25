import {
  turnoutTracks,
  validateTracks,
  pageSize,
  drawingBounds,
} from "../../src/storyboard/model";
import { describe, expect, it } from "vitest";
import {
  blank,
  nextSlide,
  route,
  moveSlide,
  movementRoute,
  animatedUnits,
  selectedInBox,
  parseDeck,
  reverses,
  type Track,
  type Unit,
} from "../../src/storyboard/model";
const tracks: Track[] = [
  { id: "main", a: { x: 0, y: 200 }, b: { x: 1000, y: 200 } },
  { id: "branch", a: { x: 600, y: 200 }, b: { x: 680, y: 140 } },
  { id: "spur", a: { x: 680, y: 140 }, b: { x: 1000, y: 140 } },
];
const cars: Unit[] = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i}`,
  cut: "cut",
  kind: "loaded",
  x: 50 + i * 46,
  y: 200,
  angle: 0,
  flipped: false,
}));
describe("slide authoring contract", () => {
  it("starts blank with track setup and copies snapshots independently", () => {
    const d = blank();
    expect(d.tracks).toEqual([]);
    d.tracks = tracks;
    nextSlide(d).units = cars;
    const s = nextSlide(d);
    s.units[0]!.x = 100;
    expect(d.slides[1]!.units[0]!.x).toBe(50);
    expect(s.annotations).toEqual([]);
  });
  it("box selects five individual cars from a cut of ten", () =>
    expect(selectedInBox(cars, { x: 40, y: 180 }, { x: 240, y: 220 })).toEqual([
      "c0",
      "c1",
      "c2",
      "c3",
      "c4",
    ]));
  it("routes through a turnout whose endpoint touches the middle of a track", () => {
    const path = route(tracks, { x: 50, y: 200 }, { x: 900, y: 140 })!;
    expect(path).toContainEqual({ x: 600, y: 200 });
    expect(path).toContainEqual({ x: 680, y: 140 });
    expect(reverses(path)).toBe(false);
  });
  it("does not connect separate tracks or crossings without junction endpoints", () => {
    expect(
      route(
        [
          ...tracks,
          { id: "other", a: { x: 0, y: 500 }, b: { x: 1000, y: 500 } },
        ],
        cars[0]!,
        { x: 400, y: 500 },
      ),
    ).toBeUndefined();
  });
  it("moves only five selected cars, keeps the other five and earlier snapshots intact", () => {
    const d = blank();
    d.tracks = tracks;
    nextSlide(d).units = structuredClone(cars);
    nextSlide(d);
    const ids = cars.slice(0, 5).map((u) => u.id);
    moveSlide(d, 2, ids, route(tracks, cars[0]!, { x: 500, y: 200 })!);
    expect(d.slides[2]!.units[0]!.x).toBe(500);
    expect(d.slides[2]!.units.slice(5)).toEqual(cars.slice(5));
    expect(d.slides[1]!.units).toEqual(cars);
    expect(d.slides[2]!.units[1]!.x - d.slides[2]!.units[0]!.x).toBe(46);
  });
  it("animates locomotive and cars together without changing their types", () => {
    const units = [{ ...cars[0]!, kind: "loco" as const }, cars[1]!];
    const motion = {
      ids: units.map((u) => u.id),
      path: [
        { x: 50, y: 200 },
        { x: 500, y: 200 },
      ],
    };
    const middle = animatedUnits(units, motion, 0.5);
    expect(middle[0]!.x).toBe(275);
    expect(middle[1]!.x).toBe(321);
    expect(middle[0]!.kind).toBe("loco");
  });
  it("rejects a reversal inside a slide and preserves later starts", () => {
    const d = blank();
    nextSlide(d).units = structuredClone(cars);
    nextSlide(d);
    expect(() =>
      moveSlide(
        d,
        2,
        ["c0"],
        [
          { x: 50, y: 200 },
          { x: 400, y: 200 },
          { x: 200, y: 200 },
        ],
      ),
    ).toThrow(/reversing/);
    nextSlide(d);
    expect(() =>
      moveSlide(
        d,
        2,
        ["c0"],
        [
          { x: 50, y: 200 },
          { x: 400, y: 200 },
        ],
      ),
    ).toThrow(/later/);
  });
  it("round trips a deck and rejects nonfinite coordinates and invalid files", () => {
    const d = blank();
    d.tracks = tracks;
    expect(parseDeck(JSON.stringify(d))).toEqual(d);
    expect(() => parseDeck('{"format":"railway-slides-1"}')).toThrow();
    expect(() =>
      parseDeck(
        JSON.stringify({
          ...d,
          tracks: [{ id: "bad", a: { x: null, y: 0 }, b: { x: 2, y: 2 } }],
        }),
      ),
    ).toThrow();
  });
});

it("a cut already spanning a turnout starts at its exact saved positions", () => {
  const d = blank();
  d.tracks = tracks;
  const rear: Unit = { ...cars[0]!, id: "rear", x: 500, y: 200 };
  const lead: Unit = { ...cars[1]!, id: "lead", x: 740, y: 140 };
  nextSlide(d).units = [rear, lead];
  nextSlide(d);
  moveSlide(d, 2, ["lead", "rear"], route(tracks, lead, { x: 900, y: 140 })!);
  const start = animatedUnits(d.slides[1]!.units, d.slides[2]!.motion!, 0);
  expect(start.map((u) => ({ x: u.x, y: u.y }))).toEqual([
    { x: 500, y: 200 },
    { x: 740, y: 140 },
  ]);
  const end = d.slides[2]!.units[0]!;
  expect(end.x).toBeCloseTo(648);
  expect(end.y).toBeCloseTo(164);
});

describe("track authoring guards", () => {
  it("rejects overlapping and crossing pieces but permits end connections", () => {
    const base = { id: "main", a: { x: 100, y: 300 }, b: { x: 1000, y: 300 } };
    expect(() =>
      validateTracks(
        [{ id: "overlap", a: { x: 200, y: 300 }, b: { x: 400, y: 300 } }],
        [base],
      ),
    ).toThrow(/overlaps/);
    expect(() =>
      validateTracks(
        [{ id: "cross", a: { x: 400, y: 200 }, b: { x: 400, y: 400 } }],
        [base],
      ),
    ).toThrow(/crosses/);
    expect(() =>
      validateTracks(
        [{ id: "join", a: { x: 400, y: 300 }, b: { x: 400, y: 400 } }],
        [base],
      ),
    ).not.toThrow();
    expect(() =>
      validateTracks(turnoutTracks({ x: 400, y: 300 }, 0), [base]),
    ).not.toThrow();
  });
  it("groups all four turnout orientations and rejects duplicate turnouts", () => {
    for (let i = 0; i < 4; i++) {
      const pieces = turnoutTracks({ x: 600, y: 350 }, i);
      expect(pieces[0]!.turnout).toBe(pieces[1]!.turnout);
      expect(pieces[0]!.b).toEqual(pieces[1]!.a);
      expect(Math.sign(pieces[1]!.b.x - 600)).toBe(i < 2 ? 1 : -1);
      expect(Math.sign(pieces[1]!.b.y - 350)).toBe(i % 2 === 0 ? -1 : 1);
      expect(() =>
        validateTracks(turnoutTracks({ x: 600, y: 350 }, i), pieces),
      ).toThrow(/overlaps/);
    }
  });
});

it("larger yard dimensions survive saving and permit tracks beyond the old page", () => {
  const deck = blank();
  deck.canvasWidth = 4800;
  const track = { id: "far", a: { x: 3500, y: 1500 }, b: { x: 4600, y: 1500 } };
  expect(() => validateTracks([track], [], pageSize(deck))).not.toThrow();
  expect(() =>
    validateTracks([track], [], { width: 1200, height: 700 }),
  ).toThrow(/drawing page/);
  expect(pageSize(parseDeck(JSON.stringify(deck)))).toEqual({
    width: 4800,
    height: 2800,
  });
  expect(pageSize(blank())).toEqual({ width: 9600, height: 5600 });
  const old = blank();
  delete old.canvasWidth;
  expect(pageSize(parseDeck(JSON.stringify(old)))).toEqual({
    width: 1200,
    height: 700,
  });
  expect(pageSize(parseDeck(JSON.stringify(blank())))).toEqual({
    width: 9600,
    height: 5600,
  });
  deck.canvasWidth = 90000;
  expect(() => parseDeck(JSON.stringify(deck))).toThrow(/drawing size/);
});

describe("movement beyond drawn track", () => {
  it("preserves an overhanging cut when dragging its off-track car on later slides", () => {
    const d = blank();
    d.tracks = [{ id: "short", a: { x: 100, y: 200 }, b: { x: 500, y: 200 } }];
    nextSlide(d).units = [
      { ...cars[0]!, id: "loco", kind: "loco", x: 400 },
      { ...cars[1]!, id: "car", x: 446 },
    ];
    nextSlide(d);
    moveSlide(
      d,
      2,
      ["loco", "car"],
      movementRoute(d.tracks, d.slides[1]!.units[0]!, { x: 500, y: 200 }),
    );
    expect(d.slides[2]!.units.map((u) => u.x)).toEqual([500, 546]);
    for (const destination of [700, 300]) {
      const s = nextSlide(d),
        i = d.slides.length - 1,
        prior = d.slides[i - 1]!.units;
      moveSlide(
        d,
        i,
        ["car", "loco"],
        movementRoute(d.tracks, prior[1]!, { x: destination, y: 200 }),
      );
      expect(animatedUnits(prior, s.motion!, 0)).toEqual(prior);
      for (const t of [0.001, 0.25, 0.5, 0.75, 1]) {
        const frame = animatedUnits(prior, s.motion!, t);
        expect(frame[1]!.x - frame[0]!.x).toBeCloseTo(46, 8);
        expect(frame[1]!.x).toBeCloseTo(
          prior[1]!.x + (destination - prior[1]!.x) * t,
          8,
        );
      }
      expect(s.units.map((u) => u.x)).toEqual([destination - 46, destination]);
    }
    expect(parseDeck(JSON.stringify(d))).toEqual(d);
  });
  it("moves arbitrary off-track selections intact instead of projecting them onto rails", () => {
    const d = blank();
    d.tracks = tracks;
    const units = [
      { ...cars[0]!, x: 1100, y: 250, angle: 30 },
      { ...cars[1]!, x: 1150, y: 280, angle: 30 },
      { ...cars[2]!, id: "stationary" },
    ];
    nextSlide(d).units = structuredClone(units);
    const s = nextSlide(d);
    moveSlide(
      d,
      2,
      ["c0", "c1"],
      movementRoute(d.tracks, units[0]!, { x: 1400, y: 400 }),
    );
    expect(s.motion!.translate).toBe(true);
    expect(animatedUnits(units, s.motion!, 0)).toEqual(units);
    expect(s.units[0]).toMatchObject({ x: 1400, y: 400, angle: 30 });
    expect(s.units[1]).toMatchObject({ x: 1450, y: 430, angle: 30 });
    expect(s.units[2]).toEqual(units[2]);
    expect(parseDeck(JSON.stringify(d))).toEqual(d);
  });
  it("offers a direct movement when tracks are disconnected and preserves exact endpoints", () => {
    const separate = [
      { id: "a", a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { id: "b", a: { x: 0, y: 500 }, b: { x: 100, y: 500 } },
    ];
    expect(movementRoute(separate, { x: 50, y: 0 }, { x: 50, y: 500 })).toEqual(
      [
        { x: 50, y: 0 },
        { x: 50, y: 500 },
      ],
    );
    expect(movementRoute([], { x: 800, y: 100 }, { x: 900, y: 200 })).toEqual([
      { x: 800, y: 100 },
      { x: 900, y: 200 },
    ]);
  });
});

it("unbounded drawings preserve negative coordinates and frame all slides", () => {
  const d = blank();
  d.tracks = [
    {
      id: "negative",
      a: { x: -200000, y: -150000 },
      b: { x: -100000, y: -150000 },
    },
  ];
  expect(() => validateTracks(d.tracks, [])).not.toThrow();
  nextSlide(d).units = [{ ...cars[0]!, x: 30000, y: 20000 }];
  const b = drawingBounds(d);
  expect(b.x).toBeLessThan(-20000);
  expect(b.y).toBeLessThan(-15000);
  expect(b.x + b.width).toBeGreaterThan(30000);
  expect(b.y + b.height).toBeGreaterThan(20000);
  expect(parseDeck(JSON.stringify(d)).tracks).toEqual(d.tracks);
});
