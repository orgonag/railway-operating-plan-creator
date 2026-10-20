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
2. Get a baseline plan as JSON: tracks, switches, sidings, customer facilities and spots, the train consist, and the ordered service steps.
3. See that plan on a canvas and play it step by step, in the style of the existing demo.
4. Fix anything the model got wrong with simple editing tools.
5. Export the result as JSON, a standalone animated HTML page, and SVG.
6. Measure, with a small public benchmark, which pipeline and model gives the best result for the least money. Accuracy and cost are both measured; we don't assume one has to be traded for the other.

### Non-goals (for now)

- Real-world scale, surveyed geometry or CAD accuracy. Plans are schematics.
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
upload ─> ingest ─> extract ─> adapter (model or none) ─> validate ─> canvas + player ─> export
                                                            │
                                         bench CLI reuses ──┘ (same modules, scored against fixtures)
```

| Module | Job | Depends on |
|---|---|---|
| `schema` | OpPlan types, JSON Schema, version | nothing |
| `ingest` | Turn a file into pages: page image (PNG), plus vector primitives and text with coordinates when the file has them. PDF via pdf.js, PPTX by reading the slide XML directly, images as is | pdf.js, a zip reader |
| `extract` | Turn primitives into a candidate track graph: snap line ends, find junctions, guess switches, attach text labels to nearest features | `schema`, `ingest` output |
| `adapters` | One interface, `extract(doc, options) -> { plan, usage, warnings }`. Implementations: `none` and `openrouter` (OAuth PKCE sign-in, free router or a chosen model) | `schema` |
| `validate` | JSON Schema check, then topology and step checks (section 6.3) | `schema` |
| `render` | Draw an OpPlan as SVG in the demo's visual language | `schema` |
| `player` | Compute unit positions per step and animate along track paths | `schema`, `render` |
| `editor` | Selection, drag with snapping, add/split/delete track, facility and consist panels, step list, undo/redo | all of the above |
| `export` | OpPlan JSON, standalone HTML player, SVG per step; WebM later | `render`, `player` |
| `bench` | Node CLI: run pipelines x models over fixtures, score, write a results table | everything except `editor` |

Units are small and testable on their own. The model never touches the canvas directly; it only produces an OpPlan, and everything downstream works the same whether the plan came from a model or a person.

### Pipelines under test

The benchmark compares three ways to get from a document to an OpPlan. Picking one is a result of the research, not an assumption.

- **A. Vector first.** `ingest` pulls lines, shapes and text from the PPTX or PDF. `extract` builds the graph with plain geometry code. A model (text only, or text plus a small page image) only labels things: which track is the main line, which box is the facility, how many cars, and what the steps are. Only works when the file has vectors.
- **B. Vision first.** The page image goes to a vision-language model, which returns the whole OpPlan, coordinates included (on a 0 to 1000 grid, then scaled). Works on anything, including scans and photos.
- **C. Hybrid (marked primitives).** The model gets the page image plus a numbered list of the primitives `extract` found, and answers by referring to primitive ids instead of inventing coordinates. If there are no vectors, a cheap first call asks the vision model only for text label boxes to anchor on.

Prior work on P&ID and circuit diagrams found hybrids beat model-only approaches (see `docs/research/prior-art.md`), which is why C is in the set. The benchmark decides.

## 6. Data: the OpPlan format (v0.1)

Full JSON Schema: `docs/schema/opplan.schema.json`. Worked example (the portfolio demo, all 7 steps): `docs/schema/examples/customer-service-demo.json`.

### 6.1 Shape

```
OpPlan
  schemaVersion  "0.1"
  meta           title, description, source { kind, filename, pages }, extractedBy { pipeline, model }
  canvas         width, height (schematic units; the demo uses 1000 x 320)
  nodes[]        id, kind: edge | end | switch | junction, x, y, label?
  tracks[]       id, from (node id), to (node id), points[] (optional bends), role, label?
  switches[]     id, node, toe (track id), normal (track id), reverse (track id), turnoutSide?: left | right
  facilities[]   id, name, kind, track, box { x, y, w, h }, spots[] { id, offset }
  consist        units[] { id, kind: loco | car, carType?, state?: loaded | empty, length }
  initial        groups[] { units, at (position), facing (node id), offstage? }: where units are before step 1
  steps[]        id, title, text, actions[]
