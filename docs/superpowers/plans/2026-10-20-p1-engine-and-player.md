# P1 Engine and Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a PlanReading into a correct, replayable sequence of world states and play it as a to-scale, side-view SVG animation in a private preview build, using the portfolio demo as the reference plan.

**Architecture:** A plain TypeScript core (`src/core`: schema, materialize, graph, engine, notes, layout) with no DOM dependency, a framework-free SVG renderer and player (`src/render`, `src/player`), and a small Vite preview page (`app/`). The engine works in feet on a track graph. Each piece of equipment occupies an ordered stretch of track that may cross a switch. Layout maps feet and lanes to drawing coordinates; render applies one pixel scale.

**Tech Stack:** TypeScript 5.6 (strict), Vite 5.4, Vitest 2.1, Ajv 8.17 (JSON Schema 2020-12), happy-dom 15.11 (render tests only), Node 22. No UI framework in P1.

**Spec:** `docs/spec.md` (sections 5.2, 5.3, 5.7, 6, 6.6, 10, 12.2 P1, 13). Read it alongside this plan.

**Revision note:** revised after a second outside review. Changes: occupancy across switches, state-based coupling, persistent IDs, preserved out-of-range stops, a 290 ft clear-point origin for usable length, logical offstage boundaries, angle after projection, stronger tests and a type check.

## Global Constraints

- Core code (`src/core/**`) imports nothing from the DOM or any UI library. `src/render` and `src/player` use the DOM but no framework.
- PlanReading is the only public format. The canvas model is an internal type, in feet, rebuilt on every change.
- One simulation: notes, layout positions and metrics all read the engine's output; nothing re-implements plan state.
- Every car is 60 ft and every loco 80 ft unless a unit sets `lengthFt`. The 10% slack (`carLength.allowancePct`, minimum 10) is used only inside fit notes; it is never added to positions or spots.
- A unit's occupied length always equals its `lengthFt`. Nothing shortens, splits or merges equipment.
- The engine never throws on a schema-valid plan. Problems become notes or step statuses, and the person's authored stop is kept.
- Physical distances come from the track model in feet, never from drawn SVG path length (lane spacing is stretched beyond scale).
- User-authored text (captions, callouts, names, marks) is inserted as text nodes, never parsed as SVG or HTML. Only application-owned silhouette markup is SVG.
- User-facing text: plain words, no em dashes or en dashes.
- No proprietary railway data in the repo. `private-fixtures/` stays git-ignored.

## Conventions this plan fixes (confirmed by the owner, 2026-10-20)

1. **Distances on a track** are measured from its start: the arrival end for the main, the switch points for a branch.
2. **Turnout and clear point:** the turnout is drawn 240 ft from the points; the clear point is 290 ft from the points. A branch's **usable length** (`lengthFt`) starts at the clear point, so its total length is 290 + `lengthFt`, with any buffer stop at that total.
3. **Fouling zone:** from the points to 290 ft toward the frog, on both the through and the diverging track.
4. **Approach:** the first switch on the main sits at least (arriving train length + 200 ft) from the arrival end, so the whole train can stand on the main before it. The main runs on past its last switch by (240 ft + arriving train length). The owner wants people to see more or less of the main by zooming and scrolling (Release 1 zoom and pan); this length is only the drawn minimum.
5. **Arrival stop is the person's choice.** The arrival step can carry a `stop` like any move, and the person drags the train wherever it should stand. Only when no stop is given does the train start with its head 100 ft short of the first switch's points, as a starting position to drag from.
6. **Spots** are fixed positions numbered from the switch end of the facility (spot 1 nearest the switch), 60 ft apart from the facility start. A facility with no `startFt` sits at the far end of its track.
7. **`spot` on a step** puts the **leading** unit's front at that spot's far edge.
8. **Group order** in lists runs from the head end of the arriving train.
9. **Offstage** is named by the main's logical boundary, `arrival_end` or `far_end`, never left or right. Layout maps these to screen sides.
10. **Out-of-range stops** (past a buffer stop, or beyond the drawn main) are kept as authored. The cars are drawn where the person put them, the step gets status `past_end` and a heads-up note. Reaching ft 0 of a branch means reaching its switch, not an end of track.

## Review Focus

1. **A car stopped halfway through a switch.** It must keep its full length, span both tracks, and get a fouling note. Tested in Task 5.
2. **A pickup from different equipment, then a cut-off.** The cut-off must split the loco from the car it is coupled to now, not the car it arrived with. Tested in Task 5.
3. **Equipment removed, steps reordered, plan saved and reopened.** Surviving cars, locos and steps keep their IDs. Tested in Task 3.
4. **A train entering from the right.** Same states, mirrored drawing, a left-side branch below the main, offstage still `arrival_end`. Tested in Task 7.
5. **A step that refers to deleted equipment or a group no longer coupled.** It becomes `needs_attention`, later steps still run, nothing crashes. Tested in Task 5.

