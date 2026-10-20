# Railway Operating Plan Creator: research spec

Status: draft for review, 2026-10-20 (section 5 and the first-release scope revised after a senior architecture review)
Owner: Orgo Nag, P.Eng

## 1. Problem

Operating plans already exist, and they're painful to work with. They live in PowerPoint slides, or as a list of steps on a single PDF. You can't watch the moves happen, you can't try a different order without redrawing, and anyone who wasn't in the room struggles to follow them.

I'm building a tool that animates simple operating plans. You lay out the plan, play around with the steps the cars will take, watch the train do the work, and then export it to share.

You don't have to start from a blank page. Upload the slide or PDF you already have, and an AI reads it into a first draft that you fix and finish.

## 2. Goals and non-goals

### Goals

1. Upload a PDF or image of a track schematic with an operating plan. (PowerPoint: export the slide as PDF or PNG for now; direct PPTX reading comes later.)
2. Get a baseline plan as JSON, in railway terms: tracks and their lengths, switches, customer facilities, the train consist, and the plan's arrival, spotting and yard work, and departure.
3. See that plan on a canvas and play it step by step, in the style of the existing demo.
4. Fix anything the model got wrong with simple editing tools.
5. Check that the plan actually works: cars fit, moves stay clear of switches, nothing is shoved past a buffer stop, the power is on the right end for each move.
6. Export the result as JSON, a share link, a standalone animated HTML page, and SVG.
7. Measure, with a small public benchmark, which model gives the best reading for the least money. Accuracy and cost are both measured; we don't assume one has to be traded for the other.

### Non-goals (for now)

- Surveyed geometry or CAD accuracy. Track lengths are to scale, but the layout is a clean schematic, not a map.
- Signals, interlocking, speed restrictions, timetables or multi-train conflict checks. A step can still include a stop with a callout that explains it, for example "stop clear of S1 and wait for the signal".
- Accounts, a backend database or server-side storage.
- Any proprietary railway data. All fixtures are synthetic and drawn for this project.

## 3. Who it is for

First version: a portfolio research piece. It should show clear problem framing, a small and well-tested domain model that understands switching, a live demo, and an honest model evaluation. A practitioner in industrial development or customer service should be able to try it in a browser at no cost, but polish for daily production use is out of scope for v1.

## 4. How people use it

The app is a static web page on GitHub Pages. There's one small exception to "no backend": a proxy that holds the project's own OpenRouter key so anyone can use a free model without signing up for anything (section 4.1).

| Mode | What happens | Cost to the user | Cost to the project |
|---|---|---|---|
| **Free (default)** | The app calls the project's proxy, which uses the project's OpenRouter key and the best free model from our benchmark, with fallbacks | Free, no sign-up | Free (shared daily limit, see 4.1) |
| **Your OpenRouter account** | Sign in with OpenRouter (OAuth PKCE, runs in the browser). Pick any model, free or paid. The user's key stays in their browser | Free on free models; usually well under a cent per document on cheap paid ones | Free |
| **Your ChatGPT plan** (later) | Sign in with ChatGPT and use the user's Plus or Pro plan for the AI step (see 4.2) | Counts against their plan | Free |
| **No model** | Draw or fix the plan by hand | Free | Free |

The user can switch modes and models from a dropdown at any time, and the app records which model produced each plan. The public demo also ships with pre-run examples.

### 4.1 The shared free key

A key placed in browser code is public, so the project key never goes to the browser. It lives in a small proxy (a Cloudflare Worker on the free plan is the likely host), and the proxy is locked down on both sides.

At OpenRouter:
- **The key has a $0 credit limit.** Even if it leaked, it couldn't spend money.
- **A guardrail allows only the chosen free models.** Any other model returns 403, and OpenRouter enforces this, not our code.

In the proxy:
- **Only the app's own site** can call it.
- **A Cloudflare Turnstile check** blocks bots.
- **A per-visitor daily limit**, for example 10 documents.
- **A cap on request size.**
- **The model list is fixed server-side.** The browser can't choose a model.

