# Railway Operating Plan Creator: research spec

Status: draft for review, 2026-10-20
Owner: Orgo Nag, P.Eng

## 1. Problem

When a railway serves a customer, someone writes down how the train will do the work. Where does it arrive, which turnout does it take, where do the cars get spotted, when do the empties get pulled? That operating plan usually lives in a PowerPoint slide, a PDF drawing or a marked-up screenshot of a track schematic.

Those documents are hard to reuse. You can't animate them, check them or edit them without redrawing, and every new customer or change means starting over in a drawing tool. I hand-built one animated version for my portfolio ("How a Train Services a Customer", 7 steps). It explained the plan far better than the static slide, but it took hours of hand-tuned coordinates.

This project asks a narrow question: **can a cheap, open model turn an existing operating plan document into a structured plan that a person then corrects, animates and shares, faster than drawing it by hand?**

## 2. Goals and non-goals

### Goals

1. Upload a PDF, PPTX or image of a track schematic with an operating plan.
2. Get a baseline plan as JSON, in railway terms: tracks and their lengths, switches, customer facilities, the train consist, and the plan's arrival, spotting and yard work, and departure.
3. See that plan on a canvas and play it step by step, in the style of the existing demo.
4. Fix anything the model got wrong with simple editing tools.
5. Export the result as JSON, a standalone animated HTML page, and SVG.
6. Measure, with a small public benchmark, which pipeline and model gives the best result for the least money. Accuracy and cost are both measured; we don't assume one has to be traded for the other.

### Non-goals (for now)

- Surveyed geometry or CAD accuracy. Track lengths are to scale, but the layout is a clean schematic, not a map.
- Signals, interlocking, speed restrictions, timetables or multi-train conflict checks.
- Accounts, a backend database or server-side storage.
- Any proprietary railway data. All fixtures are synthetic and drawn for this project.

## 3. Who it is for

First version: a portfolio research piece. It should show clear problem framing, an honest model evaluation and a working pipeline. A practitioner in industrial development or customer service should be able to try it in a browser at no cost, but polish for daily production use is out of scope for v1.

## 4. How people use it (three modes)

The app is a static web page with no backend. Nothing is stored on a server. All model access goes through OpenRouter, and the user signs in with their own OpenRouter account.

**Sign in with OpenRouter.** OpenRouter supports an OAuth PKCE flow that runs entirely in the browser. The app sends the user to OpenRouter, they approve it, and the app receives a key tied to their own account. There's nothing to copy or paste, the project never holds a key, and usage bills to the user's own OpenRouter credits (zero on free models). Pasting a key by hand stays available as a fallback.

| Mode | What happens | Cost to the user | Cost to the project |
|---|---|---|---|
| Free (default) | OpenRouter's Free Models Router (`openrouter/free`) picks a free model that supports image input and structured output; the user can also pin a specific `:free` model | Free, within OpenRouter's free rate limits | Free |
| Pick a model | The user picks any OpenRouter model, open or closed, for better results | Usually well under a cent per document on open models (estimate, see section 9) | Free |
| No model | Draw or fix the plan by hand on the canvas | Free | Free |

"Flip it" means the user can switch between free and paid models from a dropdown at any time, and the app records which model produced each plan.

Free model limits (secondary sources, Oct 2026, to confirm in OpenRouter docs): about 20 requests per minute, and 50 requests per day for accounts that have never bought credits or 1,000 per day after a lifetime purchase of $10 or more. One document is one or two requests, so free is plenty for trying the tool. The free router picks at random among eligible models, so results can vary from run to run; the benchmark also tests pinned free models for repeatable numbers.

**Not supported: ChatGPT or Claude subscriptions.** Anthropic's terms say Claude Free, Pro and Max sign-in is only for Claude Code and Claude.ai and may not be used by other apps (reported Feb 2026). OpenAI's "Sign in with ChatGPT" is reported as an identity feature that doesn't let a third-party app spend the user's plan. Both providers' models are still reachable through OpenRouter with the user's own credits.