Every test named in this plan must contain the assertions shown or described. A test with an empty body does not count toward any completion gate.

---

### Task 1: Demo expected-state table and example corrections

**Files:**
- Create: `docs/reference/demo-expected-states.md`
- Create: `tests/fixtures/demo-expected.json`
- Modify: `docs/schema/examples/customer-service-demo.reading.json`

**Interfaces:**
- Produces: `tests/fixtures/demo-expected.json`, an array of 9 entries (arrival, 7 work steps, departure): `{ step: number; status: "ok"; units: Record<Id, { occupies: { track: Id; fromFt: number; toFt: number }[] } | { offstage: "arrival_end" | "far_end" }>; facing: Record<Id, "up" | "down">; coupled: Id[][]; loaded: Record<Id, boolean>; notes: { kind: string; level: string; text?: string }[] }`. Used by Tasks 5 and 6.

- [ ] **Step 1: Correct the demo example**

In `customer-service-demo.reading.json`: car list spots C1 = 5, C2 = 4, C3 = 3, C4 = 2, C5 = 1; shove step `"spot": 5`; first `run_light` stop `{ "offstage": "arrival_end" }`; return `run_light` stop `{ "track": "SPUR1", "ft": 730, "end": "lead" }`; pull stop `{ "beyond": "S1", "ft": 50, "end": "rear" }`; add `"locoLength": { "ft": 80 }`.

- [ ] **Step 2: Write the table**

Values (feet; MAIN from the arrival end; SPUR1 from the S1 points; S1 points at MAIN 580; SPUR1 total 1090; racks 730 to 1090; spot 5 is 970 to 1030). "Up" means facing toward rising ft on its track.

| Step | Occupancy (rear to head) | Coupled | Loaded | Notes |
|---|---|---|---|---|
| 1 Arrival | MAIN: L1 100-180, C5 180-240, C4 240-300, C3 300-360, C2 360-420, C1 420-480 | [L1,C5,C4,C3,C2,C1] | all loaded | none |
| 2 Shove | SPUR1: L1 650-730, C5 730-790, C4 790-850, C3 850-910, C2 910-970, C1 970-1030 | same | all loaded | fit, info: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft." |
| 3 Cut off | unchanged | [L1], [C5,C4,C3,C2,C1] | all loaded | none |
| 4 Run light | L1 offstage arrival_end; cars unchanged | [L1], [C5..C1] | all loaded | none |
| 5 Unload | unchanged | same | all empty | none |
| 6 Run light | SPUR1: L1 650-730 | [L1], [C5..C1] | all empty | none |
| 7 Couple | unchanged | [L1,C5,C4,C3,C2,C1] | all empty | none |
| 8 Pull | MAIN: L1 150-230, C5 230-290, C4 290-350, C3 350-410, C2 410-470, C1 470-530 | same | all empty | none |
| 9 Departure | all offstage arrival_end | same | all empty | none |

Facing: L1 and the cars face "up" on MAIN and SPUR1 throughout (the loco never turns). Write the same values to the JSON. Put the ten conventions at the top of the markdown under "Conventions (confirmed by the owner, 2026-10-20)". The example is validated by Task 2's first test.

- [ ] **Step 3: Commit**

```bash
git add docs/reference docs/schema/examples tests/fixtures
git commit -m "docs: demo expected-state table and corrected demo example"
```

---

### Task 2: Scaffold, schema v1, file checks, migration and type checking

**Files:**
- Create: `package.json`, `tsconfig.json` (core, no DOM), `tsconfig.app.json` (DOM, for render, player, app), `vitest.config.ts`, `scripts/check-schema.mjs`
- Create: `src/core/schema/types.ts`, `src/core/schema/migrate.ts`, `src/core/schema/validateFile.ts`
- Modify: `docs/schema/plan-reading.schema.json`, `docs/schema/examples/customer-service-demo.reading.json`
- Test: `tests/core/schema.test.ts`

**Interfaces:**
- Produces:
  - `SCHEMA_VERSION = "1"`; `type Id = string`; `interface PlanReading` mirroring the v1 schema field names
  - `interface FileProblem { path: string; message: string; repaired: boolean }`
  - `migrate(raw: unknown): { doc: unknown; problems: FileProblem[] }` (0.2 to 0.3 to 1)
  - `validateFile(raw: unknown): { plan: PlanReading | null; problems: FileProblem[] }`: migrate, Ajv, then the structural checks of spec 6.4 items 1 to 3 plus "every `via` switch exists". Whether a `via` switch lies on the route is left to replay (Task 5).

