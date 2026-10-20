# P1 Engine and Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a PlanReading into a correct, replayable sequence of world states and play it as a to-scale, side-view SVG animation in a private preview build, using the portfolio demo as the reference plan.

**Architecture:** A plain TypeScript core (`src/core`: schema, normalize, graph, engine, notes, layout) with no DOM dependency, a framework-free SVG renderer and player (`src/render`, `src/player`), and a small Vite preview page (`app/`). The engine works in feet on a 1D track graph; layout maps feet and lanes to drawing coordinates; render applies one pixel scale.

**Tech Stack:** TypeScript 5.6 (strict), Vite 5.4, Vitest 2.1, Ajv 8.17 (JSON Schema 2020-12), Node 22. No UI framework in P1.

**Spec:** `docs/spec.md` (sections 5.2, 5.3, 6, 6.6, 10, 12.2 P1, 13). Read it alongside this plan.

## Global Constraints

- Core code (`src/core/**`) imports nothing from the DOM or any UI library. `src/render` and `src/player` use the DOM but no framework.
- PlanReading is the only public format. The canvas model is an internal type, in feet, rebuilt on every change.
- One simulation: notes, layout positions and metrics all read the engine's output; nothing re-implements plan state.
- Every car is 60 ft and every loco 80 ft unless a car or group sets `lengthFt`/`carLengthFt`. The 10% slack (`carLength.allowancePct`, minimum 10) is used only inside fit notes; it is never added to drawing positions or spots.
- Turnouts are 240 ft from points to where the branch runs parallel. The fouling zone is 290 ft from the points toward the frog, on both the through and diverging track.
- The engine never throws on a schema-valid plan. Problems become notes or step statuses.
- User-facing text (notes, captions, labels): plain words, no em dashes or en dashes.
- No proprietary railway data in the repo. `private-fixtures/` stays git-ignored.

## Conventions this plan fixes (the spec leaves them open)

These are decisions the owner should confirm when reviewing Task 1's expected-state table.

- **Distances on a track** are measured from the track's start: the west/arrival edge for the main, the switch points for a branch.
- **Usable length** of a branch (`lengthFt`) starts where the turnout ends, so a branch's total length is 240 + `lengthFt`. A buffer stop sits at that total.
- **Approach:** the first switch on the main sits at (arriving train length + 200 ft) from the arrival edge. The main runs on past its last switch by (240 ft + arriving train length).
- **Default arrival stop:** the head of the train stops 100 ft short of the first switch's points.
- **Spots** are numbered from the switch end of the facility (spot 1 nearest the switch). A facility with no `startFt` sits at the far end of its track. Spots are 60 ft apart from the facility start.
- **`spot` on a step** places the **leading** unit of the move at that spot, its front at the spot's far edge.
- **Group order** in lists runs from the head end of the arriving train.

## Review Focus

1. **A train entering from the right.** Mirroring must keep the same operating meaning: a switch on the train's left goes down the page, facing stays facing. Test in Task 7.
2. **A step that refers to a deleted track, car or group.** The engine must not crash; that step and later steps that depend on it get status `needs_attention`. Test in Task 5.
3. **A stop past the end of a track or behind its start.** Clamp to the track, play the move, raise a buffer note. Test in Task 5 and Task 6.
4. **A group with `cars: 5` and a `list` of 4.** The list wins, and a problem is reported. Test in Task 3.
5. **Two locos, one running light while the other stays coupled.** Steps must move only the named loco. Test in Task 5.

---

### Task 1: Demo expected-state table and example corrections

**Files:**
- Create: `docs/reference/demo-expected-states.md`
- Create: `tests/fixtures/demo-expected.json`
- Modify: `docs/schema/examples/customer-service-demo.reading.json`

**Interfaces:**
- Produces: `tests/fixtures/demo-expected.json`, an array of 9 entries (arrival, 7 work steps, departure), each `{ step: number, caption: string, units: Record<Id, { track: Id, rearFt: number, headFt: number } | { offstage: "left" | "right" }>, coupled: Id[][], empty: Id[], notes: string[] }`. Used by Task 5 and Task 6.