The public demo ships with pre-run examples so a visitor sees the full flow without signing in.

## 5. Architecture

Single repo, TypeScript, Vite, React for the panels, and a hand-written SVG renderer for the canvas. The same core modules run in the browser app and in a Node benchmark CLI.

```
upload ─> ingest ─> extract ─> adapter ─> PlanReading ─> validate ─> layout ─> CanvasPlan ─> canvas + player ─> export
                                           │
                        bench CLI scores ──┘ (PlanReading against the fixture's true reading)
```

| Module | Job | Depends on |
|---|---|---|
| `schema` | PlanReading and CanvasPlan types, JSON Schemas, versions | nothing |
| `ingest` | Turn a file into pages: page image (PNG), plus vector primitives and text with coordinates when the file has them. PDF via pdf.js, PPTX by reading the slide XML directly, images as is | pdf.js, a zip reader |
| `extract` | Turn primitives into a candidate track graph: snap line ends, find junctions, guess switches, attach text labels to nearest features | `schema`, `ingest` output |
| `adapters` | One interface, `read(doc, options) -> { reading, usage, warnings }`. Implementations: `none` and `openrouter` (OAuth PKCE sign-in, free router or a chosen model) | `schema` |
| `validate` | JSON Schema check, then topology, length and work-sequence checks on the PlanReading (section 6.4) | `schema` |
| `layout` | Turn a PlanReading into a CanvasPlan: draw the main line, place switches and branch tracks, scale lengths, place facilities and cars, and convert each work step into motion actions (section 6.3) | `schema` |
| `render` | Draw a CanvasPlan as SVG in the demo's visual language | `schema` |
| `player` | Compute unit positions per step and animate along track paths | `schema`, `render` |
| `editor` | Edits the PlanReading (tracks, lengths, switches, facilities, consist, steps), re-runs layout live, highlights `unsure` fields, undo/redo | all of the above |
| `export` | PlanReading JSON, standalone HTML player, SVG per step; WebM later | `render`, `player` |
| `bench` | Node CLI: run pipelines x models over fixtures, score, write a results table | everything except `editor` |

Units are small and testable on their own. The model never touches the canvas directly. It only produces a PlanReading, and everything downstream works the same whether the reading came from a model or a person.

### Pipelines under test

The benchmark compares three ways to get from a document to a PlanReading. Picking one is a result of the research, not an assumption.

- **A. Vector first.** `ingest` pulls lines, shapes and text from the PPTX or PDF. `extract` builds the track graph and measures relative lengths with plain geometry code. A model (text only, or text plus a small page image) only interprets: which track is the main line, which box is the facility, what the length labels say, how many cars, and what the steps are. Only works when the file has vectors.
- **B. Vision first.** The page image goes to a vision-language model, which returns the whole PlanReading. No coordinates are needed, because the canvas is laid out by code. Works on anything, including scans and photos.
- **C. Hybrid (marked primitives).** The model gets the page image plus a numbered list of the primitives `extract` found, and answers by referring to primitive ids, so its reading can be checked against the drawing. If there are no vectors, a cheap first call asks the vision model only for text label boxes to anchor on.

Prior work on P&ID and circuit diagrams found hybrids beat model-only approaches (see `docs/research/prior-art.md`), which is why C is in the set. The benchmark decides.

## 6. Data: what the AI sends, and what the canvas draws

There are two formats, and only the first one comes from the AI.

| Format | Who writes it | What it holds | Schema |
|---|---|---|---|
| **PlanReading** (v0.2) | The AI, or the user in the editor | The plan in railway terms: tracks, lengths, switches, facilities, consist, and the arrival, work and departure. No coordinates. | `docs/schema/plan-reading.schema.json` |
| **CanvasPlan** (v0.1) | The `layout` code, never the AI | Node positions, track paths, car positions and motion actions for the player | `docs/schema/canvas-plan.schema.json` |

