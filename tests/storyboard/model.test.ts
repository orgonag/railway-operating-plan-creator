import { describe, expect, it } from "vitest";
import {
  blank,
  nextSlide,
  route,
  moveSlide,
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

it('a cut already spanning a turnout starts at its exact saved positions', () => {
 const d=blank();d.tracks=tracks;
 const rear:Unit={...cars[0]!,id:'rear',x:500,y:200};
 const lead:Unit={...cars[1]!,id:'lead',x:740,y:140};
 nextSlide(d).units=[rear,lead];nextSlide(d);
 moveSlide(d,2,['lead','rear'],route(tracks,lead,{x:900,y:140})!);
 const start=animatedUnits(d.slides[1]!.units,d.slides[2]!.motion!,0);
 expect(start.map(u=>({x:u.x,y:u.y}))).toEqual([{x:500,y:200},{x:740,y:140}]);
 const end=d.slides[2]!.units[0]!;expect(end.x).toBeCloseTo(648);expect(end.y).toBeCloseTo(164);
});