- [ ] **Step 1: Correct the demo example to the conventions above**

In `customer-service-demo.reading.json`: car list spots become C1 = 5, C2 = 4, C3 = 3, C4 = 2, C5 = 1 (C1 is the head car and leads the shove); the shove step gets `"spot": 5`; the return `run_light` gets `"stop": { "track": "SPUR1", "ft": 680, "end": "lead" }`; the pull gets `"stop": { "beyond": "S1", "ft": 50, "end": "rear" }`; the first `run_light` keeps `"stop": { "offstage": "left" }`; add `"locoLength": { "ft": 80 }`; the loco is `L1` (Task 3 assigns it).

- [ ] **Step 2: Write the table**

Values for the demo (feet; MAIN measured from the west edge, SPUR1 from the S1 points; S1 points at MAIN 580; SPUR1 total 1040; racks 680 to 1040):

| Step | Caption | Positions (rear to head of each unit) | Coupled | Expected notes |
|---|---|---|---|---|
| 1 Arrival | Arrives on the main | L1 100-180, C5 180-240, C4 240-300, C3 300-360, C2 360-420, C1 420-480 on MAIN | [L1,C5,C4,C3,C2,C1] | none |
| 2 Shove | Shove 5 loads to the racks | on SPUR1: L1 600-680, C5 680-740, C4 740-800, C3 800-860, C2 860-920, C1 920-980 | same | info fit: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft." |
| 3 Cut off | Cut off from the loads | unchanged | [L1], [C5..C1] | none |
| 4 Run light | Leaves for other work | L1 offstage left; cars unchanged | [L1], [C5..C1] | none |
| 5 Unload | Customer unloads | unchanged; C1 to C5 empty | same | none |
| 6 Run light | Returns to the empties | L1 600-680 on SPUR1 | [L1], [C5..C1] | none |
| 7 Couple | Couples to the empties | unchanged | [L1,C5,C4,C3,C2,C1] | none |
| 8 Pull | Pulls the empties to the main | on MAIN: L1 150-230, C5 230-290, C4 290-350, C3 350-410, C2 410-470, C1 470-530 | same | none |
| 9 Departure | Departs westbound | all offstage left | same | none |

Write the same values to `tests/fixtures/demo-expected.json`. Add a line at the top of the markdown: "Conventions to confirm with the owner" listing the seven conventions above.

The example is validated by Task 2's first test.

- [ ] **Step 3: Commit**

```bash
git add docs/reference docs/schema/examples tests/fixtures
git commit -m "docs: demo expected-state table and corrected demo example"
```

---

### Task 2: Project scaffold, schema v1, file validation and migration

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `scripts/check-schema.mjs`
- Create: `src/core/schema/types.ts`, `src/core/schema/migrate.ts`, `src/core/schema/validateFile.ts`
- Modify: `docs/schema/plan-reading.schema.json` (version `"1"`; `spot` description "leading unit of the move")
- Test: `tests/core/schema.test.ts`

**Interfaces:**
- Produces:
  - `SCHEMA_VERSION = "1"`
  - `type Id = string`; `interface PlanReading` mirroring the schema (same field names), exported from `types.ts`
  - `interface FileProblem { path: string; message: string; repaired: boolean }`
  - `migrate(raw: unknown): { doc: unknown; problems: FileProblem[] }`: 0.2 to 0.3 to 1
  - `validateFile(raw: unknown): { plan: PlanReading | null; problems: FileProblem[] }`: migrate, Ajv check, then reference checks (spec 6.4 file checks 1 to 4)

- [ ] **Step 1: Scaffold**