**"Auto-picked to the best"** means the proxy sends a ranked list of free models (best first, then fallbacks), taken from the latest benchmark results. If the top one is down or rate limited, OpenRouter falls back to the next. We update the list when the benchmark is re-run. This replaces OpenRouter's `openrouter/free` router, which picks at random.

**Limits to plan around** (secondary sources, Oct 2026, to confirm in OpenRouter docs): free models allow about 20 requests per minute. The daily cap is **per OpenRouter account, so every visitor shares it**: 50 requests a day if the account has never bought credits, 1,000 a day after a lifetime purchase of $10 or more. One document is one or two requests. When the shared cap runs out, the app says so and offers the other modes.

### 4.2 Sign in with ChatGPT

OpenAI now lets apps use a user's ChatGPT plan (Plus or Pro) for AI requests through "Sign in with ChatGPT" (OAuth 2.0 with PKCE). Images are supported when the chosen model accepts them, and the user sets a weekly cap for each app.

There's a catch for us. The self-serve flow in OpenAI's developer docs is for open-source tools that run on the user's own machine (callback on `127.0.0.1` only). A hosted website needs a client ID from OpenAI, which is currently a limited trial you request through a form. So this mode is planned for later, once we've applied and been approved. It would likely also need the proxy for the token exchange.

Claude subscriptions stay out: Anthropic's terms say Claude Free, Pro and Max sign-in is only for Claude Code and Claude.ai (reported Feb 2026). Claude models are still available through OpenRouter.

## 5. Architecture

Single repo in TypeScript. The core is a plain TypeScript package with no browser dependency: schema, engine, validate, layout. The app (Vite, React for panels) and the bench CLI (Node) both import that package. The renderer and player are plain SVG and DOM code with no framework, so the same code runs in the app, in the standalone export and in an embeddable player.

What makes this worth noticing isn't that an AI can read a slide. It's that the tool understands switching. It animates the plan, then tells you that 5 cars at 66 ft need 330 ft and the racks have 360, that the spur is trailing point for this arrival so the plan needs a runaround, or that the power is on the wrong end for the pull. Today that gets argued over by eye on a slide. The architecture is built around that engine.

### 5.1 Data flow

```
upload ─> ingest ─> adapter ─> PlanReading ─> engine ─> validate + layout ─> render + player ─> export
                                    │
               bench CLI scores ────┘ (the reading, and the engine's step outcomes, against the fixture's truth)
```

### 5.2 Modules

| Module | Job | Depends on |
|---|---|---|
| `schema` | PlanReading types, JSON Schema, version tag, and migrations between versions | nothing |
| `engine` | The plan as a state machine. Holds units, groups, coupling, power position and track offsets in feet. Expands each railroader verb into primitives (move, couple, uncouple, set state, arrive, depart) with stated defaults, and produces one world state per step. Reports feasibility problems as structured findings | `schema` |
| `validate` | Schema check, reference check, topology rules, then the engine run with its findings. Errors and warnings in one list | `schema`, `engine` |
| `layout` | Lane assignment and geometry in feet: the main on lane 0, branches on lanes above or below by side, switches in order, approach length from the arriving train. Converts engine world states into positions on track paths | `schema`, `engine` |
| `render` | Draws tracks, facilities, callouts and units as SVG in the demo's visual language. Applies one feet-to-pixel scale. No framework | `layout` output |
| `player` | Moves groups along track paths between step states, with play, pause, step and seek. No framework | `render` |
| `editor` | A command set over an immutable PlanReading (add, remove, set, insert step, move step, split cut) with a command log for undo and redo. Re-runs validate and layout on every change and highlights `unsure` fields. The same command set is the interface for a later AI editing mode | core, `render` |
| `ingest` | File to page images. PDF through pdf.js, images as is, downscaled in the browser (long side about 1,500 px) before upload. PPTX isn't read in this release; the app asks for a PDF or image export | pdf.js |
| `adapters` | One interface, `read(doc, options) -> { reading, usage, warnings }`. Implementations: `none`, `proxy` (shared free key), `openrouter` (user signs in), later `chatgpt`. Vision reading only in this release | `schema` |
| `proxy` | Cloudflare Worker holding the project key. Verifies Turnstile server side on every call, rejects oversized payloads before reading them, keeps a per-visitor daily count, and sends the ranked free model list | OpenRouter |
| `export` | PlanReading JSON, share link (compressed, version-tagged URL fragment), standalone HTML with the plan and player code embedded, SVG per step | core, `render`, `player` |
| `bench` | Node CLI over fixtures, models and renders. Scores topology, facilities, consist and sequence, with sequence scored on engine outcomes rather than verb strings. Writes the results table | core, `adapters` |

