# P2 Editor and Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the P1 player into Release 1: a PowerPoint-like canvas editor built on one typed command set, with undo, autosave, zoom and pan, share links, standalone HTML and SVG export, tier 2 layout, and everything prepared for the repo to go public (the owner flips visibility themself, later).

**Architecture:** Every change to a plan is a `Command` applied by a pure function in `src/core/commands` that returns a new `PlanReading`; a snapshot history gives grouped undo and redo. The editor (`src/editor`, plain DOM, no framework) keeps one `EditorState`, re-runs the P1 core (graph, simulate, notes, layout) after every command, and draws with the P1 renderer into a pannable, zoomable SVG viewport. Pure editing arithmetic that needs no DOM (hit testing, following a drag through turnouts, planning the uncouple a drag implies, writing a caption) lives in `src/core/editing` so it is unit-tested in Node. Export (`src/export`) reads only core output.

**Tech Stack:** TypeScript 5.6 strict, Vite 5.4, Vitest 2.1 with happy-dom 15.11 for DOM units, Ajv 8.17 for command schemas, Playwright (added in Task 12) for browser smoke tests. No UI framework (owner decision 2026-10-23, a change from spec section 10's "React only for the editor panels"). Native `CompressionStream` for share links, `localStorage` for autosave.

**Spec:** `docs/spec.md` sections 5.6, 5.7, 6.2, 6.3, 6.6, 10, 11, 12.1, 12.2 (P2 row), 13. The P1 plan `docs/superpowers/plans/2026-10-20-p1-engine-and-player.md` holds the ten conventions and the core interfaces this plan builds on.

## Owner decisions (2026-10-23)

1. Editor panels in plain DOM, like the player. 2. Share links use `CompressionStream` (deflate-raw) and base64url. 3. Autosave in `localStorage`. 4. Standalone HTML inlines a Vite-built player bundle; fonts fall back to the system monospace. 5. Playwright smoke tests for the spec 13 editor actions. 6. Tier 2 stays in P2, last. 7. **The repo does not go public in this phase.** Task 14 prepares the Pages workflow and README only; nothing changes visibility or deploys.

## Global Constraints

- Core code (`src/core/**`) imports nothing from the DOM or any UI library. `src/editor`, `src/export`, `src/render` and `src/player` use the DOM but no framework.
- PlanReading v1 is the only public format. Commands produce a schema-valid PlanReading; a plan that is valid before a command is valid after it (Task 1 property test).
- The canvas model is rebuilt from the plan after every command. Nothing caches a world state across commands.
- One simulation: the editor, exports and notes read `simulate`, `notesFor`, `layout` and `placeUnits` from P1. Nothing re-implements plan state or distances.
- Distances are in feet from the track graph, never from drawn SVG length. Track lengths snap to 10 ft; the turnout is 240 ft, the clear point 290 ft, spots 60 ft (conventions 2 and 6).
- Nothing is ever blocked: commands never throw on a valid plan; a command that cannot do what it asks (deleting a track steps still name) still applies and leaves the engine to mark the steps `needs_attention`.
- A saved plan holds only single actions. `set_out`, `pick_up` and `runaround` are expanded before they reach `plan.work`.
- User-authored text goes in with `textContent`, never `innerHTML`. Exports escape it.
- User-facing text: plain words, no em dashes or en dashes. Every toolbar button has an icon, a word and a `title` tooltip.
- Esc cancels any drag and restores the picture. A drag shows a preview and commits one history entry on release.
- Undo and Redo are toolbar buttons as well as Ctrl+Z and Ctrl+Y.
- No proprietary railway data. Example plans are synthetic. `private-fixtures/` stays git-ignored.
- `npm test` (Vitest) and `npm run typecheck` stay green after every task. Playwright runs under `npm run test:e2e`, not under `npm test`.

## Review Focus

1. **A command names an id that no longer exists** (a step's `cars` after the car is deleted, a facility after its track is deleted). Expected: the command applies, the plan stays valid, and the step shows as `needs_attention`. Pinned in Task 1 (`deleteTrack leaves steps that name it; the plan still validates and the step is needs_attention`).
2. **A share link holding a plan from a newer schema version, or corrupt base64.** Expected: a plain message "This link could not be opened", the saved plan untouched. Pinned in Task 10.
3. **Two plans open in two tabs, both autosaving.** Expected: each tab writes only its own plan key; the index merges by plan id so neither tab drops the other's plan. Pinned in Task 3.
4. **A drag that leaves and re-enters the same track through two turnouts** (out onto the main past S1 and back into a second spur at S2). Expected: `via` lists both switches in order and the step plays that route. Pinned in Task 8.
5. **A wheel zoom mid-drag.** Expected: the drag preview keeps its feet coordinates; the committed stop is the same as it would be without the zoom. Pinned in Task 9 (`a zoom during a drag does not change the committed stop`).

## Spec 13 acceptance scenarios, where each is proven

| Scenario | Task and test |
|---|---|
| Three partial moves along one track survive save and reopen | Task 3, `three partial moves survive a save and a reopen` |
| Earlier step changed or reordered; later steps recalculate, affected ones highlighted | Task 9, `reordering a step recalculates and highlights needs_attention steps` |
| One middle car separated and moved; IDs, order and couplings survive Undo, Redo, reopen | Task 9, `a middle car moved out survives undo, redo and reopen` |
| Trailing-point spur mirrored left to right means the same moves | Task 5, `flip left/right of a facing switch gives a trailing switch; the engine states are unchanged` (and P1's mirrored layout test) |
| Loads moved toward cars already on site; fit note counts both | Task 7, `place cars on site; a shove toward them gets a fit note counting both groups` |
| A car longer than 60 ft changes the fit note | Task 7, `setCar lengthFt 89 changes the fit note text` |
| Loco leaves and comes back through a named edge | Task 8, `a drag off the arrival edge gives offstage arrival_end; a drag back in gives a stop on the main` |
| Route cannot be established; step still saves, plays, exports | Task 11, `an SVG for a route_not_established step carries the label` |
| Share link opened while another plan is saved; saved plan kept, link opens as a copy | Task 10, `opening a share link adds a copy and keeps the saved plan` |
| One drag adds an uncouple, a move and a second step; one Undo restores everything | Task 9, `one drag that needs a cut and reverses makes three steps and one history entry` |

## File structure

```
src/core/commands/commands.ts    Command union, applyCommand, CommandResult
src/core/commands/ids.ts         newId(plan, prefix)
src/core/commands/schemas.ts     COMMANDS: name, description, JSON Schema per command
src/core/commands/history.ts     createHistory: snapshots, grouped entries, undo, redo
src/core/editing/hit.ts          nearestTrackPos: drawing point to track position
src/core/editing/dragRoute.ts    followDrag: pointer samples to legs with via and stop
src/core/editing/cuts.ts         planCut: the uncouple steps a selection implies
src/core/editing/caption.ts      autoCaption for a new step
src/core/editing/runaround.ts    expandRunaround (Task 13)
src/editor/editor.ts             createEditor(root, options): mounts everything
src/editor/model.ts              EditorState, compute(plan) -> Computed
src/editor/viewport.ts           zoom, pan, fit; screen <-> DrawPoint
src/editor/toolbar.ts            buttons and drag sources
src/editor/stepStrip.ts          step list, select, reorder, delete, duplicate
src/editor/properties.ts         panel for the selected thing
src/editor/contextMenu.ts        right-click menu
src/editor/trackTools.ts         drop turnout, buffer stop, facility; stretch; flip
src/editor/carTools.ts           Add cars, Place cars dialogs
src/editor/moveTools.ts          select units, drag to make steps, train buttons
src/editor/keys.ts               keyboard shortcuts
src/editor/templates.ts          Single spur, Spur with runaround, demo
src/editor/store/storage.ts      localStorage index and plans
src/editor/store/autosave.ts     debounced save with status
src/editor/store/file.ts         download JSON, open JSON
src/export/share.ts              encodeShare, decodeShare
src/export/svg.ts                svgForStep
src/export/standalone.ts         standaloneHtml
src/player/standalone-entry.ts   window.ROPC.mount(root, plan) for the bundle
vite.player.config.ts            builds app/generated/player.iife.js
app/index.html, app/main.ts, app/editor.css
tests/core/commands.test.ts, history.test.ts, hit.test.ts, dragRoute.test.ts, cuts.test.ts, caption.test.ts, runaround.test.ts
tests/editor/*.test.ts (happy-dom), tests/export/*.test.ts (happy-dom), tests/e2e/editor.spec.ts (Playwright)
```

`tsconfig.app.json` `include` grows to `src/editor`, `src/export`, `tests/editor`, `tests/export`. `tsconfig.json` (core) stays DOM-free. Add `app/generated/` and `test-results/` to `.gitignore`.

---

### Task 1: Command set with JSON Schemas

**Files:**
- Create: `src/core/commands/commands.ts`, `src/core/commands/ids.ts`, `src/core/commands/schemas.ts`
- Test: `tests/core/commands.test.ts`

**Interfaces:**
- Consumes: `PlanReading`, `WorkStep`, `RailroadStep`, `Stop`, `Track`, `Switch`, `Facility`, `Car`, `CarType`, `CarState`, `LocoType`, `TrackRole`, `TrackEnd`, `FacilityKind`, `Direction`, `Side`, `FileProblem` from `src/core/schema/types`; `validateFile`; `cloneJson`.
- Produces:

```ts
export type FlipAxis = "up_down" | "left_right";
export type Command =
  | { name: "setTitle"; title: string; description?: string }
  | { name: "setArrival"; direction?: Direction; enters?: Side; locos?: "head" | "rear"; text?: string; stop?: Stop | null }
  | { name: "setDeparture"; direction?: Direction; text?: string; cars?: Id[] }
  | { name: "setLocos"; count: number; type?: LocoType; lengthFt?: number }
  | { name: "addTurnout"; trackId: Id; distanceFt: number; side: Side; approach: "facing" | "trailing"; branchId?: Id; branchRole?: TrackRole; branchLengthFt?: number }
  | { name: "flipTurnout"; switchId: Id; axis: FlipAxis }
  | { name: "setSwitchDistance"; switchId: Id; distanceFt: number }
  | { name: "setTrack"; trackId: Id; label?: string; role?: TrackRole; lengthFt?: number; end?: TrackEnd }
  | { name: "deleteTrack"; trackId: Id }
  | { name: "addFacility"; trackId: Id; startFt: number; lengthFt: number; label: string; kind: FacilityKind; facilityId?: Id }
  | { name: "setFacility"; facilityId: Id; label?: string; kind?: FacilityKind; startFt?: number; lengthFt?: number; spots?: number }
  | { name: "deleteFacility"; facilityId: Id }
  | { name: "addCars"; count: number; type: CarType; state: CarState; cutId?: Id; for?: Id }
  | { name: "placeCars"; count: number; type: CarType; state: CarState; at: Id; spot?: number; cutId?: Id }
  | { name: "setCar"; carId: Id; type?: CarType; state?: CarState; mark?: string; number?: string; lengthFt?: number | null }
  | { name: "deleteCar"; carId: Id }
  | { name: "addStep"; step: StepInput; index?: number }  // StepInput: any WorkStep shape with id optional (distributive Omit)
  | { name: "setStep"; stepId: Id; patch: Partial<Omit<RailroadStep, "id">> }
  | { name: "deleteStep"; stepId: Id }
  | { name: "reorderStep"; stepId: Id; index: number };

export interface CommandResult { plan: PlanReading; created: Id[]; problems: FileProblem[] }
export function applyCommand(plan: PlanReading, cmd: Command): CommandResult;
export function applyCommands(plan: PlanReading, cmds: Command[]): CommandResult;  // created and problems concatenated

// ids.ts
export function newId(plan: PlanReading, prefix: string): Id;  // "T2", "S3", "F1", "CUT2", "ST7": first n >= 1 with no collision among tracks, switches, facilities, cuts, cars, locos and steps

// schemas.ts
export interface CommandDoc { name: Command["name"]; description: string; schema: object }
export const COMMANDS: readonly CommandDoc[];  // one entry per command name, JSON Schema 2020-12 for the command object itself (with "name" as a const)
```

Rules the implementer cannot infer:
- `addTurnout` adds a switch `{ id: newId("S"), on: trackId, to: branchId ?? newId("T"), side, approach, order: next order on that track, distanceFt }` and a track `{ id: branchId, role: branchRole ?? "spur", lengthFt: branchLengthFt ?? 400, end: "buffer_stop" }` unless the branch already exists. `created` is `[branchId, switchId]` (branch first when new).
- `flipTurnout` `up_down` toggles `side`; `left_right` toggles `approach`. Nothing else changes (the engine and layout do the rest).
- `deleteTrack` removes the track, every switch `on` or `to` it, every facility on it, and recursively every branch reached only through those switches. Steps that name removed things are left as they are. `onSite` cuts `at` a removed track or facility are left as they are too (the engine marks them).
- `addCars` appends a cut `{ id: cutId ?? newId("CUT"), cars: count, state, carType: type, for?, list: [{ id: newId("C") ... }] }`; ids are allocated one after another so five cars get five fresh ids. `placeCars` appends to `consist.onSite` the same way. `created` lists the cut id then the car ids.
- `setCar` with `lengthFt: null` deletes the car's `lengthFt`. `deleteCar` removes the car from its cut's `list` and decrements `cars`; a cut left with zero cars is removed.
- `addStep` inserts at `index` (default: end of `work`) with `id: step.id ?? newId("ST")`. `reorderStep` moves the step to `index` in the list after removal. `setStep` replaces only the keys in `patch`; a key set to `undefined` is deleted.
- `setArrival` with `stop: null` deletes `arrival.stop`.
- Unknown ids: the command returns the plan unchanged with one problem `{ path: "<command>.<field>", message: "no <thing> with id <id>", repaired: false }`.
- `applyCommand` never mutates its input (`cloneJson` first).

- [x] **Step 1: Write the failing tests**

```ts
test("addTurnout on the demo adds S2 and T1 with a 400 ft spur and a buffer stop", () => {
  const r = applyCommand(demo, { name: "addTurnout", trackId: "MAIN", distanceFt: 1400, side: "right", approach: "trailing" });
  expect(r.created).toEqual(["T1", "S2"]);
  expect(r.plan.switches[1]).toMatchObject({ id: "S2", on: "MAIN", to: "T1", side: "right", approach: "trailing", order: 2, distanceFt: 1400 });
  expect(r.plan.tracks[2]).toEqual({ id: "T1", role: "spur", lengthFt: 400, end: "buffer_stop" });
  expect(demo.switches).toHaveLength(1); // input untouched
});
test("flipTurnout up_down toggles side; left_right toggles approach", () => { /* S1 left facing -> right facing -> right trailing */ });
test("deleteTrack SPUR1 removes S1 and RACKS and leaves the shove step naming RACKS", () => {
  const r = applyCommand(demo, { name: "deleteTrack", trackId: "SPUR1" });
  expect(r.plan.switches).toEqual([]);
  expect(r.plan.facilities).toEqual([]);
  expect(r.plan.work.some(w => (w as RailroadStep).to === "RACKS")).toBe(true);
  expect(validateFile(r.plan).plan).not.toBeNull();
});
test("deleteTrack leaves steps that name it; the plan still validates and the step is needs_attention", () => {
  const r = applyCommand(demo, { name: "deleteTrack", trackId: "SPUR1" });
  const sim = simulate(r.plan, buildGraph(r.plan));
  expect(sim.steps[1]!.status).toBe("needs_attention");
});
test("addCars 3 covered hoppers loaded makes CUT1 with C6, C7, C8", () => {
  const r = applyCommand(demo, { name: "addCars", count: 3, type: "covered_hopper_large", state: "loaded" });
  expect(r.created).toEqual(["CUT1", "C6", "C7", "C8"]);
  expect(r.plan.consist.cuts[1]!.list!.map(c => c.id)).toEqual(["C6", "C7", "C8"]);
});
test("placeCars 2 empties at RACKS spot 1 appends an onSite cut", () => {});
test("deleteCar C3 shrinks LOADS to 4 cars; deleting the last car removes the cut", () => {});
test("setCar lengthFt null deletes the length", () => {});
test("addStep without index appends and allocates ST1; reorderStep moves it to 0", () => {});
test("setStep deletes keys patched to undefined", () => {});
test("unknown ids: plan unchanged, one problem with the command path", () => {
  const r = applyCommand(demo, { name: "setTrack", trackId: "NOPE", lengthFt: 500 });
  expect(r.plan).toEqual(demo);
  expect(r.problems).toEqual([{ path: "setTrack.trackId", message: "no track with id NOPE", repaired: false }]);
});
test("every command schema compiles with Ajv and accepts its example", () => {
  const ajv = new Ajv2020({ strict: true });
  for (const doc of COMMANDS) expect(ajv.validate(doc.schema, EXAMPLES[doc.name])).toBe(true);
  expect(COMMANDS.map(c => c.name).sort()).toEqual(ALL_COMMAND_NAMES.sort());
});
test("property: 300 random commands on the demo keep the plan valid and never throw", () => {
  // seeded PRNG (seed 20261023), pick a command with ids drawn from the current plan or a fresh bogus id,
  // after each: validateFile(plan).plan !== null, and every car id across all cut lists is unique
});
```

`EXAMPLES` is one literal command per name, in the test file. `ALL_COMMAND_NAMES` is the 20 names above.

- [x] **Step 2: Run to verify failure:** `npx vitest run tests/core/commands.test.ts`, FAIL (module not found).
- [x] **Step 3: Implement `ids.ts`, `commands.ts`, `schemas.ts`.** Schemas are hand-written objects; keep every property's `description` to one plain sentence, since they will be handed to a model as tool definitions later.
- [x] **Step 4: Run tests and typecheck:** `npx vitest run tests/core/commands.test.ts && npm run typecheck`, PASS.
- [x] **Step 5: Commit:** `git add src/core/commands tests/core/commands.test.ts && git commit -m "feat(commands): typed command set with JSON Schemas"`.

---

### Task 2: History with grouped undo and redo

**Files:**
- Create: `src/core/commands/history.ts`
- Test: `tests/core/history.test.ts`

**Interfaces:**
- Consumes: `applyCommands`, `Command`, `CommandResult` from Task 1.
- Produces:

```ts
export interface HistoryEntry { label: string; commands: Command[]; before: PlanReading; after: PlanReading; created: Id[] }
export interface History {
  readonly plan: PlanReading;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** One entry however many commands; returns the result of applying them. A result whose plan equals the current plan adds no entry. */
  dispatch(commands: Command | Command[], label: string): CommandResult;
  undo(): boolean;
  redo(): boolean;
  /** Replace the plan without an entry and clear both stacks (open a file, pick a template). */
  reset(plan: PlanReading): void;
  /** Called after every change to `plan`, with the entry label or "undo", "redo", "reset". */
  subscribe(fn: (plan: PlanReading, cause: string) => void): () => void;
  /** Undo entries, newest last, for an undo menu. */
  entries(): readonly HistoryEntry[];
}
export const HISTORY_LIMIT = 200;
export function createHistory(initial: PlanReading): History;
```

- [x] **Step 1: Write the failing tests**

```ts
test("dispatching three commands under one label undoes in one step", () => {
  const h = createHistory(demo);
  h.dispatch([
    { name: "addTurnout", trackId: "MAIN", distanceFt: 1400, side: "right", approach: "trailing" },
    { name: "setTrack", trackId: "T1", lengthFt: 600 },
    { name: "addFacility", trackId: "T1", startFt: 300, lengthFt: 300, label: "Dock", kind: "warehouse" }
  ], "add a spur");
  expect(h.plan.tracks).toHaveLength(3);
  expect(h.undo()).toBe(true);
  expect(h.plan).toEqual(demo);
  expect(h.canRedo).toBe(true);
  expect(h.redo()).toBe(true);
  expect(h.plan.facilities).toHaveLength(2);
});
test("a no-op command adds no entry", () => { h.dispatch({ name: "setTitle", title: demo.title }, "rename"); expect(h.canUndo).toBe(false); });
test("a new dispatch after undo drops the redo stack", () => {});
test("reset clears both stacks and notifies with cause reset", () => {});
test("subscribers get the label as cause; unsubscribe stops calls", () => {});
test("the stack is capped at HISTORY_LIMIT entries, oldest dropped", () => {});
test("undo after deleting a car restores the same car id in the same cut position", () => {});
```

- [x] **Step 2: Run to verify failure.** `npx vitest run tests/core/history.test.ts`, FAIL.
- [x] **Step 3: Implement `history.ts`.** Snapshots, not inverse commands: `before` and `after` are the whole plan (plans are a few KB). Equality for the no-op check is `JSON.stringify` of both.
- [x] **Step 4: Run tests and typecheck.** PASS.
- [x] **Step 5: Commit:** `git commit -m "feat(commands): history with grouped undo and redo"`.

---

### Task 3: Browser storage, autosave, JSON download and open

**Files:**
- Create: `src/editor/store/storage.ts`, `src/editor/store/autosave.ts`, `src/editor/store/file.ts`
- Modify: `tsconfig.app.json` (add `src/editor`, `src/export`, `tests/editor`, `tests/export`)
- Test: `tests/editor/storage.test.ts` (happy-dom)

**Interfaces:**
- Consumes: `History` (Task 2), `validateFile`, `materialize`.
- Produces:

```ts
// storage.ts
export interface SavedPlanMeta { localId: string; title: string; updatedAt: string /* ISO */ }
export const INDEX_KEY = "ropc:index";
export const LAST_KEY = "ropc:last";
export function planKey(localId: string): string;    // `ropc:plan:${localId}`
export function newLocalId(): string;                  // 12 chars from crypto.getRandomValues, base36
export function listPlans(storage?: Storage): SavedPlanMeta[];              // newest first; a corrupt index returns []
export function loadPlan(localId: string, storage?: Storage): PlanReading | null;  // runs validateFile + materialize; null when missing or unreadable
export function savePlan(localId: string, plan: PlanReading, storage?: Storage): void;  // writes the plan key, then re-reads the index and upserts this id only
export function deletePlan(localId: string, storage?: Storage): void;
export function lastOpenedId(storage?: Storage): string | null;
export function setLastOpenedId(localId: string, storage?: Storage): void;

// autosave.ts
export type SaveStatus = "saved" | "saving" | "failed";
export const SAVE_DELAY_MS = 300;
export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = { saved: "Saved in this browser", saving: "Saving", failed: "Could not save in this browser" };
export function attachAutosave(history: History, localId: string, onStatus: (s: SaveStatus) => void, storage?: Storage): () => void;  // returns detach; saves on every history change after SAVE_DELAY_MS of quiet; a thrown setItem reports "failed"

// file.ts
export function planFileName(plan: PlanReading): string;   // title lower-cased, runs outside [a-z0-9] become "-", trimmed of "-", + ".reading.json"; "plan.reading.json" when empty
export function downloadJson(plan: PlanReading, doc?: Document): void;   // Blob + <a download>, 2-space JSON
export function readPlanFile(file: File): Promise<{ plan: PlanReading | null; problems: FileProblem[] }>;  // text -> JSON.parse (a parse error is one problem) -> validateFile -> materialize
```

- [x] **Step 1: Write the failing tests** (`// @vitest-environment happy-dom`)

```ts
test("savePlan then loadPlan round-trips the demo and lists it newest first", () => {});
test("two ids saved in turn keep both index entries, and re-saving the first keeps the second", () => {});
test("a corrupt index lists nothing and a later save rebuilds it with one entry", () => {});
test("autosave writes once after SAVE_DELAY_MS for three quick changes and reports saving then saved", async () => { vi.useFakeTimers(); /* ... */ });
test("autosave reports failed when setItem throws", () => {});
test("three partial moves survive a save and a reopen", () => {
  // dispatch three addStep shoves along SPUR1 with stops at ft 400, 500, 600 end lead; save; loadPlan; simulate both; expect equal places for L1 after steps 2, 3 and 4
});
test("planFileName of the demo is how-a-train-services-a-customer.reading.json", () => {});
test("readPlanFile rejects garbage with one problem and a null plan", async () => {});
```

- [x] **Step 2: Run to verify failure.** FAIL.
- [x] **Step 3: Implement the three files and widen `tsconfig.app.json`.**
- [x] **Step 4: Run `npm test && npm run typecheck`.** PASS.
- [x] **Step 5: Commit:** `git commit -m "feat(editor): browser storage, autosave and JSON files"`.

---

### Task 4: Editor shell: viewport with zoom and pan, toolbar, step strip, properties, templates

**Files:**
- Create: `src/editor/model.ts`, `src/editor/viewport.ts`, `src/editor/toolbar.ts`, `src/editor/stepStrip.ts`, `src/editor/properties.ts`, `src/editor/keys.ts`, `src/editor/templates.ts`, `src/editor/editor.ts`, `app/editor.css`
- Modify: `app/index.html`, `app/main.ts`
- Test: `tests/editor/viewport.test.ts`, `tests/editor/editor.test.ts`, `tests/editor/templates.test.ts`

**Interfaces:**
- Consumes: `History`, autosave, storage, file (Tasks 2 and 3); `buildGraph`, `simulate`, `notesFor`, `layout`, `placeUnits`, `unitsOf`, `renderDrawing`, `renderSprites`, `renderOptions`, `frameOf`, `fitPxPerFt`, `toScreen`, `captionFor`, `verbLabel`, `createPlayer`.
- Produces:

```ts
// model.ts
export interface Computed { g: TrackGraph; sim: Simulation; notes: Note[]; drawing: Drawing; units: Map<Id, Unit> }
export function compute(plan: PlanReading): Computed;
export type Selection =
  | { kind: "none" } | { kind: "track"; id: Id } | { kind: "switch"; id: Id } | { kind: "facility"; id: Id }
  | { kind: "units"; ids: Id[] } | { kind: "step"; id: Id | "arrival" | "departure" };
export interface EditorState { plan: PlanReading; computed: Computed; stepIndex: number /* into sim.steps */; selection: Selection; showSpots: boolean }

// viewport.ts
export interface View { pxPerFt: number; laneGapPx: number; panX: number; panY: number }   // pan in drawing px
export const ZOOM_STEP = 1.25; export const MIN_PX_PER_FT = 0.05; export const MAX_PX_PER_FT = 4;
export function fitView(drawing: Drawing, widthPx: number, heightPx: number): View;        // fitPxPerFt, lane gap 90, centred
export function zoomAt(v: View, factor: number, anchorPx: { x: number; y: number }): View;  // keeps the drawing point under the anchor still, clamps pxPerFt
export function panBy(v: View, dx: number, dy: number): View;
export function screenToDrawing(v: View, frame: Frame, p: { x: number; y: number }): DrawPoint;   // inverse of toScreen plus pan
export function viewBoxOf(v: View, frame: Frame, widthPx: number, heightPx: number): string;

// templates.ts
export interface Template { id: "single_spur" | "spur_with_runaround" | "demo"; label: string; make(): PlanReading }
export const TEMPLATES: readonly Template[];   // single_spur and demo now; spur_with_runaround added in Task 13

// editor.ts
export interface EditorOptions { localId?: string; plan?: PlanReading; storage?: Storage }
export interface Editor { state(): EditorState; history: History; dispatch: History["dispatch"]; select(s: Selection): void; showStep(i: number): void; view(): View; setView(v: View): void; fit(): void; setStatus(text: string): void; destroy(): void; root: HTMLElement }
export function createEditor(mount: HTMLElement, options?: EditorOptions): Editor;
```

Layout of `createEditor` (CSS grid, class names fixed so tests and Playwright can find them): `.toolbar` across the top; `.step-strip` left (220 px); `.canvas` centre holding one `<svg class="plan">` inside `.stage`; `.properties` right (280 px); `.status` bottom with `.save-status` text and a `.message` span for `setStatus`. Toolbar buttons in order, each `button.tool[data-tool=...]` with an inline SVG icon and a word: New, Open, Download, Share (disabled until Task 10), Undo, Redo, Turnout, Track end, Facility, Add cars, Place cars, Zoom in, Zoom out, Fit plan, Play. The Play button mounts the P1 player in a `<dialog class="play">` with a Close button.

Behaviour fixed here:
- The canvas draws `renderDrawing` once per plan change at `pxPerFt = 1` and `laneGapPx = 90`, then applies `View` through the svg `viewBox` only. Zoom and pan never re-render tracks; sprites are re-placed from `placeUnits` for `stepIndex`.
- Wheel zooms around the pointer by `ZOOM_STEP`; dragging on the background pans; Fit plan refits; the view does not refit on a plan change (spec: "the drawing holds still while you work").
- The step strip lists `sim.steps` as `li.step` cards with number, `verbLabel`, caption, a `.note-dot` when `notes` has one for the step, and the status as a class (`needs_attention`, `route_not_established`, `past_end`). Clicking shows that step. Arrow up and down move the current step.
- The properties panel shows a form for the selection: plan (title, arrival direction, enters, locos head or rear and count and type, departure direction), track (name, role, length, end), switch (side, approach, distance, two flip buttons), facility (name, kind, start, length, spots, Show spots), units (per car type, state, mark, number, length), step (text, callout text). Every input dispatches one command on `change` with the field name as label.
- Keys in `keys.ts`: Ctrl+Z undo, Ctrl+Y and Ctrl+Shift+Z redo, Delete deletes the selected step, car, facility or track (tracks ask "Delete <name> and everything on it?" with `confirm`), Esc clears selection, Ctrl+C and Ctrl+V copy and paste the selected step (paste inserts after the current step with a new id). Keys are ignored while an input has focus.
- `app/main.ts`: on load, if `location.hash` is empty, open `lastOpenedId()` or, when there is none, the demo template saved under a new local id. New opens a `<dialog class="new-plan">` listing `TEMPLATES` and `listPlans()`.

- [x] **Step 1: Write the failing tests**

```ts
// viewport.test.ts (node)
test("zoomAt keeps the drawing point under the anchor fixed", () => {});
test("zoom clamps between MIN_PX_PER_FT and MAX_PX_PER_FT", () => {});
test("screenToDrawing inverts toScreen after a pan", () => {});
// templates.test.ts (node)
test("single_spur makes a valid plan with one main, one facing left spur of 600 ft, a 300 ft facility with 5 spots, one loco and no cars; the arrival is the only work-free step", () => {});
test("every template validates and simulates with no needs_attention steps", () => {});
// editor.test.ts (happy-dom)
test("createEditor mounts toolbar, strip, canvas, properties and status", () => {});
test("the strip has one card per sim step and the current one is marked", () => {});
test("Undo and Redo buttons are disabled on a fresh plan and enable after a dispatch", () => {});
test("changing the title input dispatches setTitle", () => {});
test("a plan change does not change the view", () => {});
test("Fit plan resets the view to fitView", () => {});
test("Ctrl+Z undoes; Delete on a selected step removes it", () => {});
```

- [x] **Step 2: Run to verify failure.** FAIL.
- [x] **Step 3: Implement.** Keep each file to its one job. The editor subscribes to history and does: `computed = compute(plan)`, re-render tracks, re-place sprites, re-fill strip and properties. Replace the P1 picker in `app/main.ts`; the three P1 plans stay reachable through New (demo template) and Open.
- [x] **Step 4: Run `npm test && npm run typecheck`, then open `npm run dev` and check: the demo opens, wheel zooms under the pointer, drag pans, Fit refits, strip shows 9 steps, the title edit sticks after a reload.**
- [x] **Step 5: Commit:** `git commit -m "feat(editor): shell with viewport, toolbar, step strip and properties"`.

---

### Task 5: Hit testing and track building: turnout, flip, stretch, track end, right-click

**Files:**
- Create: `src/core/editing/hit.ts`, `src/editor/trackTools.ts`, `src/editor/contextMenu.ts`
- Test: `tests/core/hit.test.ts`, `tests/editor/trackTools.test.ts`

**Interfaces:**
- Consumes: `Drawing`, `pointAt`, `TrackGraph`, `View`, `screenToDrawing`, `Editor`.
- Produces:

```ts
// hit.ts
export interface TrackHit { track: Id; ft: number; at: DrawPoint; laneDistance: number /* |lane diff| */ }
export const HIT_LANES = 0.45;   // a point further than this from every track hits nothing
export function nearestTrackPos(d: Drawing, g: TrackGraph, p: DrawPoint): TrackHit | null;   // nearest by lane distance, ties by x; ft is clamped to [0, totalFt] and rounded to 10
export function guessTurnout(d: Drawing, hit: TrackHit, pointerPath: DrawPoint[]): { side: Side; approach: "facing" | "trailing" };
// side: the pointer's last lane relative to the track's lane, mapped back through the drawing's mirror (drawing.boundaries) to the arriving train's left or right;
// approach: facing when the pointer's net x movement over its last 5 samples points toward drawing.boundaries.far_end, else trailing; a still pointer gives facing.

// trackTools.ts
export function attachTrackTools(editor: Editor): () => void;
// Toolbar drags for Turnout and Track end; an end handle (circle.track-end-handle[data-track]) on every branch end; Flip buttons in the switch properties.
```

Behaviour fixed here:
- Dragging Turnout from the toolbar: a ghost switch follows the nearest track hit; drop dispatches `addTurnout` with `guessTurnout`, label "add turnout"; the new switch is selected; the properties show its distance, side, approach and the flip buttons. Drop with no hit does nothing.
- Dragging Track end onto a branch dispatches `setTrack { end: "buffer_stop" }`; onto the main it is refused with `setStatus("The main line continues off the drawing")`.
- Stretching: dragging a branch's end handle previews `setTrack { lengthFt }` in 10 ft steps (minimum 60) by applying the command to a scratch plan and redrawing; a `text.drag-label` shows "<n> ft"; release commits one entry "stretch <name>"; Esc restores.
- Right-click on a track opens `.context-menu` with Rename, Main, Siding, Spur, Set length, Delete. Rename and Set length use `prompt`; Delete uses the same confirm as the Delete key.

- [x] **Step 1: Write the failing tests**

```ts
// hit.test.ts
test("a point on the demo main at xFt 700 lane 0.1 hits MAIN ft 700", () => {});
test("a point on SPUR1's parallel stretch hits SPUR1 with ft measured from the points", () => {});
test("a point 0.5 lanes from every track hits nothing", () => {});
test("on a right-entering plan the hit ft is still measured from the arrival end", () => {});
test("guessTurnout: pointer above the main moving toward the far end is left facing; below moving back is right trailing", () => {});
// trackTools.test.ts (happy-dom, pointer events dispatched on the svg)
test("dropping Turnout on the main at 1400 ft adds a trailing right switch when dragged down and back", () => {});
test("flip left/right of a facing switch gives a trailing switch; the engine states are unchanged", () => {
  // a plan whose only move is along the main; flip S1; expect sim.states deep-equal before and after
});
test("stretching SPUR1's end to 650 ft commits one entry and shows '650 ft' during the drag", () => {});
test("Esc during a stretch restores the length and adds no entry", () => {});
test("Track end dropped on the main is refused with the status message", () => {});
```

- [x] **Step 2: Run to verify failure.** FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run tests and typecheck; in the browser drop a turnout, flip it both ways, stretch it.**
- [x] **Step 5: Commit:** `git commit -m "feat(editor): place and flip turnouts, stretch track, right-click menu"`.

---

### Task 6: Facilities: drop, size, spots

**Files:**
- Modify: `src/editor/trackTools.ts` (facility drag and end handles), `src/editor/properties.ts`
- Test: `tests/editor/facilityTools.test.ts`

**Interfaces:**
- Consumes: `addFacility`, `setFacility`, `nearestTrackPos`.
- Produces: facility end handles `circle.facility-handle[data-facility][data-end=start|end]`; the `Show spots` checkbox sets `EditorState.showSpots` (passed to `renderOptions`).

Behaviour fixed here:
- Dropping Facility on a track dispatches `addFacility { startFt: max(0, hit.ft - 150), lengthFt: 300, label: "Facility <n>", kind: "other" }`, label "add facility"; `spots` is left unset (the graph derives 60 ft spots).
- Dragging either handle previews `setFacility` with `startFt` or `lengthFt` in 10 ft steps (minimum 60 ft), with the drag label "<n> ft, <k> cars" where `k = floor(lengthFt / 60)`.
- Deleting a facility leaves steps naming it (the engine marks them).

- [x] **Step 1: Write the failing tests**

```ts
test("dropping Facility on SPUR1 at ft 500 adds a 300 ft facility from 350 named Facility 1", () => {});
test("dragging the end handle to 420 ft shows '420 ft, 7 cars' and commits one entry", () => {});
test("Show spots re-renders with spot ticks", () => {});
test("deleting a facility that a step names leaves the step and marks it needs_attention", () => {});
```

- [x] **Step 2 to 4: Fail, implement, pass (tests, typecheck, browser check).**
- [x] **Step 5: Commit:** `git commit -m "feat(editor): facilities with sizing and spot display"`.

---

### Task 7: Cars: add, place on site, per-car properties, locos

**Files:**
- Create: `src/editor/carTools.ts`, `src/core/schema/labels.ts` (`CAR_TYPE_LABELS: Record<CarType, string>`, `LOCO_TYPE_LABELS`, `FACILITY_KIND_LABELS`, plain words such as "Covered hopper, large")
- Modify: `src/editor/properties.ts`
- Test: `tests/editor/carTools.test.ts`

**Interfaces:**
- Consumes: `addCars`, `placeCars`, `setCar`, `deleteCar`, `setLocos`, `CAR_TYPES`.
- Produces: `attachCarTools(editor): () => void`; a `<dialog class="add-cars">` with count (1 to 50), type (select over `CAR_TYPES` with `CAR_TYPE_LABELS`), loaded or empty, and for Place cars a track or facility select plus spot.

Behaviour fixed here:
- Add cars appends to the arriving train; the new cars are selected and the strip returns to the arrival step so the person sees them.
- Place cars adds an `onSite` cut at the chosen track or facility (and spot); the strip shows the arrival.
- Unit properties for a multi-selection apply the change to every selected car (one history entry, label "set <field>").
- Locos: count and type live in the plan panel's arrival section.

- [x] **Step 1: Write the failing tests**

```ts
test("Add cars 3 tank_general empty appends three cars to the train and selects them", () => {});
test("Place cars 2 boxcar_60 empty at RACKS spot 1 adds an onSite cut and the arrival state shows them at spots 1 and 2", () => {});
test("place cars on site; a shove toward them gets a fit note counting both groups", () => {
  // demo + 2 on-site cars at RACKS; the shove's fit note text mentions 7 cars
});
test("setCar lengthFt 89 changes the fit note text", () => {
  // demo; set C1 lengthFt 89; the shove's fit note text differs from before and contains "89"
});
test("changing type on a 3-car selection is one history entry", () => {});
test("setLocos count 2 gives L1 and L2 in the arrival state", () => {});
```

- [x] **Step 2 to 4: Fail, implement, pass.**
- [x] **Step 5: Commit:** `git commit -m "feat(editor): add and place cars, per-car properties, locos"`.

---

### Task 8: Drag arithmetic in core: following the route, the cut a drag implies, captions

**Files:**
- Create: `src/core/editing/dragRoute.ts`, `src/core/editing/cuts.ts`, `src/core/editing/caption.ts`
- Test: `tests/core/dragRoute.test.ts`, `tests/core/cuts.test.ts`, `tests/core/caption.test.ts`

**Interfaces:**
- Consumes: `TrackGraph.walk`, `TrackGraph.route`, `WorldState`, `Segment`, `offsetOnPath`, `pathLength`, `Drawing`, `nearestTrackPos`, `FacilityInfo`.
- Produces:

```ts
// dragRoute.ts
export const REVERSAL_FT = 60;      // a turn-back shorter than this is a wobble
export interface DragStart { groupPath: Segment[] /* rear to head, canonical */; grabbed: Id; units: Id[] }
export interface Leg { stop: Stop; via: Id[]; to?: Id /* facility id when the stop snaps to a spot, "offstage" when offstage */; spot?: number }
export interface DragResult { legs: Leg[]; reversed: boolean }
/** Turn pointer samples (drawing points, in order) into the legs the drag means. The lead end for each leg is the end that moves first along it. */
export function followDrag(d: Drawing, g: TrackGraph, start: DragStart, samples: DrawPoint[]): DragResult | null;   // null when no sample hits a track and none is off the edge
export function snapToSpot(g: TrackGraph, pos: Pos): { facility: Id; spot: number } | null;   // when pos lies within a facility's spots, the spot whose far edge is nearest

// cuts.ts
export interface CutPlan { uncouples: [Id, Id][]; movingUnits: Id[] /* rear to head */ }
/** The uncouple steps needed so `selected` can move as one group. A selection must be a contiguous run of one group; otherwise null. A run in the middle needs two uncouples. */
export function planCut(state: WorldState, selected: Id[]): CutPlan | null;

// caption.ts
export function autoCaption(plan: PlanReading, state: WorldState, movingUnits: Id[], leg: Leg, verb: "shove" | "pull" | "run_light" | "move"): string;
// "Shove 5 loads to Unloading racks", "Pull 2 empties onto Main line", "Run light off the arrival end", "Move 3 cars to Customer siding".
// Loads and empties are counted from state.loaded; a mixed set says "cars"; a loco alone is run light; the place is the facility or track name, or "off the arrival end" / "off the far end".
```

Rules the implementer cannot infer:
- Samples are reduced to track hits; consecutive hits on different tracks joined by a switch add that switch to `via` (in order, no repeats in a row). Direction of travel for a leg is from the group's position toward the first hit more than 10 ft along the track from the grab point.
- Reversal: keep the running offset along the followed path; when the pointer comes back more than `REVERSAL_FT` from the furthest offset reached, the leg ends at the furthest point and a new leg starts there (`reversed: true`). At most two legs; further reversals extend the second.
- A sample whose x is outside the main's drawn extent ends the drag with `stop: { offstage: boundary }` for that screen side, read from `drawing.boundaries`, `to: "offstage"`.
- Otherwise the final stop is `{ track, ft, end: "lead" }` where `ft` is the lead unit's front after moving the group along the followed path by the pointer's travel; `snapToSpot` on that lead position wins when it returns a spot (then `to` is the facility, `spot` is set, and `stop` is still written so the saved step is exact).
- `verb` for the caption is picked by the editor from the moving units: a loco alone is `run_light`; a loco at the trailing end is `shove`; a loco at the leading end is `pull`; no loco is `move`.

- [x] **Step 1: Write the failing tests**

```ts
// dragRoute.test.ts, on the demo's arrival state and graph (train on MAIN 100 to 480, head at 480)
test("dragging the train 400 ft along the main gives one leg on MAIN with the lead at 880", () => {});
test("dragging up into SPUR1 records via S1 and snaps to spot 5 of RACKS when dropped at the racks", () => {});
test("a 40 ft wobble back is not a reversal; a 100 ft turn-back splits into two legs", () => {});
test("a drag out past S1 on the main and back into a second spur lists via S1 then S2", () => { /* demo + addTurnout at MAIN 1400 side left facing */ });
test("a drag off the arrival edge gives offstage arrival_end; a drag back in gives a stop on the main", () => {});
test("samples that never hit a track return null", () => {});
// cuts.test.ts
test("selecting the whole group needs no uncouple", () => {});
test("selecting C1 and C2 at the head of [L1,C5,C4,C3,C2,C1] needs one uncouple between C3 and C2", () => {});
test("selecting C3 alone needs two uncouples", () => {});
test("a non-contiguous selection returns null", () => {});
// caption.test.ts
test("the demo shove reads 'Shove 5 loads to Unloading racks'", () => {});
test("a run light to offstage reads 'Run light off the arrival end'", () => {});
test("mixed loads and empties read as cars", () => {});
```

- [x] **Step 2 to 4: Fail, implement, pass. No DOM in any of these files.**
- [x] **Step 5: Commit:** `git commit -m "feat(editing): follow a drag through turnouts, plan cuts, write captions"`.

---

### Task 9: Steps by dragging in the editor

**Files:**
- Create: `src/editor/moveTools.ts`
- Modify: `src/editor/stepStrip.ts` (reorder by drag, duplicate), `src/editor/editor.ts`, `src/editor/toolbar.ts` (Stop and Note buttons)
- Test: `tests/editor/moveTools.test.ts`, `tests/editor/stepStrip.test.ts`

**Interfaces:**
- Consumes: Task 8 functions; `addStep`, `deleteStep`, `reorderStep`, `setStep`.
- Produces: `attachMoveTools(editor): () => void`. Selection on the canvas: click a `g.unit` selects it, shift-click adds, Shift-drag on the background draws a `rect.marquee`. Train buttons rendered in a `g.train-buttons` layer above the current step's sprites: `g.scissors` between each adjacent pair, `g.link` at each free coupler facing another group within 100 ft, `g.load` and `g.unload` over cars standing within a facility.

Behaviour fixed here:
- A drag of selected units always inserts after `stepIndex` (the arrival is index 0; a drag on the departure inserts before it). The strip then shows the last inserted step.
- Dispatch for one drag, in one `history.dispatch` with label "move": `planCut` uncouples as `uncouple` steps with `between`, then one step per leg with `do: "shove"` when the verb is shove or move, `"pull"` for pull and `"run_light"` for a loco alone, `cars: movingUnits`, `to`, `spot`, `stop`, `via`, `text: autoCaption(...)`. The engine names the verb from the state when it plays it.
- Preview: on every pointer move with at least one hit, apply the would-be commands to a scratch plan, `compute` it, and paint its last new state; on release, dispatch for real; Esc discards.
- Scissors dispatches `addStep uncouple between [a, b]` (rising-ft order); link dispatches `couple` with `cars` of the moving group and `to` the other group's nearest unit; Load and Unload dispatch a customer step with the cars at that facility; Stop dispatches `stop` with `callout: { text: "Stop here" }`; Note dispatches `note` with `text: "Note"`. Each selects the new step so its text can be edited at once.
- Strip: drag a card to reorder (`reorderStep`), Ctrl+C and Ctrl+V duplicate (`addStep` with a copy and a new id), Delete removes. Cards show the status word when the status is not ok.

- [x] **Step 1: Write the failing tests**

```ts
test("dragging the arrived train 300 ft along the main adds one step whose stop is MAIN ft 780 lead", () => {});
test("one drag that needs a cut and reverses makes three steps and one history entry", () => {
  // select C1, C2 on the arrival; drag along the main 300 ft, then back 200 ft; work gains [uncouple, shove, shove]; history.entries().length === 1; undo restores the demo
});
test("a middle car moved out survives undo, redo and reopen", () => {
  // select C3 on the arrival, drag 200 ft; two uncouples then a move; undo; redo; savePlan and loadPlan; same car ids, coupled groups and places
});
test("reordering a step recalculates and highlights needs_attention steps", () => {
  // move the demo's run_light-away step before the cut_off; expect at least one card with class needs_attention and the sim recomputed
});
test("scissors between C3 and C4 adds an uncouple step with between [C4, C3] in rising-ft order", () => {});
test("Unload over cars at RACKS adds a customer unload step naming those cars", () => {});
test("Esc during a drag discards the preview and adds no entry", () => {});
test("a zoom during a drag does not change the committed stop", () => {
  // pointerdown, move, wheel (zoom), move to the same drawing point, pointerup; the stop equals the no-zoom case
});
test("Ctrl+C then Ctrl+V duplicates the selected step after itself with a new id", () => {});
```

- [x] **Step 2 to 4: Fail, implement, pass. Browser check: build the demo plan from the Single spur template by dragging only.**
- [x] **Step 5: Commit:** `git commit -m "feat(editor): make steps by dragging, train buttons, step strip editing"`.

---

### Task 10: Share link

**Files:**
- Create: `src/export/share.ts`
- Modify: `app/main.ts` (open a hash on load), `src/editor/toolbar.ts` (Share button and dialog)
- Test: `tests/export/share.test.ts` (happy-dom; Node 22 has `CompressionStream`)

**Interfaces:**

```ts
export const SHARE_PREFIX = "#plan=v1.";
export const SHARE_NOTICE = "This link holds the whole plan, including names, reporting marks and callouts. Anyone with it can open it.";
export const SHARE_FAILED_TEXT = "This link could not be opened";
export async function encodeShare(plan: PlanReading, base?: string): Promise<string>;   // base + SHARE_PREFIX + base64url(deflate-raw(JSON)); engine notes are never included; plan.questions and plan.provenance are kept
export async function decodeShare(hash: string): Promise<{ plan: PlanReading | null; problems: FileProblem[] }>;  // null with one problem for a wrong prefix, bad base64, a failed inflate or a failed schema check; runs validateFile then materialize
export function isShareHash(hash: string): boolean;
```

Behaviour fixed here:
- Share opens `<dialog class="share">` with the link in a read-only input, a Copy button (`navigator.clipboard.writeText`), the `SHARE_NOTICE` line, and the link length in characters.
- On load with a share hash: decode, save as a new local plan whose title is `"Copy of " + title` (unless it already starts with "Copy of "), set it as last opened, clear the hash with `history.replaceState`, and `setStatus("Opened from a link as a copy")`. On failure, `setStatus(SHARE_FAILED_TEXT)` and open the last plan as usual. Saved plans are untouched either way.

- [ ] **Step 1: Write the failing tests**

```ts
test("encode then decode round-trips the demo", async () => {});
test("the demo link is under 2000 characters", async () => {});
test("a wrong prefix, bad base64 and a newer schemaVersion each give a null plan and one problem", async () => {});
test("opening a share link adds a copy and keeps the saved plan", async () => {
  // storage with plan A saved; open the demo's hash; listPlans has 2; the copy's title starts with "Copy of"; A unchanged
});
```

- [ ] **Step 2 to 4: Fail, implement, pass. Browser check: Share, paste the link in a new tab, see the copy.**
- [ ] **Step 5: Commit:** `git commit -m "feat(export): share link in the URL fragment"`.

---

### Task 11: Standalone HTML and SVG per step

**Files:**
- Create: `src/player/standalone-entry.ts`, `vite.player.config.ts`, `src/export/standalone.ts`, `src/export/svg.ts`, `tests/setup/buildPlayer.ts`
- Modify: `package.json` scripts, `.gitignore`, `vitest.config.ts` (`globalSetup`), `src/editor/toolbar.ts` (Export menu: Standalone page, SVG of this step, SVG of every step)
- Test: `tests/export/svg.test.ts`, `tests/export/standalone.test.ts` (happy-dom)

**Interfaces:**

```ts
// standalone-entry.ts: builds to an IIFE that sets window.ROPC = { mount(root: HTMLElement, raw: unknown): void }
// mount runs validateFile + materialize + createPlayer and lists file problems above the player as app/main.ts did in P1.

// package.json
// "build:player": "vite build -c vite.player.config.ts"   -> app/generated/player.iife.js (lib mode, formats ["iife"], name "ROPC", no hashing)
// "predev": "npm run build:player", "prebuild": "npm run build:player"

// standalone.ts
export const STANDALONE_TITLE_SUFFIX = " | Railway Operating Plan";
export function standaloneHtml(plan: PlanReading, playerScript: string): string;
// one HTML document: <title> is the escaped plan title plus the suffix; the P1 preview CSS inlined; the plan as JSON inside <script type="application/json" id="plan"> with "</" written as "<\/"; the player script inline; a boot script that calls ROPC.mount. font-family falls back to ui-monospace. No external requests.
export function downloadStandalone(plan: PlanReading, playerScript: string, doc?: Document): void;   // file name: planFileName(plan) with ".html" in place of ".reading.json"

// svg.ts
export function svgForStep(plan: PlanReading, stepIndex: number, widthPx?: number /* default 1200 */): string;
// renderDrawing at fitPxPerFt into a detached svg, renderSprites for sim.states[stepIndex] with the step's status, then XMLSerializer. The svg carries width and height attributes and a <title> with the caption.
export function downloadSvg(plan: PlanReading, stepIndex: number, doc?: Document): void;        // "<planFileName stem>-step-<n>.svg", n 1-based
export function downloadAllSvgs(plan: PlanReading, doc?: Document, delayMs?: number): Promise<void>;  // one download per step, 250 ms apart; the menu item's title says the browser may ask to allow several downloads
```

The editor imports the bundle with `import playerScript from "../../app/generated/player.iife.js?raw"`, so `npm run build:player` must have run; `predev` and `prebuild` do it. `tests/setup/buildPlayer.ts` builds it only when the file is missing.

- [ ] **Step 1: Write the failing tests**

```ts
test("svgForStep 1 of the demo contains 6 g.unit elements and a title with the shove caption", () => {});
test("an SVG for a route_not_established step carries the label", () => { /* a plan with a via switch that is not on the route */ });
test("standaloneHtml escapes </script> inside the plan and contains no http(s) URLs", () => {});
test("standaloneHtml opened in a happy-dom Window mounts the player with 9 dots", () => {});
test("file names: demo -> how-a-train-services-a-customer.html and -step-2.svg", () => {});
```

- [ ] **Step 2 to 4: Fail, implement, pass. Browser check: export the standalone page, open the file from disk with the network off, play it.**
- [ ] **Step 5: Commit:** `git commit -m "feat(export): standalone HTML page and SVG per step"`.

---

### Task 12: Playwright smoke tests for the editor

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/editor.spec.ts`
- Modify: `package.json` (`"test:e2e": "playwright test"`, devDependency `@playwright/test` pinned to the current 1.x), `.gitignore` (`test-results/`, `playwright-report/`), `README.md` (how to run, with `npx playwright install chromium` once)

**Interfaces:** the class names and `data-tool` attributes fixed in Tasks 4 to 11.

- [ ] **Step 1: Write the spec** with these tests, each starting from the Single spur template on `http://localhost:5173` (Playwright's `webServer` runs `npm run dev`):

```ts
test("place a turnout, flip it, stretch the track", ...)      // strip and properties reflect each change; Undo three times returns to the template
test("place cars and make a step by dragging", ...)           // Add cars 5 loaded, drag into the spur, one new step, caption starts with "Shove"
test("undo restores the drawing", ...)
test("share link opens as a copy", ...)                       // read the link from the dialog, goto it in a new page, title starts with "Copy of"
test("standalone export downloads an html file that plays", ...)  // download event, read the file, load it with page.setContent, 9 dots for the demo
```

- [ ] **Step 2: Run `npm run test:e2e` and fix whatever the real browser shows that happy-dom did not.** Expected: all pass.
- [ ] **Step 3: Commit:** `git commit -m "test(e2e): Playwright smoke tests for the editor"`.

---

### Task 13: Tier 2: a siding that rejoins, runaround, two more templates and examples

**Files:**
- Modify: `src/core/engine/graph.ts` (the TODO near line 200: a rejoining branch's total is `lengthFt + 2 * CLEAR_FT`, its end is `{ kind: "switch", switch: second }`, and `walk` and `route` can enter it from either switch), `src/core/layout/layout.ts` (a rejoining branch's last point closes back onto the parent lane with a second 240 ft diagonal at its second switch), `src/core/engine/simulate.ts` (replace the `runaround` attention with expansion), `src/core/engine/materialize.ts` (doc comment only)
- Create: `src/core/editing/runaround.ts`, `docs/schema/examples/spur-with-runaround.reading.json`, `docs/schema/examples/two-customers.reading.json`, `tests/fixtures/spur-with-runaround-expected.json`, `tests/fixtures/two-customers-expected.json`
- Modify: `src/editor/templates.ts` (add `spur_with_runaround`), `src/editor/toolbar.ts` (a Runaround button, enabled when the selected loco's group stands on a track a siding joins at both ends), `README.md` (the three examples)
- Test: add cases to `tests/core/graph.test.ts`, `tests/core/layout.test.ts`, `tests/core/simulate.test.ts`; create `tests/core/runaround.test.ts`

**Interfaces:**

```ts
// runaround.ts
export interface RunaroundPlan { steps: Omit<RailroadStep, "id">[]; sidingId: Id }
/** The single steps a runaround stands for from this state: cut off, run light through the siding (via both switches) to the other end of the cars, couple. Null when no siding joins the loco's track at both ends. */
export function expandRunaround(plan: PlanReading, g: TrackGraph, state: WorldState, locoId: Id): RunaroundPlan | null;
export const NO_SIDING_REASON = "No siding joins this track at both ends, so the engine can't run the power around";
```

Rules: in `simulate`, a `runaround` work step is replaced at replay time by `expandRunaround` on the state before it; the three results carry the step's id with suffixes `a`, `b`, `c` in `StepResult.stepId`, and a null expansion stays `needs_attention` with `NO_SIDING_REASON`. The editor's Runaround button dispatches the three steps as `addStep` commands (one history entry "runaround"), so saved plans from the editor hold single steps; `materialize` is unchanged. The two example plans are synthetic, in the demo's style, each with an expected-state fixture covering at least the states after the runaround and after the second customer's spot.

- [ ] **Step 1: Write the failing tests**

```ts
// graph
test("a siding with end rejoins has a switch at both ends and route() can cross it from either", () => {});
// layout
test("a rejoining siding closes back onto the main lane with two diagonals; the main still spans the canvas", () => {});
// simulate
test("runaround on the spur-with-runaround example plays as cut_off, run_light via both switches, couple and ends with the loco at the other end", () => {});
test("runaround with no siding is needs_attention with NO_SIDING_REASON", () => {});
// runaround.ts
test("expandRunaround from the arrival state names the siding and both switches in via", () => {});
// templates and examples
test("spur_with_runaround and two-customers validate, simulate with every step ok, and match their expected fixtures", () => {});
```

- [ ] **Step 2 to 4: Fail, implement, pass. Browser check: Runaround button on the template; the loco ends up at the other end of the cars.**
- [ ] **Step 5: Commit:** `git commit -m "feat(tier2): rejoining siding, runaround, two more examples"`.

---

### Task 14: Prepare for going public (no visibility change)

**Files:**
- Create: `.github/workflows/pages.yml` (build on push to `main`, upload `app/dist`, deploy with `actions/deploy-pages`; inert while the repo is private and Pages is off)
- Modify: the Vite config so `base` is `/railway-operating-plan-creator/` in production builds and `/` in dev; `README.md` (status: Release 1 built; how to run, test, build, export; the three examples; a line that the repo is private until the owner opens it); `docs/spec.md` section 10 (plain DOM for the editor panels, owner decision 2026-10-23) and section 15 (the 2026-10-23 decisions)

- [ ] **Step 1: `npm run build` produces `app/dist` with the editor and the player bundle; serve it with `npx vite preview` and check the demo loads and a share link works with the base path.**
- [ ] **Step 2: Write the workflow and the README; run `npm test && npm run typecheck && npm run test:e2e`.**
- [ ] **Step 3: Commit:** `git commit -m "chore: Pages workflow, README and spec notes for Release 1"`.
- [ ] **Step 4: Hand the owner the list (they do these, not the agent):** 1. make the repo public; 2. Settings, Pages, source GitHub Actions; 3. push `main` and watch the workflow; 4. open the site and the demo share link. **Nothing in this plan performs these.**

---

## Self-review notes

- Spec 5.6 items with a task: toolbar and panels (4), templates (4, 13), automatic drawing (all, through layout), undo visible (4), autosave and Download (3, 4), drawing holds still and Fit (4), one gesture one Undo (9), notes not errors (strip in 4 and 9), track blocks with flips and stretch (5), facilities (6), cars and Place cars (7), spots fixed and hidden by default (6), steps by dragging with route following and reversal split (8, 9), off the edge and back (8, 9), train buttons (9), reorder (9), zoom and pan (4), command set with schemas (1), share link (10), standalone and SVG (11), JSON download and open (3), tier 2 (13), browser tests (12), Pages prep (14).
- **Deferred from 5.6, named so the owner can pull them in:** dragging a branch end onto another track to join it back (a rejoining siding is made through the template or the track's `end` property in Task 13); dragging spots within a facility (spots stay at 60 ft from the start); touch input; thumbnails in the step strip (cards show text); dismissing a note (notes are listed, not dismissable).
- Interfaces reused by name across tasks: `Editor`, `EditorState`, `Selection`, `View`, `compute`, `nearestTrackPos`, `followDrag`, `planCut`, `autoCaption`, `History.dispatch`, `applyCommand`, `savePlan`, `loadPlan`, `planFileName`, `setStatus`. Each later task is checked against the block that defines it.