`package.json` scripts: `"test": "vitest run"`, `"dev": "vite app"`, `"build": "vite build app"`, `"check-schema": "node scripts/check-schema.mjs"`. Dev dependencies pinned: `typescript@5.6.3`, `vite@5.4.10`, `vitest@2.1.4`, `ajv@8.17.1`. `tsconfig.json`: `strict: true`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `resolveJsonModule: true`, `lib: ["ES2022"]` for core (render and player get `"DOM"` through `app/tsconfig.json` in Task 9). Run `npm install`.

- [ ] **Step 2: Write the failing tests**

```ts
test("demo example validates with no problems", () => {
  const { plan, problems } = validateFile(demo);
  expect(problems).toEqual([]);
  expect(plan?.schemaVersion).toBe("1");
});
test("0.2 plan migrates: unsure becomes assumed provenance, enters defaults to left", () => {
  const { plan, problems } = validateFile(v02Fixture);
  expect(plan?.arrival.enters).toBe("left");
  expect(plan?.provenance?.["tracks.SPUR1.lengthFt"]).toEqual({ status: "assumed" });
  expect(problems.some(p => p.repaired)).toBe(true);
});
test("duplicate ids are reported, first kept", () => { /* two tracks with id MAIN */
  const { plan, problems } = validateFile(dupFixture);
  expect(problems[0].path).toBe("tracks[1].id");
  expect(plan?.tracks.filter(t => t.id === "MAIN")).toHaveLength(1);
});
test("a reference to a missing track is reported and the plan still opens", () => {
  const { plan, problems } = validateFile(missingRefFixture);
  expect(plan).not.toBeNull();
  expect(problems.map(p => p.path)).toContain("switches[0].to");
});
test("garbage input returns null plan and one problem", () => {
  expect(validateFile("not json").plan).toBeNull();
});
```

Fixtures live in `tests/fixtures/` as small JSON files.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/schema.test.ts` Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `types.ts`, `migrate.ts`, `validateFile.ts`; bump the schema file to `"1"` and update the example's `schemaVersion`**

Ajv 2020 (`ajv/dist/2020`) compiled once from `docs/schema/plan-reading.schema.json`. Reference checks never delete steps; they list problems with `repaired: false` unless they removed a duplicate.

- [ ] **Step 5: Run tests to verify they pass** (`npx vitest run tests/core/schema.test.ts`, PASS), and `npm run check-schema` prints the demo as valid.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts scripts src/core/schema tests docs/schema
git commit -m "feat: scaffold, schema v1, file validation and migration"
```

---

### Task 3: Normalize: stable IDs and shortcut expansion

**Files:**
- Create: `src/core/engine/normalize.ts`
- Test: `tests/core/normalize.test.ts`

**Interfaces:**
- Consumes: `PlanReading`, `FileProblem` (Task 2)
- Produces:
  - `interface Unit { id: Id; kind: "loco" | "car"; type: string; lengthFt: number; loaded?: boolean; mark?: string; number?: string }`
  - `type Op = "arrive" | "move" | "couple" | "uncouple" | "set_state" | "depart" | "stop" | "note"`
  - `interface Action { index: number; source: number; op: Op; verb: string; units: Id[]; to?: Id; spot?: number; stop?: Stop; via?: Id[]; between?: [Id, Id]; loaded?: boolean; text: string; callout?: { text: string; at?: Id } }` (`source` is the index in `work`, or -1 for arrival and -2 for departure; `verb` keeps the original word for captions)
  - `interface NormalizedPlan { plan: PlanReading; units: Unit[]; initialOrder: Id[]; onSite: { at: Id; units: Id[]; spot?: number }[]; groups: Record<Id, Id[]>; actions: Action[]; problems: FileProblem[] }`
  - `normalize(plan: PlanReading): NormalizedPlan`

- [ ] **Step 1: Write the failing tests**