### 5.3 Rules

- The model only ever produces a PlanReading. Nothing downstream can tell whether a reading came from a model or a person.
- PlanReading is the only public format. The canvas model is an internal type, in feet, rebuilt from the reading on every change.
- One simulation. Validation, layout and scoring all use the engine; nothing else re-implements plan state.
- Core code has no DOM dependency; render and player have no framework dependency.

### 5.4 Order of work

Engine and layout with the demo plan first, deployed on GitHub Pages on the first day it plays. Then the editor, share link and exports. Then the vision adapter and proxy. Then the benchmark. Reading PowerPoint and PDF vectors directly is a second study, done only if the vision results call for it (section 8.4).

### 5.5 The AI's jobs

1. **Read a document into a first draft** (this release). The page image goes to a vision model, which returns a PlanReading. This works on PDFs, screenshots and photos of slides.
2. **Fix the plan by chat** (later). The user says "the spur is 600 ft, not 800" or "add a runaround before the pull", and the model calls the editor's commands; the engine re-checks the plan after every change. We measure how many turns it takes to get from a first draft to a valid plan.
3. **Explain the findings** (later, cheap). The model reads the plan and the engine's findings and explains them in plain words. The deterministic engine stays the judge of whether a plan works; the model never is.

## 6. Data: the PlanReading format

**PlanReading** (v0.2, `docs/schema/plan-reading.schema.json`) is the one public format. The AI writes it, or the user does in the editor. It holds the plan in railway terms: tracks, lengths, switches, facilities, consist, and the arrival, work and departure. It has no coordinates. It's what gets saved, shared, edited and scored.

The canvas model is internal. The engine and layout rebuild it from the reading on every change, in feet, and `render` applies one feet-to-pixel scale. (An early public draft of it, CanvasPlan v0.1, is kept in `docs/archive/` for reference.)

Why the split: a model can reliably read "the spur leaves the main on the left, 800 ft, buffer stop at the end". It can't reliably invent "offset 550". So the AI sends only what has to be read from the document, and code works out everything that can be computed.

Worked example of the portfolio demo: `docs/schema/examples/customer-service-demo.reading.json`.

### 6.1 Plan structure

A plan follows the order a railroader thinks in:

1. **Arrival.** The train arrives on the main in **one direction**. The direction is fixed for the plan; serving the same customer from the other direction is a separate plan. The arrival also says whether the power is on the head end or the rear.
2. **Spotting and yard work.** An ordered list of steps that starts once the train is on the main. This is where the railroad puts cars on the customer's track (or related tracks) and picks cars up.
3. **Departure.** The railroad puts the train together on the main and leaves, with a direction and the cuts it takes.
4. **Customer work (optional).** The customer loading, unloading or moving cars with their own equipment. It isn't a fixed section: customer steps can sit anywhere in the work list, marked `actor: customer`.

### 6.2 PlanReading fields