The PlanReading is the source of truth. It's what gets saved, shared, edited and scored. The CanvasPlan is rebuilt from it whenever it changes.

Why the split: a model can reliably read "the spur leaves the main on the left, 800 ft, buffer stop at the end". It can't reliably invent "offset 550". So the AI sends only what has to be read from the document, and code works out everything that can be computed.

Worked examples of the portfolio demo: `docs/schema/examples/customer-service-demo.reading.json` (what the AI would send) and `docs/schema/examples/customer-service-demo.canvas.json` (the target for layout; it reproduces the hand-built demo's coordinates exactly, and real layout output should come close to it).

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
| customer | `load` / `unload` | The customer loads or unloads cars where they sit |
| customer | `move_cars` | The customer moves cars with their own equipment |

Each step has `cars` (cut ids), `to` (a track or facility), optional `via` (switches, in order) and a plain-language `text`, which becomes the step caption.

### 6.3 Layout: from reading to canvas

The `layout` module draws a clean schematic in the demo's style. It never tries to copy the original drawing's positions.

1. The main line is horizontal, and the arriving train always enters from the left. Compass directions stay as labels.
2. Switches go on the main in `order`, spaced by `distanceFt` when given, otherwise evenly.
3. A branch on the arriving train's left goes up, and one on its right goes down. It leaves at a fixed angle, then runs parallel to the main. Facing switches diverge forward and trailing switches diverge back toward the arrival end.
4. One scale (feet to pixels) fits the longest track to the canvas width, and every track is drawn to that scale. Tracks with no length get a default and a visible "length needed" marker.
5. Facilities sit along their track at `startFt`, or at the far end, and spots are laid out at 66 ft per car (or the overrides).
6. Each work step becomes motion actions (`arrive`, `move`, `couple`, `uncouple`, `set_state`, `depart`): routes come from a shortest path over the track graph, and stop positions come from car lengths and spot positions.

### 6.4 Validation

Constrained decoding can force the right JSON shape but not the right content, so `validate` checks the PlanReading:

1. Every id is unique and every reference resolves.
2. The arrival is on a `main` track, and every switch's `on` and `to` are different tracks.
3. A spur is reached by one switch; a siding that `rejoins` is reached by two.
4. **Fit checks** (warnings): every cut fits where it's sent. Cars × (car length + allowance) must be no longer than the facility or track, with the numbers shown, e.g. "5 × 66 ft = 330 ft of 360 ft at the racks: fits".
5. **Work sequence** (simulated step by step): the power is attached before it shoves or pulls a cut; `cut_off` leaves cars where they are; customer `unload` needs loaded cars at a facility; `departure.cars` are attached to the train at the end.
6. Every `via` switch is on a real path between where the move starts and its `to`.

Errors block export; warnings show in the editor. The editor always opens, even on a plan with errors.

## 7. Error handling in the pipeline

- Model returns invalid JSON: one repair retry with the validator messages fed back. If it still fails, keep every part that parses, mark the rest as warnings, and open the editor.
- Model times out or the key is rejected: show the message and offer no-model mode with whatever `extract` found.
- Free model rate limit hit (HTTP 429): say so plainly, show when to retry, and offer a paid model or no-model mode.
- Unsupported file (e.g. an encrypted PDF, or PPTX with only an embedded picture): fall back to the page image and pipeline B.

## 8. Benchmark design

There is no public dataset for parsing rail track schematics (see research notes), so the project builds a small one.

### 8.1 Fixtures

- About 15 synthetic plans in three tiers:
  - Tier 1, single customer spur (5 plans; includes the demo).
  - Tier 2, two customers or a run-around move (5 plans).
  - Tier 3, a small yard with several tracks and customers (5 plans).
- For each plan, the ground truth PlanReading is written first, and layout draws it. Code then renders it four ways: PPTX with native shapes, vector PDF, clean PNG, and a "scanned" PNG (slight rotation, blur, noise). The answers are exact by construction.
- Known weakness: synthetic drawings are tidier than real ones. To check this, a few plans can be redrawn by hand in PowerPoint in a messier, real-world style (still synthetic, no proprietary content).

### 8.2 Scores (each 0 to 1)

Scoring compares the model's PlanReading with the true one. No coordinates are involved.

| Score | How |
|---|---|
| `valid` | Passes the schema and validator after at most one repair |
| `topology` | Tracks matched by role and by how they connect (graph match); switch side and facing/trailing correct; track lengths within 5% when the document states them |
| `facilities` | Facility on the right track, name match, length and spot count |
| `consist` | Loco count; cuts with the right car counts, states and destinations; cars already on site |
| `sequence` | Arrival direction and power position; 1 minus normalized edit distance over the work steps as (actor, do, cars, to); departure direction and cars |
| `overall` | 0.35 topology + 0.15 facilities + 0.15 consist + 0.35 sequence, and 0 if not valid |

**Usable** means `valid` and `overall` of at least 0.8: good enough that fixing it in the editor beats drawing from scratch. This threshold is a starting guess; we'll check it by timing a few real fix-ups.

Each run also records input and output tokens, cost in USD (from the provider's usage response), wall time and repair count.

### 8.3 Matrix for the first run

| Group | Models (first pass) | Where |
|---|---|---|
| Free | `openrouter/free` (random free model), plus 2 or 3 pinned `:free` vision models | OpenRouter, free tier |
| Cheap hosted, open | Qwen3-VL 32B, Gemma 4 31B, Qwen3-VL 235B-A22B | OpenRouter |
| Ceiling, closed | Claude Opus 5.5 | OpenRouter, reference only |

Pipelines A and C run on PPTX and PDF renders; B and C run on all four renders. The result table lists every pipeline x model with mean overall, usable rate, cost per document and time per document. The recommendation is the cheapest setup whose usable rate is within a few points of the best.

## 9. Cost estimate and budget

Rough sizes per document: page image about 1,500 to 3,000 tokens, instructions and schema about 2,000, output about 2,000. At hosted open-model prices seen in Aug to Sep 2026 (about $0.10 to $0.26 per million input tokens and $0.34 to $1.04 per million output; secondary trackers), that is roughly $0.001 to $0.003 per document.

Full first run: about 15 plans x 4 renders x up to 3 pipelines x 3 hosted open models is a few hundred calls, about $1 to $3. The Opus 5.5 ceiling costs more per call; its estimate gets worked out from current OpenRouter pricing before that run. **Proposed cap: $15 for the first benchmark, and nothing is spent without a go-ahead and a per-run estimate.** Free-tier runs cost nothing but are rate limited, so the free group runs slowly over a day or two.

## 10. Canvas and animation

Layout (section 6.3) produces the geometry; the renderer only draws it. The demo already shows the right drawing technique: tracks as SVG paths, and units placed with `getPointAtLength` and rotated to the path angle. The renderer generalizes it. Each track becomes a path (with its bends), a route becomes a concatenated path, and the player eases the group's leader from one stop to the next.

Library choice (details in `docs/research/canvas.md`): plain SVG plus small geometry helpers for the canvas, React for panels. React Flow (MIT) was considered for editor chrome, but track geometry isn't box-and-wire, so it isn't needed for v1. tldraw is ruled out by its production licence. Konva and PixiJS are ruled out because SVG export matters.

Visual language matches the portfolio demo: ink background, gold facility boxes and labels, red loco, amber loaded cars, outlined empty cars, JetBrains Mono labels, Archivo headings.

## 11. Publish and export

- **PlanReading JSON:** the source of truth, re-importable.
- **Standalone HTML player:** one file with the plan embedded, in the same style as the demo. This is what goes on the portfolio.
- **SVG:** a still for each step.
- **Share link:** the plan, compressed into the URL fragment. The fragment is never sent to a server, so a static host can serve it.
- **Later:** WebM via MediaRecorder; GIF or MP4 via a wasm encoder.

## 12. Phases

| Phase | Delivers | Done when |
|---|---|---|
| P0 Spec | This doc, research notes, PlanReading v0.2 and CanvasPlan v0.1 schemas, demo examples | Reviewed and approved |
| P1 Layout and player | Types, validator, layout, SVG renderer, step player | The demo PlanReading lays out and plays the same 7 steps as the hand-built demo |
| P2 Ingest and extract | PDF and PPTX readers, vector primitives, graph builder | Tier 1 PPTX and PDF renders give the right topology with no model |
| P3 Adapters and first benchmark | none and OpenRouter adapters (with sign-in); bench CLI; fixtures; first results table | Results table published in `docs/results/` |
| P4 Editor | Snapping edits, panels, step editor, undo/redo, validation panel | A tier 2 plan can be fixed from a model baseline to valid without touching JSON |
| P5 Publish | Exports, share link, deployed static site, portfolio branch line | Portfolio links to a live plan under Industrial Development (2020 to 2023) |

**Minimal prototype** (the first build after this spec): P1, plus a thin slice of P2 and P3 covering PPTX upload, one adapter, JSON, and a static render. It proves the whole path once before we widen any part of it.

## 13. Testing

- Unit tests (Vitest) for schema validation, fit checks, the work-sequence simulation, layout, the route-to-path builder and every scoring function.
- Golden test: layout of the demo PlanReading gives the same tracks, switch and step sequence as the demo CanvasPlan, with cars at the racks after the shove and unit positions close to the hand-built demo.
- Benchmark is its own test of the model step and is run on demand, never in CI (it can cost money).

## 14. Risks

| Risk | Mitigation |
|---|---|
| Synthetic fixtures flatter the model | Add hand-drawn messy variants; report them separately |
| OpenRouter providers differ in schema enforcement | Always validate locally; record provider per run |
| PPTX shapes are grouped, rotated or use connectors | Flatten group transforms in `ingest`; test with all three |
| Licences change (Gemma, Qwen, tldraw) | Record the licence per model in results; re-check before going public |
| Free models change or vanish without notice | Record the exact model id per run; re-run the free group before publishing results |
| Free endpoints may log or train on prompts | Say so in the app before a free run; fixtures are synthetic, so the benchmark exposes nothing |

## 15. Decisions and open questions

Decided (2026-10-20):
- Accuracy ceiling: Claude Opus 5.5, called through OpenRouter. It's a reference point only, not part of the "open" result.
- No local models and no Ollama. Everything goes through OpenRouter.
- Public demo hosting: GitHub Pages. Pages on a private repo needs a paid GitHub plan, so the live demo goes up when the repo goes public.
- Clean auto-layout from the track connections. The AI sends no coordinates.
- One plan per arrival direction. Sections: arrival, spotting and yard work, departure, with optional customer steps anywhere.
- Track lengths to scale in feet. Cars default to 60 ft plus an always-shown 10% allowance (66 ft), overridable.
- Move vocabulary as in section 6.2.

Open:
1. Licence when the repo goes public: MIT or Apache 2.0.
2. Should the app warn users before sending a real plan to a free endpoint that may log prompts?
3. Default loco length for layout when the document doesn't give one.

## 16. Related docs

- `docs/research/models.md`: candidate models, licences, runtimes, prices, structured output
- `docs/research/prior-art.md`: diagram-to-graph research and rail data formats
- `docs/research/canvas.md`: canvas, animation and document ingestion libraries
- `docs/schema/plan-reading.schema.json` (what the AI sends), `docs/schema/canvas-plan.schema.json` (what layout produces) and `docs/schema/examples/`