```

Names follow OpenStreetMap railway tagging where it fits (`role` uses main, siding, spur, yard, lead; switches have `turnoutSide`). Concepts follow railML and RailTopoModel (track elements joined at nodes), but we don't copy railML's schema because of its licence (CC BY-NC-ND, see research notes). railML export could come later.

### 6.2 Positions and steps

- A position is `{ track, offset }`: distance along the track from its `from` node, in schematic units. On a track that starts at an `edge` node (the drawing continues off the page), offsets can be negative, meaning off-page.
- A group of coupled units is listed **leading end first in the direction of travel**. The player places the leader at the stop position and lays the rest out behind it along the route, spacing by unit lengths.
- Step actions (the minimum set that covers the demo):

| op | Fields | Meaning |
|---|---|---|
| `arrive` | units, enter (edge node), route, stop | Group enters from off-page and stops |
| `move` | units, route, stop | Group moves along the listed tracks in order and stops |
| `uncouple` | between [a, b] | Splits a group between two adjacent units |
| `couple` | between [a, b] | Joins two adjacent units into one group |
| `set_state` | units, state | Loaded to empty or back (customer work) |
| `dwell` | minutes? | Time passes; nothing moves |
| `depart` | units, route, exit (edge node) | Group leaves off-page |

`route` is an ordered list of track ids; the direction on each track comes from the shared nodes. A step can hold several actions; the player runs them in order.

### 6.3 Validation (beyond the JSON Schema)

Constrained decoding can force the right JSON shape but not the right content, so `validate` checks:

1. Every id is unique and every reference resolves.
2. Every track's `from` and `to` nodes exist, and no track has zero length.
3. Every `switch` node joins exactly three tracks, and toe, normal and reverse are three different tracks touching that node.
4. Every `end` and `edge` node touches exactly one track; every `junction` touches exactly two.
5. Every route is connected: consecutive tracks share a node, and the path through a switch goes toe to normal or toe to reverse, never normal to reverse.
6. Every stop offset lies on its track (or off-page past an `edge` node).
7. Couple and uncouple refer to units that are actually adjacent at that point in the plan.
8. Facility spots lie on the facility's track.

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
- For each plan, the ground truth OpPlan JSON is written first. Code then renders it four ways: PPTX with native shapes, vector PDF, clean PNG, and a "scanned" PNG (slight rotation, blur, noise). The answers are exact by construction.
- Known weakness: synthetic drawings are tidier than real ones. To check this, a few plans can be redrawn by hand in PowerPoint in a messier, real-world style (still synthetic, no proprietary content).

### 8.2 Scores (each 0 to 1)

| Score | How |
|---|---|
| `valid` | Passes the schema and validator after at most one repair |
| `topology` | Match predicted nodes to true nodes after normalizing to the drawing's bounding box (tolerance 3% of the diagonal); F1 over nodes, tracks (both ends matched) and switches; plus track role accuracy |
| `facilities` | Facility found on the right track, name match, spot count |
| `consist` | Unit count, kinds and loaded/empty states |
| `steps` | 1 minus normalized edit distance over the action sequence, with arguments compared after mapping ids through the node/track match |
| `overall` | 0.4 topology + 0.15 facilities + 0.15 consist + 0.3 steps, and 0 if not valid |

**Usable** means `valid` and `overall` of at least 0.8: good enough that fixing it in the editor beats drawing from scratch. This threshold is a starting guess; we'll check it by timing a few real fix-ups.

Each run also records input and output tokens, cost in USD (from the provider's usage response), wall time and repair count.

### 8.3 Matrix for the first run

| Group | Models (first pass) | Where |
|---|---|---|
| Free | `openrouter/free` (random free model), plus 2 or 3 pinned `:free` vision models | OpenRouter, free tier |
| Cheap hosted, open | Qwen3-VL 32B, Gemma 4 31B, Qwen3-VL 235B-A22B | OpenRouter |
| Ceiling, closed | One frontier model | OpenRouter, reference only |

Pipelines A and C run on PPTX and PDF renders; B and C run on all four renders. The result table lists every pipeline x model with mean overall, usable rate, cost per document and time per document. The recommendation is the cheapest setup whose usable rate is within a few points of the best.

## 9. Cost estimate and budget

Rough sizes per document: page image about 1,500 to 3,000 tokens, instructions and schema about 2,000, output about 2,000. At hosted open-model prices seen in Aug to Sep 2026 (about $0.10 to $0.26 per million input tokens and $0.34 to $1.04 per million output; secondary trackers), that is roughly $0.001 to $0.003 per document.

Full first run: about 15 plans x 4 renders x up to 3 pipelines x 3 hosted open models is a few hundred calls, about $1 to $3. The frontier ceiling adds maybe $5 to $10. **Proposed cap: $15 for the first benchmark, and nothing is spent without a go-ahead and a per-run estimate.** Free-tier runs cost nothing but are rate limited, so the free group runs slowly over a day or two.

## 10. Canvas and animation

The demo already shows the right technique: tracks as SVG paths, and units placed with `getPointAtLength` and rotated to the path angle. The renderer generalizes it. Each track becomes a path (with its bends), a route becomes a concatenated path, and the player eases the group's leader from one stop to the next.

Library choice (details in `docs/research/canvas.md`): plain SVG plus small geometry helpers for the canvas, React for panels. React Flow (MIT) was considered for editor chrome, but track geometry isn't box-and-wire, so it isn't needed for v1. tldraw is ruled out by its production licence. Konva and PixiJS are ruled out because SVG export matters.

Visual language matches the portfolio demo: ink background, gold facility boxes and labels, red loco, amber loaded cars, outlined empty cars, JetBrains Mono labels, Archivo headings.

## 11. Publish and export

- **OpPlan JSON:** the source of truth, re-importable.
- **Standalone HTML player:** one file with the plan embedded, in the same style as the demo. This is what goes on the portfolio.
- **SVG:** a still for each step.
- **Share link:** the plan, compressed into the URL fragment. The fragment is never sent to a server, so a static host can serve it.
- **Later:** WebM via MediaRecorder; GIF or MP4 via a wasm encoder.

## 12. Phases

| Phase | Delivers | Done when |
|---|---|---|
| P0 Spec | This doc, research notes, schema v0.1, demo fixture | Reviewed and approved |
| P1 Schema and player | Types, validator, SVG renderer, step player | The demo fixture JSON plays the same 7 steps as the hand-built demo |
| P2 Ingest and extract | PDF and PPTX readers, vector primitives, graph builder | Tier 1 PPTX and PDF renders give the right topology with no model |
| P3 Adapters and first benchmark | none and OpenRouter adapters (with sign-in); bench CLI; fixtures; first results table | Results table published in `docs/results/` |
| P4 Editor | Snapping edits, panels, step editor, undo/redo, validation panel | A tier 2 plan can be fixed from a model baseline to valid without touching JSON |
| P5 Publish | Exports, share link, deployed static site, portfolio branch line | Portfolio links to a live plan under Industrial Development (2020 to 2023) |

**Minimal prototype** (the first build after this spec): P1, plus a thin slice of P2 and P3 covering PPTX upload, one adapter, JSON, and a static render. It proves the whole path once before we widen any part of it.

## 13. Testing

- Unit tests (Vitest) for schema validation, topology checks, the route-to-path builder, position layout and every scoring function.
- Golden test: the demo fixture renders and its unit positions at each step match the hand-built demo within a few units.
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

## 15. Open questions

1. Licence when the repo goes public: MIT or Apache 2.0? (Apache 2.0 matches most of the models.)
2. Which frontier model to use as the ceiling?
3. Should the app warn users before sending a real plan to a free endpoint that may log prompts?
4. Hosting for the public demo: GitHub Pages or Cloudflare Pages?

## 16. Related docs

- `docs/research/models.md`: candidate models, licences, runtimes, prices, structured output
- `docs/research/prior-art.md`: diagram-to-graph research and rail data formats
- `docs/research/canvas.md`: canvas, animation and document ingestion libraries
- `docs/schema/opplan.schema.json` and `docs/schema/examples/`