```
PlanReading
  schemaVersion  "0.2"
  title, description?
  arrival        direction (eastbound | westbound | northbound | southbound), on (main track id), locos (head | rear), text
  carLength      ft (default 60), allowancePct (default 10)
  tracks[]       id, role (main | siding | spur | yard | lead), name?, lengthFt?, end? (buffer_stop | continues | rejoins)
  switches[]     id, on (track), to (diverging track), side (left | right), approach (facing | trailing), order?, distanceFt?
  facilities[]   id, name, kind, track, lengthFt?, startFt?, spots?
  consist        locos { count, lengthFt? }, cuts[] { id, cars, state, carType?, carLengthFt?, for? },
                 onSite[] { id, cars, state, at }: cars already on site before the train arrives
  work[]         actor, do, cars?, to?, via?, text
  departure      direction, cars?, text
  unsure[]       dotted paths the AI isn't confident about, e.g. "tracks.SPUR1.lengthFt"
  notes[]        anything that didn't fit
```

The terms are chosen to match how a railroader would describe the plan:
- `side` and `approach` are relative to the **arriving** train. "The spur leaves on the left, facing point" is how you'd say it, and it's why a plan is tied to one direction.
- **Cars come in cuts** ("5 loads for the racks"), not as numbered individual cars. The editor can split a cut.
- **Lengths are in feet and to scale.** Cars default to 60 ft. The **10% allowance is always shown** on top, so each car plans as 66 ft. Users can override the default length and the allowance for the plan, or the length for one cut. Lengths the document doesn't give are left out and the editor asks for them.
- **`unsure`** lets the AI flag what it guessed, so the editor can highlight those fields instead of the user hunting for mistakes.

Names follow OpenStreetMap railway tagging where it fits (track roles, switch side). Concepts follow railML and RailTopoModel, but we don't copy railML's schema because of its licence (CC BY-NC-ND, see research notes).

**Work steps (`do`)**

| Actor | `do` | Meaning |
|---|---|---|
| railroad | `shove` | Push cars ahead of the power |
| railroad | `pull` | Draw cars behind the power |
| railroad | `cut_off` | Uncouple the power and leave the cars |
| railroad | `couple` | Couple to cars |
| railroad | `run_light` | Move the power alone |
| railroad | `runaround` | Get the power to the other end of its cars |
| railroad | `set_out` | Leave cars on a track |
| railroad | `pick_up` | Collect cars from a track |
| railroad | `stop` | Stop and hold, with a callout saying why (signal, derail, crew, customer gate) |
| customer | `load` / `unload` | The customer loads or unloads cars where they sit |
| customer | `move_cars` | The customer moves cars with their own equipment |

Each step has `cars` (cut ids), `to` (a track or facility), optional `via` (switches, in order) and a plain-language `text`, which becomes the step caption.

Any step can also carry a **`callout`**: `{ text, at? }`, where `at` is a switch, track or facility id. The canvas pins it to that spot during the step, for example "Stop clear of S1. Wait for the signal before entering the main." A `stop` step needs a callout.

**Verbs are shorthand for primitives.** The engine works on six primitives: `arrive`, `move`, `couple`, `uncouple`, `set_state` and `depart`. Each verb above expands into them with stated defaults. For example, `set_out` is a `shove` or `pull` followed by `cut_off`; `pick_up` is `couple` followed by `pull`; a move stops clear of the last switch it passed unless `to` says otherwise. Because two readings can describe the same work in different words, scoring compares what the plan does, not which words it uses (section 8.2).

### 6.3 Layout: from reading to canvas

The `layout` module draws a clean schematic in the demo's style. It never tries to copy the original drawing's positions.

