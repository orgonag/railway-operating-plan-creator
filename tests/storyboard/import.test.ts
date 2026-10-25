import { describe, expect, it } from "vitest";
import {
  animatedUnits,
  blank,
  copy,
  moveSlide,
  nextSlide,
  parseDeck,
  type Deck,
} from "../../src/storyboard/model";

function plan(): Deck {
  const deck = blank();
  deck.tracks = [{ id: "track", a: { x: 0, y: 0 }, b: { x: 500, y: 0 } }];
  nextSlide(deck).units = [
    {
      id: "car",
      cut: "cut",
      kind: "loaded",
      x: 50,
      y: 0,
      angle: 0,
      flipped: false,
    },
  ];
  nextSlide(deck);
  moveSlide(
    deck,
    2,
    ["car"],
    [
      { x: 50, y: 0 },
      { x: 150, y: 0 },
    ],
  );
  return deck;
}

describe("untrusted storyboard imports", () => {
  it.each([null, [], 42, "plan"])(
    "rejects a non-document root: %j",
    (value) => {
      expect(() => parseDeck(JSON.stringify(value))).toThrow(
        "not a railway slide plan",
      );
    },
  );
  it.each([null, [], 1])(
    "rejects malformed track/slide entries without incidental TypeErrors: %j",
    (value) => {
      const deck = plan();
      expect(() =>
        parseDeck(JSON.stringify({ ...deck, tracks: [value] })),
      ).toThrow("not a railway slide plan");
      expect(() =>
        parseDeck(JSON.stringify({ ...deck, slides: [value] })),
      ).toThrow("Invalid slide data");
    },
  );
  it.each([
    null,
    false,
    [],
    "motion",
    {
      ids: [],
      path: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ])("rejects malformed motion: %j", (motion) => {
    const deck = plan();
    const slides = deck.slides.map((s, i) => (i === 2 ? { ...s, motion } : s));
    expect(() => parseDeck(JSON.stringify({ ...deck, slides }))).toThrow(
      "Invalid movement path",
    );
  });
  it.each([null, [], 1, "offset"])(
    "requires dictionaries for optional movement data: %j",
    (value) => {
      const deck = plan();
      for (const field of ["offsets", "approaches"]) {
        const slides = deck.slides.map((s, i) =>
          i === 2 ? { ...s, motion: { ...s.motion, [field]: value } } : s,
        );
        expect(() => parseDeck(JSON.stringify({ ...deck, slides }))).toThrow(
          /Invalid (movement offset|approach path)/,
        );
      }
    },
  );
  it("rejects ambiguous object identifiers without silently dropping authored objects", () => {
    const deck = plan();
    deck.tracks.push(copy(deck.tracks[0]!));
    expect(() => parseDeck(JSON.stringify(deck))).toThrow();
    deck.tracks.pop();
    deck.slides[2]!.id = deck.slides[1]!.id;
    expect(() => parseDeck(JSON.stringify(deck))).toThrow(
      "Step identifiers must be unique",
    );
    deck.slides[2]!.id = "movement";
    deck.slides[2]!.motion!.ids.push("car");
    expect(() => parseDeck(JSON.stringify(deck))).toThrow(
      "Invalid movement path",
    );
  });
  it("rejects collisions between shared and slide annotation identifiers", () => {
    const deck = plan();
    const annotation = {
      id: "label",
      kind: "text" as const,
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      text: "Keep this",
    };
    deck.labels = [annotation];
    deck.slides[2]!.annotations = [copy(annotation)];
    expect(() => parseDeck(JSON.stringify(deck))).toThrow("Invalid slide data");
  });
  it.each(["constructor", "__proto__", "toString"])(
    "treats %s as an ordinary equipment identifier",
    (uid) => {
      const deck = plan();
      for (const slide of deck.slides)
        for (const unit of slide.units) unit.id = uid;
      moveSlide(
        deck,
        2,
        [uid],
        [
          { x: 50, y: 0 },
          { x: 150, y: 0 },
        ],
      );
      const loaded = parseDeck(JSON.stringify(deck));
      expect(
        animatedUnits(loaded.slides[1]!.units, loaded.slides[2]!.motion!, 1)[0]!
          .x,
      ).toBe(150);
      // Older files may omit the optional per-unit dictionaries entirely.
      loaded.slides[2]!.motion!.approaches = {};
      loaded.slides[2]!.motion!.offsets = {};
      expect(
        animatedUnits(loaded.slides[1]!.units, loaded.slides[2]!.motion!, 1)[0]!
          .x,
      ).toBe(150);
    },
  );
  it("preserves reviewable snapshots when previous equipment was removed", () => {
    const deck = plan();
    deck.slides[1]!.units = [];
    deck.slides[2]!.needsReview = true;
    expect(parseDeck(JSON.stringify(deck))).toEqual(deck);
  });
});

it("does not coerce array kinds into valid annotation or unit kinds", () => {
  const deck = plan();
  const slides = deck.slides.map((s) => ({
    ...s,
    units: s.units.map((u) => ({ ...u, kind: [u.kind] })),
  }));
  expect(() => parseDeck(JSON.stringify({ ...deck, slides }))).toThrow(
    "Invalid slide data",
  );
  const labels = [
    {
      id: "text",
      kind: ["text"],
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      text: "label",
    },
  ];
  expect(() => parseDeck(JSON.stringify({ ...deck, labels }))).toThrow(
    "not a railway slide plan",
  );
});