```ts
test("counted cars get stable ids in head-to-rear order", () => {
  const n = normalize(plan({ cuts: [{ id: "LOADS", cars: 3, state: "loaded" }] }));
  expect(n.groups.LOADS).toEqual(["LOADS-1", "LOADS-2", "LOADS-3"]);
});
test("ids are the same on every call", () => {
  expect(normalize(p).units.map(u => u.id)).toEqual(normalize(p).units.map(u => u.id));
});
test("list wins over count and the mismatch is a problem", () => {
  const n = normalize(plan({ cuts: [{ id: "A", cars: 5, state: "empty", list: [c("X1"), c("X2"), c("X3"), c("X4")] }] }));
  expect(n.groups.A).toEqual(["X1", "X2", "X3", "X4"]);
  expect(n.problems[0].path).toBe("consist.cuts[0].cars");
});
test("locos get ids L1..Ln at 80 ft; cars default to 60 ft", () => { /* locos.count 2 */ });
test("demo: arrival, 7 work actions, departure; loco at the rear", () => {
  const n = normalize(demo);
  expect(n.actions.map(a => a.op)).toEqual(["arrive","move","uncouple","move","set_state","move","couple","move","depart"]);
  expect(n.initialOrder).toEqual(["C1","C2","C3","C4","C5","L1"]);
});
test("set_out expands to a move then an uncouple", () => {
  const n = normalize(withWork({ actor: "railroad", do: "set_out", cars: ["A"], to: "SPUR1", text: "Set out" }));
  expect(n.actions.slice(1, 3).map(a => a.op)).toEqual(["move", "uncouple"]);
});
test("pick_up expands to a couple then a move", () => { /* ... */ });
test("runaround expands to uncouple, move, move, move, couple", () => { /* via the siding named in via */ });
test("cut_off becomes an uncouple between the power and the adjacent car", () => {
  expect(normalize(demo).actions[2].between).toEqual(["L1", "C5"]);
});
```

- [ ] **Step 2: Run to verify failure** (`npx vitest run tests/core/normalize.test.ts`, FAIL)

- [ ] **Step 3: Implement `normalize`**