1. The main line is horizontal on lane 0, and the arriving train always enters from the left. Compass directions stay as labels.
2. Lanes: a branch on the arriving train's left goes on a lane above, and one on its right goes on a lane below. A branch off a branch takes the next lane out in the same direction. Two branches on the same side get separate lanes so they never overlap.
3. Switches go on their track in `order`, spaced by `distanceFt` when given, otherwise evenly. The approach before the first switch isn't read from the document: layout makes it long enough for the whole arriving train to stand on the main, to scale, plus a margin.
4. A branch leaves at a fixed angle, then runs parallel to its parent. Facing switches diverge forward and trailing switches diverge back toward the arrival end. A siding that `rejoins` closes back onto its parent at its second switch.
5. One scale (feet to pixels) fits the longest lane to the canvas width, and every track is drawn to that scale. Tracks with no length get a default and a visible "length needed" marker.
6. Facilities sit along their track at `startFt`, or at the far end. Spots are laid out at 66 ft per car, or the overrides.
7. Callouts are drawn as a labelled marker at their `at` feature, kept clear of the track, and shown only during their step.
8. Unit positions for each step come from the engine's world states, not from layout's own reasoning.

First release covers tier 1 and tier 2 layouts: the main, spurs, one siding that rejoins, one runaround. Yards with ladders (tier 3) come later.

### 6.4 Validation and feasibility

Constrained decoding can force the right JSON shape but not the right content. `validate` checks the reading, then runs the engine and collects its findings.

Structure:
1. Every id is unique and every reference resolves.
2. The arrival is on a `main` track, and every switch's `on` and `to` are different tracks.
3. A spur is reached by one switch; a siding that `rejoins` is reached by two.
4. Every `via` switch is on a real path between where the move starts and its `to`.

Feasibility, from the engine (this is the headline feature):
5. **Fit.** Every cut fits where it's sent. Cars × (car length + allowance) must be no longer than the facility or track, with the numbers shown, e.g. "5 × 66 ft = 330 ft of 360 ft at the racks: fits".
6. **Clear of switches.** After every move, every group stands clear of every switch it isn't using, by a default clearance distance that the user can change.
7. **Buffer stops.** Nothing is shoved past the end of a track.
8. **Power on the right end.** A `pull` needs the power on the far side of the cut from where it's going; a `shove` needs it behind. A trailing-point spur needs a runaround (or a different plan) to be served as drawn.
9. **Runaround.** A runaround needs a siding with two switches and room for the power.
10. **Work sequence.** The power is attached before it moves a cut; `cut_off` leaves cars where they are; customer `unload` needs loaded cars at a facility; `departure.cars` are on the train at the end.

Errors and warnings show in one list in the editor. A plan with errors can still be exported and shared, with a visible "Draft, 2 errors" banner, so a user can send a work in progress to a colleague.

**Plan metrics** come from the same engine run: number of moves, switch throws, feet travelled, times the main is fouled, couplings. They let two versions of a plan for the same customer be compared side by side (section 12).

## 7. Error handling in the pipeline

- Model returns invalid JSON: one repair retry with the validator messages fed back. If it still fails, keep every part that parses, mark the rest as warnings, and open the editor.
- Model times out or the key is rejected: show the message and offer no-model mode.
- Free model rate limit hit (HTTP 429): say so plainly, show when to retry, and offer a paid model or no-model mode.
- PowerPoint file: show "Export this slide as PDF or PNG from PowerPoint (File, Export) and drop that here."
- Unsupported or encrypted file: say so and offer no-model mode.

## 8. Benchmark design

There is no public dataset for parsing rail track schematics (see research notes), so the project builds a small one.

### 8.1 Fixtures

- About 15 synthetic plans in three tiers:
  - Tier 1, single customer spur (5 plans; includes the demo).
  - Tier 2, two customers or a run-around move (5 plans).
  - Tier 3, a small yard with several tracks and customers (5 plans). These join the benchmark once layout handles tier 3, since layout draws the fixtures.
- For each plan, the ground truth PlanReading is written first, and layout draws it. Code then renders it four ways: PDF, clean PNG, a "scanned" PNG (slight rotation, blur, noise), and a "photo of a slide" PNG (perspective, glare). The answers are exact by construction.
- Known weakness: these drawings come from our own layout code, so they're tidier than real ones. Four or five plans are also redrawn by hand in PowerPoint in a messier, real-world style (still synthetic, no proprietary content) and reported separately.

### 8.2 Scores (each 0 to 1)