Schema v1 changes from v0.3: `schemaVersion: "1"`; `arrival` gets an optional `stop` (same shape as a step's stop); every `work` item gets a required `id`; `consist.locos` gets an optional `list` of `{ id, type?, lengthFt? }`; `stop.offstage` becomes `"arrival_end" | "far_end"`; `spot` described as "the leading unit's front goes to this spot's far edge". Migration from 0.3: give steps `S1..Sn` ids (avoiding collisions), map offstage `left` to `arrival_end` when `arrival.enters` is `left` (and the reverse for `right`).

- [ ] **Step 1: Scaffold**

Scripts: `"test": "vitest run"`, `"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.app.json --noEmit"`, `"dev": "vite app"`, `"build": "npm run typecheck && vite build app"`, `"check-schema": "node scripts/check-schema.mjs"`. Dev dependencies pinned: `typescript@5.6.3`, `vite@5.4.10`, `vitest@2.1.4`, `ajv@8.17.1`, `happy-dom@15.11.0`. `tsconfig.json` covers `src/core` and `tests/core` with `lib: ["ES2022"]` and no DOM types; `tsconfig.app.json` covers `src/render`, `src/player`, `app` with `"DOM"`. Run `npm install`.

- [ ] **Step 2: Write the failing tests**

```ts
test("demo example validates with no problems", () => {
  const { plan, problems } = validateFile(demo);
  expect(problems).toEqual([]);
  expect(plan?.schemaVersion).toBe("1");
  expect(plan?.work.every(w => typeof w.id === "string")).toBe(true);
});
test("0.2 plan migrates: unsure becomes assumed provenance, enters defaults to left", () => {
  const { plan, problems } = validateFile(v02Fixture);
  expect(plan?.arrival.enters).toBe("left");
  expect(plan?.provenance?.["tracks.SPUR1.lengthFt"]).toEqual({ status: "assumed" });
  expect(problems.some(p => p.repaired)).toBe(true);
});
test("0.3 offstage left on a left-entering plan becomes arrival_end", () => {});
test("duplicate ids: problem at the second, first kept", () => {
  const { plan, problems } = validateFile(dupFixture);
  expect(problems[0].path).toBe("tracks[1].id");
  expect(plan?.tracks.filter(t => t.id === "MAIN")).toHaveLength(1);
});
test("a reference to a missing track is reported and the plan still opens", () => {
  const { plan, problems } = validateFile(missingRefFixture);
  expect(plan).not.toBeNull();
  expect(problems.map(p => p.path)).toContain("switches[0].to");
});
test("garbage input returns a null plan and one problem", () => {
  const r = validateFile("not json");
  expect(r.plan).toBeNull();
  expect(r.problems).toHaveLength(1);
});
```

The 0.3 offstage test asserts `plan.work[2].stop` equals `{ offstage: "arrival_end" }` for a fixture whose step 3 has `{ offstage: "left" }` and `enters: "left"`.

- [ ] **Step 3: Run to verify failure:** `npx vitest run tests/core/schema.test.ts`, FAIL (modules not found).

- [ ] **Step 4: Implement** `types.ts`, `migrate.ts`, `validateFile.ts`; update the schema to v1 and the demo example (`schemaVersion: "1"`, step ids `W1..W7`).

- [ ] **Step 5: Verify:** `npx vitest run tests/core/schema.test.ts` PASS; `npm run check-schema` prints the demo as valid; `npm run typecheck` passes.

- [ ] **Step 6: Commit** (`feat: scaffold, schema v1, file checks, migration and type checking`)

---

### Task 3: Materialize: permanent equipment and step IDs, stateless expansion

**Files:**
- Create: `src/core/engine/materialize.ts`
- Test: `tests/core/materialize.test.ts`

**Interfaces:**
- Consumes: `PlanReading`, `FileProblem`
- Produces:
  - `materialize(plan: PlanReading): { plan: PlanReading; problems: FileProblem[] }`. Returns a plan where every counted group has an explicit `list`, `consist.locos.list` is explicit, every step has an `id`, and shortcuts that need no state are expanded into saved steps (`set_out` into a move then a `cut_off`, `pick_up` into a `couple` then a move). IDs are allocated once, avoiding collisions, and never regenerated if already present. Idempotent: `materialize(materialize(p).plan).plan` deep-equals `materialize(p).plan`.
  - `interface Unit { id: Id; kind: "loco" | "car"; type: string; lengthFt: number; mark?: string; number?: string }`
  - `unitsOf(plan: PlanReading): Unit[]` (from the materialized lists, with 60 / 80 ft defaults)
  - `initialOrder(plan: PlanReading): Id[]` (arriving train, head first)
  - `groupsOf(plan: PlanReading): Record<Id, Id[]>`

`runaround` is not expanded in P1: `materialize` leaves it as one step, and Task 5 replays it as `needs_attention` with the reason "Runaround comes with the tier 2 work." Coupling pairs for `cut_off` and implicit `couple` are not resolved here; they depend on the state (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
test("counted cars get explicit ids in head-to-rear order", () => {
  const m = materialize(plan({ cuts: [{ id: "LOADS", cars: 3, state: "loaded" }] })).plan;
  expect(m.consist.cuts[0].list!.map(c => c.id)).toEqual(["LOADS-1", "LOADS-2", "LOADS-3"]);
});
test("materialize is idempotent", () => {
  const once = materialize(p).plan;
  expect(materialize(once).plan).toEqual(once);
});
test("remove a middle car and reorder two steps, save, reopen: ids survive", () => {
  const m = materialize(p).plan;                       // LOADS-1..3, W1..W3
  m.consist.cuts[0].list!.splice(1, 1);                // remove LOADS-2
  [m.work[0], m.work[1]] = [m.work[1], m.work[0]];      // reorder
  const reopened = materialize(JSON.parse(JSON.stringify(m))).plan;
  expect(reopened.consist.cuts[0].list!.map(c => c.id)).toEqual(["LOADS-1", "LOADS-3"]);
  expect(reopened.work.map(w => w.id)).toEqual(["W2", "W1", "W3"]);
});
test("removing L1 keeps L2 as L2", () => {});
test("list wins over count and the mismatch is a problem", () => {
  const r = materialize(plan({ cuts: [{ id: "A", cars: 5, state: "empty", list: [c("X1"), c("X2"), c("X3"), c("X4")] }] }));
  expect(r.plan.consist.cuts[0].list!.map(c => c.id)).toEqual(["X1", "X2", "X3", "X4"]);
  expect(r.problems[0].path).toBe("consist.cuts[0].cars");
});
test("new ids never collide with existing ones", () => {});
test("set_out is saved as a move then a cut_off, each with its own id", () => {});
test("pick_up is saved as a couple then a move", () => {});
test("demo: initial order is C1..C5 then L1; loco is L1 at 80 ft; cars 60 ft", () => {
  const m = materialize(demo).plan;
  expect(initialOrder(m)).toEqual(["C1", "C2", "C3", "C4", "C5", "L1"]);
  expect(unitsOf(m).find(u => u.id === "L1")!.lengthFt).toBe(80);
});
```

"Removing L1 keeps L2 as L2" asserts the locos list after removing `L1` and re-materializing is `["L2"]`. "New ids never collide" asserts that a plan with an existing car `LOADS-1` and a counted group `LOADS` of 2 produces `LOADS-2`, `LOADS-3` (or another non-colliding pair), with all ids unique.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `materialize`, `unitsOf`, `initialOrder`, `groupsOf`**

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: materialize permanent equipment and step ids`)

---

### Task 4: Track graph in feet

**Files:**
- Create: `src/core/engine/graph.ts`
- Test: `tests/core/graph.test.ts`

**Interfaces:**
- Consumes: materialized `PlanReading`, `unitsOf`, `initialOrder`
- Produces:
  - `const TURNOUT_FT = 240; const CLEAR_FT = 290; const APPROACH_MARGIN_FT = 200; const ARRIVAL_SHORT_FT = 100;`
  - `interface Pos { track: Id; ft: number }`; `interface Segment { track: Id; fromFt: number; toFt: number }` (in the direction of travel, so `fromFt > toFt` is allowed in routes)
  - `interface TrackInfo { id: Id; role: string; totalFt: number; ends: { start: End; end: End } }`, `type End = { kind: "boundary"; name: "arrival_end" | "far_end" } | { kind: "buffer" } | { kind: "switch"; switch: Id }`
  - `interface SwitchInfo { id: Id; on: Id; to: Id; atFt: number; side: "left" | "right"; approach: "facing" | "trailing" }`
  - `interface Route { segments: Segment[]; lengthFt: number; switches: Id[] }`
  - `interface TrackGraph { tracks: Map<Id, TrackInfo>; switches: Map<Id, SwitchInfo>; facilities: Map<Id, { track: Id; startFt: number; endFt: number; spots: { n: number; fromFt: number; toFt: number }[] }>; walk(from: Pos, heading: "up" | "down", distanceFt: number, via?: Id[], target?: Pos): Segment[] | null; route(from: Pos, heading: "up" | "down", to: Pos, via?: Id[]): Route | null; foulingZones(): { switch: Id; track: Id; fromFt: number; toFt: number }[] }`
  - `buildGraph(plan: PlanReading): TrackGraph`

`walk` follows the track from a position for a distance, taking at each switch the branch that leads toward `target` (or the through route when no target is given), honouring `via` in order. It may run past a `boundary` end (offstage) or a `buffer` end (past end); it returns segments with ft beyond the track's bounds in those cases. It returns `null` only when a required `via` can't be reached.

- [ ] **Step 1: Write the failing tests**

```ts
test("demo: S1 at MAIN 580, SPUR1 total 1090, racks 730 to 1090, spot 5 is 970 to 1030", () => {
  const g = buildGraph(demoM);
  expect(g.switches.get("S1")!.atFt).toBe(580);
  expect(g.tracks.get("SPUR1")!.totalFt).toBe(1090);
  const racks = g.facilities.get("RACKS")!;
  expect([racks.startFt, racks.endFt]).toEqual([730, 1090]);
  expect(racks.spots[4]).toEqual({ n: 5, fromFt: 970, toFt: 1030 });
});
test("MAIN total is 580 + 240 + 380 = 1200, start is arrival_end, end is far_end", () => {});
test("route from MAIN 480 heading up to SPUR1 1030 goes through S1 and is 1130 ft", () => {
  const r = buildGraph(demoM).route({ track: "MAIN", ft: 480 }, "up", { track: "SPUR1", ft: 1030 })!;
  expect(r.switches).toEqual(["S1"]);
  expect(r.lengthFt).toBe(1130);
});
test("walk 130 ft up from MAIN 480 toward SPUR1 crosses S1 into SPUR1 30", () => {
  const segs = buildGraph(demoM).walk({ track: "MAIN", ft: 480 }, "up", 130, undefined, { track: "SPUR1", ft: 1030 })!;
  expect(segs).toEqual([{ track: "MAIN", fromFt: 480, toFt: 580 }, { track: "SPUR1", fromFt: 0, toFt: 30 }]);
});
test("walking down off SPUR1 ft 0 continues onto MAIN at S1 (ft 0 of a branch is not an end)", () => {});
test("walking past the buffer stop returns a segment beyond SPUR1's total", () => {});
test("fouling zones: S1 covers MAIN 580 to 870 and SPUR1 0 to 290", () => {});
test("a required via switch that can't be reached returns null", () => {});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `buildGraph`** per conventions 1 to 4 and 6. Facing branches leave toward rising parent ft; trailing branches leave toward falling parent ft.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: track graph with walks, routes, spots and fouling zones`)

