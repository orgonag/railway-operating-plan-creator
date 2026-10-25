import { expect, it } from "vitest";
import {
  blank,
  nextSlide,
  pauseSeconds,
  durationMs,
  frameAt,
  parseDeck,
  straightEnd,
} from "../../src/storyboard/model";
it("defaults older slides to a three second pause and inherits pause on next step", () => {
  const d = blank();
  expect(pauseSeconds(d.slides[0]!)).toBe(3);
  d.slides[0]!.pauseSeconds = 6;
  expect(nextSlide(d).pauseSeconds).toBe(6);
  expect(parseDeck(JSON.stringify(d)).slides[0]!.pauseSeconds).toBe(6);
});
it("holds after the fixed movement, then advances; setup has no movement", () => {
  const d = blank();
  d.slides[0]!.pauseSeconds = 1;
  nextSlide(d).pauseSeconds = 2;
  const s = nextSlide(d);
  s.pauseSeconds = 6;
  s.motion = {
    ids: [],
    path: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  };
  nextSlide(d);
  expect(durationMs(s, 2)).toBe(8200);
  expect(frameAt(d, 500)).toEqual({ index: 0, progress: 1 });
  expect(frameAt(d, 4100)).toEqual({ index: 2, progress: 0.5 });
  expect(frameAt(d, 10000)).toEqual({ index: 2, progress: 1 });
  expect(frameAt(d, 11200).index).toBe(3);
});
it("rejects invalid pauses while accepting zero", () => {
  const d = blank();
  d.slides[0]!.pauseSeconds = -1;
  expect(() => parseDeck(JSON.stringify(d))).toThrow(/Pause/);
  d.slides[0]!.pauseSeconds = 0;
  expect(() => parseDeck(JSON.stringify(d))).not.toThrow();
});
it("snaps straight without bending towards a nearby endpoint; Alt bypass stays free", () => {
  const start = { x: 100, y: 200 },
    target = { x: 503, y: 222 };
  expect(straightEnd(start, target, [])).toEqual({ x: 500, y: 200 });
  expect(straightEnd(start, { x: 120, y: 510 }, [])).toEqual({
    x: 100,
    y: 520,
  });
  expect(straightEnd(start, target, [], false)).toEqual(target);
  const tracks = [{ id: "t", a: { x: 500, y: 208 }, b: { x: 600, y: 208 } }];
  expect(straightEnd(start, target, tracks)).toEqual({ x: 500, y: 200 });
});