`cut_off` resolves `between` from the power and the car next to it in the arriving order, so normalize needs only the initial order. `runaround` without a usable `via` siding expands to the same five actions with `via: []`; the engine marks the route unresolved. Loco ids are `L1..Ln`. Counted car ids are `<groupId>-<n>`.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: normalize plans into stable units and single actions`)

---

### Task 4: Track graph in feet

**Files:**
- Create: `src/core/engine/graph.ts`
- Test: `tests/core/graph.test.ts`

**Interfaces:**
- Consumes: `NormalizedPlan` (Task 3)
- Produces:
  - `const TURNOUT_FT = 240; const FOUL_FT = 290; const APPROACH_MARGIN_FT = 200; const ARRIVAL_SHORT_FT = 100;`
  - `interface Pos { track: Id; ft: number }`
  - `interface TrackInfo { id: Id; role: string; totalFt: number; usableFromFt: number; start: { kind: "edge" | "switch"; switch?: Id; edge?: "left" | "right" }; end: { kind: "edge" | "buffer" | "switch"; switch?: Id; edge?: "left" | "right" } }`
  - `interface SwitchInfo { id: Id; on: Id; to: Id; atFt: number; side: "left" | "right"; approach: "facing" | "trailing" }` (`atFt` = points position on `on`)
  - `interface Segment { track: Id; fromFt: number; toFt: number }` and `interface Route { segments: Segment[]; lengthFt: number; switches: Id[] }`
  - `interface TrackGraph { tracks: Map<Id, TrackInfo>; switches: Map<Id, SwitchInfo>; facilities: Map<Id, { track: Id; startFt: number; endFt: number; spots: { n: number; fromFt: number; toFt: number }[] }>; route(from: Pos, to: Pos, via?: Id[]): Route | null; foulingZones(): { switch: Id; track: Id; fromFt: number; toFt: number }[] }`
  - `buildGraph(n: NormalizedPlan): TrackGraph`

- [ ] **Step 1: Write the failing tests**

```ts
test("demo: S1 points at MAIN 580, SPUR1 total 1040, racks 680 to 1040, spot 5 is 920 to 980", () => {
  const g = buildGraph(normalize(demo));
  expect(g.switches.get("S1")!.atFt).toBe(580);
  expect(g.tracks.get("SPUR1")!.totalFt).toBe(1040);
  const racks = g.facilities.get("RACKS")!;
  expect([racks.startFt, racks.endFt]).toEqual([680, 1040]);
  expect(racks.spots[4]).toEqual({ n: 5, fromFt: 920, toFt: 980 });
});
test("MAIN runs 240 ft plus the train length past S1", () => {
  expect(buildGraph(normalize(demo)).tracks.get("MAIN")!.totalFt).toBe(580 + 240 + 380);
});
test("route from MAIN 480 to SPUR1 980 goes through S1 and is 900 ft", () => {
  const r = buildGraph(normalize(demo)).route({ track: "MAIN", ft: 480 }, { track: "SPUR1", ft: 980 })!;
  expect(r.switches).toEqual(["S1"]);
  expect(r.lengthFt).toBe(100 + 980);
});
test("route that has to pass a named switch it cannot reach returns null", () => {});
test("fouling zones: S1 covers MAIN 580 to 870 and SPUR1 0 to 290", () => {});
test("trailing switch: branch leaves back toward the arrival end", () => {
  // atFt is still measured from the arrival edge; the frog side is toward lower ft
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `buildGraph`**

Each track is a 1D interval. A switch joins its parent at `atFt` to its branch at 0. Facing branches continue in the direction of rising parent ft; trailing branches continue toward falling parent ft. Main length and approach follow the conventions section. `route` is a breadth-first search over (track, direction) states, with switch transitions only at points, honouring `via` order when given; it returns the shortest route matching `via`, or `null`.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: track graph with routes, spots and fouling zones`)

---

### Task 5: Engine: replay into world states

**Files:**
- Create: `src/core/engine/simulate.ts`, `src/core/engine/state.ts`
- Test: `tests/core/simulate.test.ts`, `tests/core/simulate.property.test.ts`

**Interfaces:**
- Consumes: `NormalizedPlan`, `TrackGraph`, `Route`, `Pos` (Tasks 3, 4)
- Produces:
  - `type Place = { track: Id; rearFt: number; headFt: number } | { offstage: "left" | "right" }` (`rearFt < headFt` always; facing is in `facing`)
  - `interface WorldState { places: Record<Id, Place>; facing: Record<Id, "up" | "down">; coupled: Id[][]; loaded: Record<Id, boolean> }` ("up" = rising ft)
  - `type StepStatus = "ok" | "route_not_established" | "needs_attention"`
  - `interface StepResult { index: number; action: Action; status: StepStatus; route: Route | null; moved: Id[]; reason?: string }`
  - `interface Simulation { initial: WorldState; states: WorldState[]; steps: StepResult[] }` (`states[i]` is the picture after `steps[i]`)
  - `simulate(n: NormalizedPlan, g: TrackGraph): Simulation`

- [ ] **Step 1: Write the failing tests**

```ts
test("demo matches the expected-state table at every step", () => {
  const sim = run(demo);
  expected.forEach((e, i) => {
    expect(sim.states[i].places).toEqual(e.units);
    expect(sim.states[i].coupled).toEqual(e.coupled);
  });
});
test("every demo step is ok", () => {
  expect(run(demo).steps.every(s => s.status === "ok")).toBe(true);
});
test("three partial moves along one track keep three distinct positions after save and reopen", () => {
  // three move steps with stop {track:"MAIN", ft: 300/400/500, end:"lead"}; JSON round-trip the plan; compare
});
test("a step naming a deleted car is needs_attention and later steps still run", () => {});
test("a stop past the buffer stop is clamped to the track end", () => {
  // shove with stop {track:"SPUR1", ft: 2000, end:"lead"}: head ends at 1040
});
test("an unreachable destination plays as route_not_established and lands where asked", () => {});
test("two locos: run_light naming L2 moves only L2", () => {});
test("loco leaving and returning keeps its id and facing", () => {
  const sim = run(demo);
  expect(sim.states[3].places.L1).toEqual({ offstage: "left" });
  expect(sim.states[5].facing.L1).toBe(sim.states[1].facing.L1);
});
test("editing step 2 to stop on MAIN marks the couple step needs_attention", () => {
  // change the shove's to/spot to a MAIN stop; step 7 (couple) can no longer reach the cars by run_light to SPUR1
});
```

Property test (`fast-check` is not added; use a seeded generator in the test file): 200 random action lists over the demo graph built from the ops in Task 3, with random targets including invalid ones. Assert: `simulate` never throws; `states.length === actions.length`; the set of unit ids in every state equals the set of units (no car lost or duplicated); every on-track place lies within its track's bounds. (Overlap is not asserted: a forgiving placement after an unresolved route may overlap, and that is a note, not a crash.)

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `simulate`**

Resolve each move's target to a lead or rear position: `spot` (leading unit's front at the spot's `toFt` on that facility's track), `stop.track/ft/end`, `stop.beyond` (from the switch's points, measured away from the switch along the direction of travel), `offstage`, or the default for `to` alone (track: lead stops 100 ft short of the far end or the next switch; facility: leading unit at the last spot). Find the route with `g.route`; lay out the coupled group behind the leader along the route, unit lengths end to end. Clamp positions to track bounds. If the route is `null`, place the group at the target directly and set `route_not_established`. A step whose units or targets don't exist is `needs_attention` and leaves the state unchanged.

- [ ] **Step 4: Run to verify pass** (both test files)

- [ ] **Step 5: Commit** (`feat: engine replays plans into world states`)

---

### Task 6: Notes and metrics

**Files:**
- Create: `src/core/engine/notes.ts`, `src/core/engine/metrics.ts`
- Test: `tests/core/notes.test.ts`, `tests/core/metrics.test.ts`

**Interfaces:**
- Consumes: `Simulation`, `NormalizedPlan`, `TrackGraph`
- Produces:
  - `interface Note { step: number; kind: "fit" | "fouling" | "buffer" | "power_end" | "runaround" | "unclear_route" | "sequence"; level: "info" | "heads_up"; text: string; at?: Id }`
  - `notesFor(sim: Simulation, n: NormalizedPlan, g: TrackGraph): Note[]`
  - `interface Metrics { moves: number; feetTravelled: { locos: number; cars: Record<Id, number> }; switchThrows: number; couplings: number; complete: boolean }`
  - `metricsFor(sim: Simulation, g: TrackGraph): Metrics`

- [ ] **Step 1: Write the failing tests**

```ts
test("demo shove gives the exact info fit note", () => {
  expect(notesFor(...demoRun).filter(x => x.kind === "fit")).toEqual([{
    step: 1, kind: "fit", level: "info", at: "RACKS",
    text: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft.",
  }]);
});
test("six cars at the racks give a heads-up that states the assumption", () => {
  // text: "6 cars at 60 ft = 360 ft, plus 10% for slack = 396 ft; the racks have 360 ft. Lengths are the general 60 ft planning length."
});
test("fit counts cars already on site", () => { /* onSite 2 empties at RACKS + 4 loads shoved: heads_up */ });
test("a 94 ft car changes the fit numbers", () => {});
test("cars whose far end stands inside S1's 290 ft zone get a fouling heads-up", () => {});
test("clamped stop at a buffer stop gives a buffer heads-up", () => {});
test("route_not_established step gives an unclear_route note", () => {});
test("no note text contains an em dash or en dash", () => {
  const dashes = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  expect(allNotes.every(x => !dashes.test(x.text))).toBe(true);
});
test("demo metrics: 6 moves (arrival, shove, two run-light moves, pull, departure), 1 switch throw, 1 coupling, complete", () => {});
test("a route_not_established step makes metrics incomplete", () => {});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** the note rules of spec 6.4 items 5 to 11 using the engine's states only (power end: compare the loco's place to the group's direction of travel for `shove`/`pull` verbs; runaround: siding with two switches and room for the loco). Metrics as spec 6.4: a move is one movement of one coupled group; switch throws count changes from normal (normal = through route) starting all normal.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: engine notes and plan metrics`)

---

### Task 7: Layout: feet and lanes to drawing coordinates

**Files:**
- Create: `src/core/layout/layout.ts`, `src/core/layout/place.ts`
- Test: `tests/core/layout.test.ts`

**Interfaces:**
- Consumes: `TrackGraph`, `NormalizedPlan`, `WorldState`
- Produces:
  - `interface DrawPoint { xFt: number; lane: number }` (lane 0 = main; positive = up the page)
  - `interface Drawing { widthFt: number; lanes: number[]; tracks: { id: Id; role: string; points: DrawPoint[] }[]; facilities: { id: Id; name: string; fromXFt: number; toXFt: number; lane: number; spots: { n: number; fromXFt: number; toXFt: number }[] }[]; compass: { left: string; right: string }; arrivalArrow: { side: "left" | "right"; label: string }; bufferStops: DrawPoint[] }`
  - `layout(n: NormalizedPlan, g: TrackGraph): Drawing`
  - `interface Sprite { id: Id; kind: "loco" | "car"; type: string; loaded?: boolean; xFt: number; lane: number; angleDeg: number; lengthFt: number; mark?: string }`
  - `placeUnits(d: Drawing, g: TrackGraph, s: WorldState): Sprite[]`
  - `pointAt(d: Drawing, g: TrackGraph, p: Pos): { xFt: number; lane: number; angleDeg: number }`

- [ ] **Step 1: Write the failing tests**

```ts
test("demo: MAIN on lane 0 from x 0 to 1200; SPUR1 rises to lane 1 over 240 ft from x 580", () => {
  const d = layout(...demo);
  expect(d.tracks.find(t => t.id === "MAIN")!.points).toEqual([{ xFt: 0, lane: 0 }, { xFt: 1200, lane: 0 }]);
  expect(d.tracks.find(t => t.id === "SPUR1")!.points).toEqual([{ xFt: 580, lane: 0 }, { xFt: 820, lane: 1 }, { xFt: 1620, lane: 1 }]);
});
test("demo compass: West on the left, East on the right, arrow says Eastbound", () => {});
test("a train entering from the right mirrors x and puts its left-side branch on lane -1", () => {
  // same plan with enters:"right": SPUR1 lane -1, x mirrored around widthFt; simulate gives the same states
});
test("two branches on the same side take lanes 1 and 2", () => {});
test("racks span x 1260 to 1620 on lane 1 with five spots 60 ft wide from x 1260", () => {});
test("placeUnits for demo step 2 puts C1's centre at x 1530, lane 1, angle 0", () => {});
test("a unit on the turnout diagonal gets a non-zero angle", () => {});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement.** Diagonal over the 240 ft turnout from the points to the branch lane; then parallel. Mirroring for `enters: "right"` is applied only here (x' = widthFt - x, lane' = -lane). Compass labels come from `arrival.direction`.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: layout in feet and lanes`)

---

### Task 8: SVG renderer and side-view silhouettes

**Files:**
- Create: `src/render/render.ts`, `src/render/silhouettes.ts`, `src/render/theme.ts`
- Test: `tests/render/render.test.ts` (Vitest with `environment: "happy-dom"` for this file only; add `happy-dom@15.11.0` as a dev dependency)

**Interfaces:**
- Consumes: `Drawing`, `Sprite`, `Note`, `StepStatus`
- Produces:
  - `interface RenderOptions { pxPerFt: number; laneGapPx: number; showMarks: boolean }` (`laneGapPx` default 90: track spacing stretched beyond scale)
  - `fitPxPerFt(d: Drawing, widthPx: number): number`
  - `renderDrawing(svg: SVGSVGElement, d: Drawing, o: RenderOptions): void`
  - `renderSprites(layer: SVGGElement, sprites: Sprite[], o: RenderOptions): void`
  - `silhouette(type: string, kind: "loco" | "car", lengthPx: number, loaded: boolean): string` (SVG markup for one unit, side view, origin at its centre on the rail)
  - `theme` tokens: ink `#0e1013`, paper `#f2efe6`, gold `#d9c48c`, steel `#8a9199`, rail `#3b424b`, loco `#e8432f`, loaded `#e0ad4b`, empty `#7c848d` (from the portfolio demo)

- [ ] **Step 1: Write the failing tests**

```ts
test("draws one path per track and one box per facility", () => {});
test("labels the compass points and the arrival arrow", () => {});
test("silhouettes exist for generic, covered_hopper_large and six_axle; unknown types fall back to generic", () => {});
test("a sprite is drawn at its length in px and rotated by its angle", () => {});
test("loaded and empty cars differ in fill", () => {});
test("route_not_established transition class is applied when asked", () => {});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement.** P1 silhouettes: generic car, covered hopper (large), tank car, boxcar, six-axle loco; every other type uses generic until P2. Side view sits above the rail line, so lanes need `laneGapPx` room. Fonts: JetBrains Mono for labels, with a system monospace fallback.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: SVG renderer with side-view silhouettes`)