Scoring compares the model's PlanReading with the true one. No coordinates are involved.

| Score | How |
|---|---|
| `valid` | Passes the schema and validator after at most one repair |
| `topology` | Tracks matched by role and by how they connect (graph match); switch side and facing/trailing correct; track lengths within 5% when the document states them |
| `facilities` | Facility on the right track, name match, length and spot count |
| `consist` | Loco count; cuts with the right car counts, states and destinations; cars already on site |
| `sequence` | Arrival direction and power position, then **outcome based**: run both readings through the engine and compare the world state after each step (which cuts are where, coupled to what, loaded or empty), plus departure direction and cars. A reading that says `set_out` where the truth says `shove` then `cut_off` scores the same, because it does the same thing |
| `overall` | 0.35 topology + 0.15 facilities + 0.15 consist + 0.35 sequence, and 0 if not valid |

**Usable** means `valid` and `overall` of at least 0.8: a first draft the user only needs to touch up. This threshold is a starting guess; we'll check it by timing a few real fix-ups.

Each run also records input and output tokens, cost in USD (from the provider's usage response), wall time and repair count.

### 8.3 Matrix for the first run

| Group | Models (first pass) | Where |
|---|---|---|
| Free | `openrouter/free` (random free model), plus 2 or 3 pinned `:free` vision models | OpenRouter, free tier |
| Cheap hosted, open | Qwen3-VL 32B, Gemma 4 31B, Qwen3-VL 235B-A22B | OpenRouter |
| Ceiling, closed | Claude Opus 5.5 | OpenRouter, reference only |

The first benchmark runs vision reading (pipeline B) on every render. The result table lists every model with mean overall, usable rate, cost per document and time per document, separately for synthetic and hand-drawn fixtures. The recommendation, and the proxy's ranked free model list, is the cheapest setup whose usable rate is within a few points of the best.

### 8.4 Second study: reading vectors directly

Two more pipelines stay in the research plan as a second study, done only if vision reading's topology score falls below the usable line:

- **A. Vector first.** Read lines, shapes and text from the PPTX or PDF directly, build the track graph with geometry code, and use a model only to interpret labels and steps.
- **C. Hybrid.** Give the model the page image plus a numbered list of the shapes found, and have it answer by shape id.

Both need the hardest code in the project (PPTX shape geometry, pdf.js vector paths), and on our own synthetic fixtures they would mostly be parsing our own output, which proves little. So this study only runs on the hand-drawn fixtures, and only if B needs the help. Prior work on P&ID and circuit diagrams suggests hybrids help (see `docs/research/prior-art.md`); the study would test whether that holds here.

## 9. Cost estimate and budget

Rough sizes per document: page image about 1,500 to 3,000 tokens, instructions and schema about 2,000, output about 2,000. At hosted open-model prices seen in Aug to Sep 2026 (about $0.10 to $0.26 per million input tokens and $0.34 to $1.04 per million output; secondary trackers), that is roughly $0.001 to $0.003 per document.

Full first run: about 20 plans (15 synthetic, 4 or 5 hand-drawn) x 4 renders x 3 hosted open models is a few hundred calls, well under $3. The Opus 5.5 ceiling costs more per call; its estimate gets worked out from current OpenRouter pricing before that run. **Proposed cap: $15 for the first benchmark, and nothing is spent without a go-ahead and a per-run estimate.** Free-tier runs cost nothing but are rate limited, so the free group runs slowly over a day or two.

## 10. Canvas and animation

Layout (section 6.3) produces the geometry, and the renderer only draws it. The demo already shows the right drawing technique: tracks as SVG paths, and units placed with `getPointAtLength` and rotated to the path angle. The player eases each group from one step's world state to the next.

Library choice (details in `docs/research/canvas.md`): plain SVG and small geometry helpers, with no framework in `render` or `player`, and React only for the editor panels. tldraw is ruled out by its production licence. Konva and PixiJS are ruled out because SVG export matters.

Visual language matches the portfolio demo: ink background, gold facility boxes and labels, red loco, amber loaded cars, outlined empty cars, JetBrains Mono labels, Archivo headings. The standalone export inlines its fonts or falls back cleanly, so it works offline and in locked-down corporate browsers.

## 11. Publish and export

- **PlanReading JSON:** the source of truth, re-importable. Older versions are migrated on import.
- **Share link:** the plan, compressed into the URL fragment and tagged with its schema version. The fragment is never sent to a server, so a static host can serve it.
- **Standalone HTML:** one file with the plan and the player code embedded, in the demo's style. This is what goes on the portfolio.
- **SVG:** a still for each step.
- **Later:** an embeddable player (one script tag), a crew briefing page, WebM video.

## 12. First release, phases, and what comes after

### 12.1 First release

In:
- PlanReading v1 as the one public format, with migration from v0.2.
- Engine (plan state, primitives, verb expansion, feasibility checks and metrics), validate, and layout for tier 1 and tier 2. Render and player with no framework.
- Editor as forms and lists: tracks and lengths, switches, facilities, consist, a step list with reorder and insert, `unsure` highlights, undo and redo. No dragging on the canvas yet.
- Share link, standalone HTML export, SVG per step, PlanReading JSON export and import.
- Upload of PDF, PNG and JPG. PowerPoint files get the export-as-PDF hint.
- Vision reading behind the adapter interface, with the `none`, `proxy` and `openrouter` adapters, and the proxy on a Cloudflare Worker.
- Bench CLI for vision reading across the renders and the model groups in section 8.3, with outcome-based sequence scoring, and a results page.
- Three pre-run examples on the live site, including the portfolio demo.
- Deployed on GitHub Pages from the first week, even with only the demo plan.

Out for now: vector pipelines A and C, PPTX reading, tier 3 yards, canvas drag editing, WebM, Sign in with ChatGPT, the gallery. Compare mode goes in if the engine makes it trivial.

### 12.2 Phases

| Phase | Delivers | Done when |
|---|---|---|
| P0 Spec | This doc, research notes, PlanReading schema, demo example | Reviewed and approved |
| P1 Engine and player | Schema v1 and migration, engine, validate, layout (tier 1), render, player; deployed | The demo reading plays the 7 steps on the live site and the engine reports its fit check |
| P2 Editor and sharing | Command-based editor with undo, share link, standalone HTML, SVG, JSON import and export; tier 2 layout | A tier 2 plan can be built from scratch, fixed until valid, and shared by link |
| P3 Reading | Upload (PDF, PNG, JPG), vision adapter, proxy with Turnstile and limits, Sign in with OpenRouter | A PDF of a tier 1 plan becomes a playable draft on the live site, on the free mode |
| P4 Benchmark | Fixtures (synthetic and hand-drawn), bench CLI, outcome-based scoring, results page; proxy model list set from results | Results table published in `docs/results/` |
| P5 Portfolio | Three pre-run examples, plan metrics, portfolio branch line | Portfolio links to a live plan under Industrial Development (2020 to 2023) |

### 12.3 After the first release, ranked by impact against effort

1. **Feasibility checks** (in the first release): what rail people will talk about.
2. **Plan metrics and compare two plans:** same customer, two orders of work, numbers side by side. That's how a plan gets sold to a customer and a crew. Low effort once the engine exists.
3. **The open format:** name it, publish the schema at a stable URL, a one-page description with three examples, a stated licence.
4. **Embeddable player:** one script tag, works on any static page including an internal wiki.
5. **Crew briefing export:** a printable page with the step list, car counts, which cut goes where, switch positions per step, and callouts.
6. **Public gallery:** example plans in the repo, submitted by pull request, once the format is stable.
7. **Chat to fix the plan:** the AI calls editor commands (section 5.5).
8. **Vector pipelines A and C:** the second study (section 8.4).

## 13. Testing

- Unit tests (Vitest) for the engine first: every verb expansion, every feasibility rule, migrations, and every scoring function.
- Property tests: random valid plans, checking that every car that arrived is somewhere at the end, no two groups overlap on a track, and nothing passes a buffer stop.
- Snapshot tests for layout, one per tier.
- Golden test for the demo, on what it means rather than its coordinates (the hand-built demo isn't to scale): same tracks and switch, 7 steps, cars at the racks after the shove, the empties on the train at departure.
- One browser smoke test for the player.
- The benchmark runs on demand, never in CI (it can cost money).

## 14. Risks

| Risk | Mitigation |
|---|---|
| The engine's switching rules are harder than they look (power end, facing versus trailing, runarounds) | Write them once in the engine with tests and property tests; nothing else re-implements them |
| Layout breaks on branches off branches, rejoining sidings or crowded sides | Lane assignment from the start; tier 3 yards stay out of the first release |
| Saved plans and share links break when the schema changes | Version tag on every file and link; a `migrate` function per version from day one |
| Synthetic fixtures flatter the model | Hand-drawn fixtures, reported separately |
| Free models change provider, ignore JSON schema or refuse images | Validate locally; record the exact model and provider on every plan and show it in the UI |
| Shared free quota used up by a few heavy users or bots | Turnstile verified server side, per-visitor daily limit, payload cap, images downscaled; the app falls back to the other modes |
| Project key abused | Key never reaches the browser; $0 credit limit and a guardrail model allowlist at OpenRouter |
| A user's own OpenRouter key sits in the browser | Strict Content Security Policy, no third-party scripts, key kept in memory or session storage, clear sign-out |
| Free endpoints may log or train on prompts | Say so in the app before a free run; fixtures are synthetic, so the benchmark exposes nothing |
| Licences change (Gemma, Qwen, tldraw) | Record the licence per model in results; re-check before going public |

## 15. Decisions and open questions

Decided (2026-10-20):
- Accuracy ceiling: Claude Opus 5.5, called through OpenRouter, as a reference point only.
- No local models and no Ollama.
- Default mode uses a project OpenRouter key behind a proxy, limited to free models, with the best free model picked from benchmark results.
- Sign in with ChatGPT is planned for later, after applying for a client ID.
- Public demo hosting: GitHub Pages, live once the repo goes public.
- Clean auto-layout from the track connections. The AI sends no coordinates.
- One plan per arrival direction. Sections: arrival, spotting and yard work, departure, with optional customer steps anywhere.
- Track lengths to scale in feet. Cars default to 60 ft plus an always-shown 10% allowance (66 ft), overridable.
- Move vocabulary as in section 6.2. Stops and callouts are in; signals and interlocking logic stay out.
- Architecture and first-release scope as revised after the senior review: engine first, PlanReading as the only public format, vision reading first, vector pipelines as a second study.

Open:
1. Licence when the repo goes public: MIT or Apache 2.0 (recommended).
2. Buy $10 of OpenRouter credits once, to lift the shared free cap from 50 to 1,000 requests a day? The review recommends it as the cheapest capacity in the project. Your call; it's a spend.
3. How should a plan say the power leaves the drawing and comes back later (demo steps 3 and 5)? Options: `run_light` to a special `offstage` target, or two new verbs such as `leave` and `return`.
4. Default switch clearance distance and default loco length, when the document doesn't give them.
5. Should the app warn users before sending a real plan to a free endpoint that may log prompts?
6. Proxy host: Cloudflare Workers (recommended, free plan) or another option?

## 16. Related docs

- `docs/research/models.md`: candidate models, licences, prices, structured output
- `docs/research/prior-art.md`: diagram-to-graph research and rail data formats
- `docs/research/canvas.md`: canvas, animation and document ingestion libraries
- `docs/research/architecture-review.md`: the senior architecture review this revision is based on
- `docs/schema/plan-reading.schema.json` and `docs/schema/examples/`
- `docs/archive/`: the early CanvasPlan v0.1 draft and its demo example