---

### Task 5: Engine: replay into world states

**Files:**
- Create: `src/core/engine/state.ts`, `src/core/engine/simulate.ts`
- Test: `tests/core/simulate.test.ts`, `tests/core/simulate.property.test.ts`

**Interfaces:**
- Consumes: `materialize`, `unitsOf`, `initialOrder`, `groupsOf`, `TrackGraph`
- Produces:
  - `type Place = { occupies: Segment[] } | { offstage: "arrival_end" | "far_end" }` (segments ordered rear to head; their lengths sum to the unit's `lengthFt`)
  - `interface WorldState { places: Record<Id, Place>; facing: Record<Id, "up" | "down">; coupled: Id[][]; loaded: Record<Id, boolean> }`
  - `type StepStatus = "ok" | "route_not_established" | "past_end" | "needs_attention"`
  - `interface StepResult { stepId: Id | "arrival" | "departure"; index: number; verb: string; status: StepStatus; moved: Id[]; travel: Segment[] | null; requested?: unknown; reason?: string }` (`travel` is the path the leading end covered)
  - `interface Simulation { initial: WorldState; states: WorldState[]; steps: StepResult[] }`
  - `simulate(plan: PlanReading, g: TrackGraph): Simulation` (expects a materialized plan)

How moves work (the only algorithm this plan spells out):
- A coupled group occupies one continuous path, rear to head. Its units are laid end to end along that path.
- A move of distance d in the direction of travel extends the path at the leading end by `g.walk(...)` for d, and trims d from the trailing end. A 10 ft nudge therefore moves everything 10 ft and leaves the rest of the train where it was.
- The target is resolved from the step: `spot` (leading unit's front at the spot's `toFt`), `stop.track/ft/end`, `stop.beyond` (measured from the switch's points along the direction of travel), `stop.offstage`, or the default for `to` alone (track: leading end 100 ft short of the next switch or the far end; facility: leading unit at the last spot). d is the walk distance from the current leading end to that target.
- `cut_off` and implicit `couple` resolve their pair from the state just before the step: `cut_off` splits the named or only loco from the unit it is coupled to now; `couple` joins the loco to the adjacent unit in its direction of travel. If no such pair exists, the step is `needs_attention`.
- No route: place the group at the authored target as given and set `route_not_established`. Past a buffer stop or beyond the drawn main: keep the authored target, set `past_end`. Missing equipment or groups: `needs_attention`, state unchanged. `runaround`: `needs_attention` in P1.

- [ ] **Step 1: Write the failing tests**

```ts
test("demo matches the expected-state table at every step: places, facing, coupled, loaded, status", () => {
  const sim = run(demo);
  expected.forEach((e, i) => {
    expect(sim.states[i].places).toEqual(e.units);
    expect(sim.states[i].facing).toEqual(e.facing);
    expect(sim.states[i].coupled).toEqual(e.coupled);
    expect(sim.states[i].loaded).toEqual(e.loaded);
    expect(sim.steps[i].status).toBe(e.status);
  });
});
test("a stop with C1 halfway through S1 keeps C1 at 60 ft across MAIN and SPUR1", () => {
  // shove with stop { track: "SPUR1", ft: 30, end: "lead" }
  const c1 = (run(p).states[1].places.C1 as { occupies: Segment[] }).occupies;
  expect(c1).toEqual([{ track: "MAIN", fromFt: 550, toFt: 580 }, { track: "SPUR1", fromFt: 0, toFt: 30 }]);
});
test("a 10 ft nudge moves the whole train 10 ft and keeps spacing", () => {
  // move with stop { track: "MAIN", ft: 490, end: "lead" } after arrival: L1 110-190 ... C1 430-490
});
test("three partial moves along one track survive a JSON round trip", () => {});
test("pickup from different equipment, then cut_off, splits L1 from E1", () => {
  // on site: E1 at SPUR1; L1 runs light, couples to E1, then cut_off: coupled contains [L1] and a group with E1
});
test("a stop past the buffer is kept as authored with status past_end", () => {
  // shove with stop { track: "SPUR1", ft: 2000, end: "lead" }: C1's head segment ends at 2000; status past_end
});
test("an unreachable destination is route_not_established and lands where asked", () => {});
test("a step naming deleted equipment is needs_attention; later steps still run", () => {});
test("editing the shove to stop on MAIN makes the couple step needs_attention", () => {});
test("two locos: run_light naming L2 moves only L2", () => {});
test("loco leaving and returning keeps its id and facing", () => {
  const sim = run(demo);
  expect(sim.states[3].places.L1).toEqual({ offstage: "arrival_end" });
  expect(sim.states[5].facing.L1).toBe(sim.states[1].facing.L1);
});
test("runaround is needs_attention in P1 with the tier 2 reason", () => {});
```

Each test above asserts the values in its comment. The property test uses a seeded generator in the file (no extra library): 200 random step lists over the demo graph, including invalid targets and deleted references. It asserts: `simulate` never throws; `states.length === steps.length`; each unit's occupied length equals its `lengthFt` (or it is offstage); the set of unit ids never changes; no unit appears in two coupled groups; units of a coupled group are end to end after `ok` moves; any step that didn't fully succeed has a non-`ok` status.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `simulate`**

- [ ] **Step 4: Run to verify pass** (both test files)

- [ ] **Step 5: Commit** (`feat: engine replays plans into world states`)

---

### Task 6: Notes and metrics

**Files:**
- Create: `src/core/engine/notes.ts`, `src/core/engine/metrics.ts`
- Test: `tests/core/notes.test.ts`, `tests/core/metrics.test.ts`

**Interfaces:**
- Consumes: `Simulation`, `TrackGraph`, `unitsOf`
- Produces:
  - `interface Note { stepId: string; kind: "fit" | "fouling" | "buffer" | "power_end" | "unclear_route" | "sequence" | "runaround"; level: "info" | "heads_up"; text: string; at?: Id }`
  - `notesFor(sim: Simulation, plan: PlanReading, g: TrackGraph): Note[]`
  - `interface Metrics { moves: number; feetTravelled: { locos: number; cars: Record<Id, number> }; switchThrows: number; couplings: number; complete: boolean }`
  - `metricsFor(sim: Simulation, g: TrackGraph): Metrics`

- [ ] **Step 1: Write the failing tests**

```ts
test("demo shove gives the exact info fit note", () => {
  expect(notesFor(...demoRun).filter(x => x.kind === "fit")).toEqual([{
    stepId: "W1", kind: "fit", level: "info", at: "RACKS",
    text: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft.",
  }]);
});
test("six cars at the racks give a heads-up that states the assumption", () => {
  // text: "6 cars at 60 ft = 360 ft, plus 10% for slack = 396 ft; the racks have 360 ft. Lengths are the general 60 ft planning length."
});
test("fit counts cars already on site", () => {});
test("a 94 ft car changes the fit numbers", () => {});
test("a car halfway through S1 gives a fouling heads-up at S1", () => {});
test("the far end of a group inside S1's zone gives a fouling heads-up even when the near end is clear", () => {});
test("a past_end step gives a buffer heads-up", () => {});
test("a route_not_established step gives an unclear_route note", () => {});
test("no note text contains an em dash or en dash", () => {
  const dashes = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  expect(allNotes.every(x => !dashes.test(x.text))).toBe(true);
});
test("demo metrics: 6 moves, 1 switch throw, 1 coupling, complete", () => {});
test("a route_not_established step makes metrics incomplete", () => {});
```

Each test asserts the exact note (kind, level, at) or metric values named in its title.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** the note rules of spec 6.4 items 5 to 11 from the engine's states only. Power end: compare the loco's place in its coupled group with the direction of travel for `shove` and `pull`. Metrics as spec 6.4: a move is one movement of one coupled group (arrival and departure count); feet travelled from `travel` segments; switch throws count changes from normal (normal = through route, all normal at the start); a step without a route makes `complete` false.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: engine notes and plan metrics`)

---

### Task 7: Layout: feet and lanes to drawing coordinates

**Files:**
- Create: `src/core/layout/layout.ts`, `src/core/layout/place.ts`
- Test: `tests/core/layout.test.ts`

**Interfaces:**
- Consumes: `TrackGraph`, `PlanReading`, `Unit`, `WorldState`
- Produces:
  - `interface DrawPoint { xFt: number; lane: number }` (lane 0 = main, positive = up the page)
  - `interface Drawing { widthFt: number; tracks: { id: Id; role: string; points: DrawPoint[] }[]; facilities: { id: Id; name: string; fromXFt: number; toXFt: number; lane: number; spots: { n: number; fromXFt: number; toXFt: number }[] }[]; compass: { left: string; right: string }; arrivalArrow: { side: "left" | "right"; label: string }; bufferStops: DrawPoint[]; boundaries: { arrival_end: "left" | "right"; far_end: "left" | "right" } }`
  - `layout(plan: PlanReading, g: TrackGraph): Drawing`
  - `interface Sprite { id: Id; kind: "loco" | "car"; type: string; loaded: boolean; lengthFt: number; mark?: string; number?: string; centre: DrawPoint; tangent: { dxFt: number; dLane: number } }`
  - `placeUnits(d: Drawing, g: TrackGraph, s: WorldState, units: Map<Id, Unit>): Sprite[]` (offstage units are omitted; a unit partly beyond a boundary is placed by its on-drawing part)
  - `pointAt(d: Drawing, g: TrackGraph, p: Pos): { at: DrawPoint; tangent: { dxFt: number; dLane: number } }`

Angles are not computed here. Render turns `tangent` into a screen angle after applying its pixel scale and lane gap.

- [ ] **Step 1: Write the failing tests**

```ts
test("demo: MAIN on lane 0 from x 0 to 1200; SPUR1 rises to lane 1 over 240 ft from x 580, ends at x 1670", () => {
  const d = layout(demoM, g);
  expect(d.tracks.find(t => t.id === "MAIN")!.points).toEqual([{ xFt: 0, lane: 0 }, { xFt: 1200, lane: 0 }]);
  expect(d.tracks.find(t => t.id === "SPUR1")!.points).toEqual([{ xFt: 580, lane: 0 }, { xFt: 820, lane: 1 }, { xFt: 1670, lane: 1 }]);
});
test("demo compass West left, East right; arrow Eastbound on the left; arrival_end maps to left", () => {});
test("entering from the right mirrors x, puts the left-side branch on lane -1, maps arrival_end to right, and simulate gives the same states", () => {});
test("two branches on the same side take lanes 1 and 2", () => {});
test("racks span x 1310 to 1670 on lane 1 with spot 1 from x 1310 to 1370", () => {});
test("placeUnits for demo step 2: C1 centre at x 1580, lane 1, tangent (1, 0), type covered_hopper_large, mark ABCX", () => {});
test("a unit on the turnout diagonal has tangent (240, 1) direction", () => {});
```

Each test asserts the exact values in its title.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement.** Diagonal over the 240 ft turnout from the points to the branch lane, then parallel. Mirroring for `enters: "right"` is applied only here (x' = widthFt - x, lane' = -lane). Compass labels come from `arrival.direction`.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: layout in feet and lanes`)

---

### Task 8: SVG renderer and side-view silhouettes

**Files:**
- Create: `src/render/render.ts`, `src/render/silhouettes.ts`, `src/render/theme.ts`
- Test: `tests/render/render.test.ts` (`// @vitest-environment happy-dom` at the top of this file only)

**Interfaces:**
- Consumes: `Drawing`, `Sprite`, `Note`, `StepStatus`
- Produces:
  - `interface RenderOptions { pxPerFt: number; laneGapPx: number; showMarks: boolean }` (`laneGapPx` default 90)
  - `fitPxPerFt(d: Drawing, widthPx: number): number`
  - `screenAngleDeg(tangent: { dxFt: number; dLane: number }, o: RenderOptions): number` (`atan2(-dLane * laneGapPx, dxFt * pxPerFt)` in degrees)
  - `renderDrawing(svg: SVGSVGElement, d: Drawing, o: RenderOptions): void`
  - `renderSprites(layer: SVGGElement, sprites: Sprite[], o: RenderOptions, status?: StepStatus): void`
  - `silhouette(type: string, kind: "loco" | "car", lengthPx: number, loaded: boolean): SVGGElement` (built with DOM methods, origin at the unit's centre on the rail)
  - `theme`: ink `#0e1013`, paper `#f2efe6`, gold `#d9c48c`, steel `#8a9199`, rail `#3b424b`, loco `#e8432f`, loaded `#e0ad4b`, empty `#7c848d`

- [ ] **Step 1: Write the failing tests**

```ts
test("draws one path per track and one box per facility", () => {});
test("labels the compass points and the arrival arrow", () => {});
test("screenAngleDeg for the 240 ft turnout is about 20.6 at 1 px/ft and about 36.9 at 0.5 px/ft with a 90 px gap", () => {
  expect(screenAngleDeg({ dxFt: 240, dLane: 1 }, { pxPerFt: 1, laneGapPx: 90, showMarks: false })).toBeCloseTo(-20.56, 1);
  expect(screenAngleDeg({ dxFt: 240, dLane: 1 }, { pxPerFt: 0.5, laneGapPx: 90, showMarks: false })).toBeCloseTo(-36.87, 1);
});
test("silhouettes exist for generic, covered_hopper_large, tank_general, boxcar_50 and six_axle; unknown types fall back to generic", () => {});
test("a sprite is drawn at its length in px", () => {});
test("loaded and empty cars differ in fill", () => {});
test("route_not_established sprites get the dashed, faded class and a 'Route not established' label", () => {});
test("a caption or mark containing <script> appears as literal text, not markup", () => {});
```

Each test asserts what its title names, using the rendered DOM.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement.** Side view sits above the rail line. Fonts: JetBrains Mono for labels, falling back to the system monospace font.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** (`feat: SVG renderer with side-view silhouettes`)

---

### Task 9: Player and private preview page

**Files:**
- Create: `src/player/player.ts`, `src/player/interpolate.ts`
- Create: `app/index.html`, `app/main.ts`
- Create: `tests/fixtures/extra-crossing.reading.json`, `tests/fixtures/extra-pickup-cutoff.reading.json`
- Create: `.claude/launch.json` (configuration `preview`: `npm run dev`, port 5173)
- Test: `tests/player/interpolate.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  - `ease(t: number): number` (`1 - (1 - t) ** 3`, as the portfolio demo)
  - `interpolate(before: WorldState, after: WorldState, step: StepResult, progress: number): WorldState` (pure; `progress` is the linear fraction of the leading end's travel; moved groups are re-laid along the path occupied before the move plus `step.travel` up to that point; for `route_not_established` it returns `after`, and the renderer fades it in)
  - `createPlayer(root: HTMLElement, plan: PlanReading): { show(step: number): void; play(): void; pause(): void; destroy(): void }`

- [ ] **Step 1: Write the failing tests**

```ts
test("progress 0 gives before and progress 1 gives after", () => {});
test("at progress 0.5 of the demo shove, C1's head is at SPUR1 465", () => {
  // the leading end travels 1130 ft: 100 on MAIN to S1, then 1030 on SPUR1; half is 565, so 465 into SPUR1
  const c1 = interpolate(sim.states[0], sim.states[1], sim.steps[1], 0.5).places.C1 as { occupies: Segment[] };
  expect(c1.occupies.at(-1)).toEqual({ track: "SPUR1", fromFt: 405, toFt: 465 });
});
test("at progress 130/1130 of the demo shove, C1 spans MAIN 550-580 and SPUR1 0-30", () => {});
test("units not in step.moved never move", () => {});
test("ease(0) = 0, ease(1) = 1, ease(0.5) = 0.875", () => {});
```

Each test asserts the values in its title.

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** `ease`, `interpolate` and `createPlayer` (caption, "Step n / N", Prev, Play/Pause, Next, dots, notes list, the "Route not established" label; the player passes `ease(t)` over 1.5 s per step). `app/main.ts` offers three plans in a dropdown: the demo, `extra-crossing` (a shove that stops with C1 across S1) and `extra-pickup-cutoff` (L1 picks up an on-site car E1, then cuts off). Each runs `validateFile`, `materialize`, `buildGraph`, `simulate`, `notesFor`, `layout`, then mounts the player.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Check it in the browser**

Start the `preview` configuration. Expected: the demo plays all 9 steps with the info fit note on step 2; `extra-crossing` shows C1 drawn across the turnout with a fouling note; `extra-pickup-cutoff` leaves E1 behind when L1 cuts off; no console errors. Take a screenshot of each for the owner.

- [ ] **Step 6: Commit** (`feat: player and private preview page`)

---

## P1 done when

1. **Behaviour:** `npm test` passes, with every test in this plan containing real assertions, including the expected-state test, the switch-crossing tests, the property test and the mirrored layout test.
2. **Types:** `npm run typecheck` passes for both the core (no DOM) and the app configuration.
3. **Build:** `npm run build` succeeds.
4. **In the browser:** the preview plays the demo, the switch-crossing plan and the pickup-then-cut-off plan as described in Task 9, Step 5.
5. **Conventions:** the ten conventions at the top of this plan are the ones in the expected-state table (confirmed by the owner on 2026-10-20).