---

### Task 9: Player and private preview page

**Files:**
- Create: `src/player/player.ts`, `src/player/interpolate.ts`
- Create: `app/index.html`, `app/main.ts`, `app/tsconfig.json`
- Create: `.claude/launch.json` (preview server `npm run dev`, port 5173)
- Test: `tests/player/interpolate.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  - `ease(t: number): number` (ease-out cubic, `1 - (1 - t) ** 3`, as the portfolio demo)
  - `interpolate(before: WorldState, after: WorldState, step: StepResult, progress: number): WorldState` (pure; `progress` is the linear fraction of the route, 0 to 1; moved units follow `step.route`; for `route_not_established` it returns `after` and the renderer fades it in)
  - `createPlayer(root: HTMLElement, plan: PlanReading): { show(step: number): void; play(): void; pause(): void; destroy(): void }`

- [ ] **Step 1: Write the failing tests**

```ts
test("t = 0 gives before and t = 1 gives after", () => {});
test("at progress 0.5 of the demo shove, C1's head is at SPUR1 440", () => {
  // route is 1080 ft: 100 ft on MAIN to S1, then 980 on SPUR1; half is 540, so 440 into SPUR1
  const p = interpolate(sim.states[0], sim.states[1], sim.steps[1], 0.5).places.C1 as { track: string; headFt: number };
  expect(p).toMatchObject({ track: "SPUR1", headFt: 440 });
});
test("ease(0) = 0, ease(1) = 1, ease(0.5) = 0.875", () => {});
test("units not in step.moved never move", () => {});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** `ease`, `interpolate` and `createPlayer` (the player passes `ease(t)` as progress over 1.5 s per step) (step caption, Step n / N, Prev, Play/Pause, Next, dots, notes list, "Route not established" label on such steps). `app/main.ts` loads `docs/schema/examples/customer-service-demo.reading.json`, runs validate, normalize, graph, simulate, notes, layout, and mounts the player.

- [ ] **Step 4: Run to verify pass**, then `npm test` (whole suite PASS) and `npm run build` (no type errors).

- [ ] **Step 5: Check it in the browser**

Start the `preview` server from `.claude/launch.json`. Expected: the demo plays all 9 steps; the racks show the info fit note on step 2; no console errors. Take a screenshot for the owner.

- [ ] **Step 6: Commit** (`feat: player and private preview page`)

---

## P1 done when

- `npm test` passes, including the demo expected-state test, the property test and the mirrored-layout test.
- The preview page plays the demo step by step and matches `docs/reference/demo-expected-states.md`.
- The engine shows the fit note at the racks on the shove step.
- The owner has confirmed the conventions at the top of the expected-state table.
