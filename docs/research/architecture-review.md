# Architecture review (senior developer pass)

This review of an earlier draft of section 5 shaped the current architecture and first-release scope. Kept as written, for the record.

Reviewer: senior developer pass, 2026-10-20. Read-only. Judged against the whole spec, both schemas, both examples, the three research notes and the hand-built demo (`op.html`).

Short version: the data split (PlanReading from the AI, CanvasPlan from code) is right and is the best idea in the spec. The architecture around it is built from the wrong end. It is an extraction pipeline with a player bolted on the end, when the thing a rail person or a hiring manager will stop for is the player plus a simulator that can say "this plan does not work as drawn". The extraction research (pipelines A, B, C) is the most expensive part to build and the least likely to produce a result anyone outside the project cares about, and as designed the benchmark is partly circular. Build the engine first, ship the editor and the share link early, add vision reading through one adapter, and treat the vector pipelines as a second study.

## 1. Is this the right architecture for "useful and gets noticed"?

What makes a rail person stop: not that an AI read a slide (everyone expects that in 2026), but that the tool understands switching. Concretely: it animates the plan, then it tells you that five cars at 66 ft need 330 ft and the racks have 360, that the spur is a trailing point for an eastbound arrival so the plan needs a runaround, that step 6 shoves past the buffer stop, or that the locomotive is on the wrong end of the cut for the pull. That is what an industrial development manager argues about with customers and crews today, and it is done by eye on a slide.

What makes a hiring manager stop: a small, clean, deterministic domain model (a schema, a simulator, a validator, a layout algorithm) with tests, a live demo that loads in one second, and an honest measurement write-up. The model evaluation is a nice second chapter, not the headline.

The single most impressive demoable moment: drop a PDF or a photo of a slide on the page, see the plan animate about ten seconds later, see the validator flag one real problem, drag a step to fix it, watch it re-validate, copy a share link. Section 5 does not get there fast. The phase table puts ingest and extract (P2) and the benchmark (P3) ahead of the editor (P4) and publishing (P5). The demoable moment needs P1, a thin editor and the share link, plus a single vision adapter. In the current order that moment arrives after the two hardest non-AI modules (`extract`, PPTX ingest) and after the benchmark.

Overbuilt for a first release: `extract` (snapping primitives into a track graph), PPTX XML ingest with group transform flattening, pipelines A and C, four render variants per fixture, tier 3 yards, a separate versioned public schema for CanvasPlan.

Underbuilt for a first release: the step simulator is not a module at all (see section 2), there is no edit model (commands and undo are a one-line mention under `editor`), the standalone player's relationship to React is unstated, and the layout rules only handle branches that leave the main directly.

## 2. Module boundaries

The current cuts are ingest, extract, adapters, validate, layout, render, player, editor, export, proxy, bench. Most are fine. Three problems.

**The simulator is missing, and its work is split across two modules.** Section 6.4 step 5 simulates the work sequence inside `validate` ("the power is attached before it shoves"). Section 6.3 step 7 simulates it again inside `layout` ("each work step becomes motion actions, stop positions come from car lengths"). That is the same state machine written twice, and the two will drift. There should be one module, call it `engine`, that owns the plan state: which units exist, which are coupled to which, which end the power is on, where every group sits (track and offset in feet), and loaded or empty state. It takes a PlanReading and produces a list of world states, one per step, plus the primitive actions that got there. `validate` is then the engine running with errors collected. `layout` is the engine's output mapped to pixels. `bench` can score on the engine's output too (section 3). This is the most important change in the review.

**Railroader verbs are macros over primitives, and the spec should say so.** The vocabulary overlaps: `set_out` is `shove` or `pull` followed by `cut_off`; `pick_up` is `couple` followed by `pull`. `couple` has no `to`, so the engine must already know the power is adjacent. `run_light` to `MAIN` says nothing about where on the main (the demo reading sends the loco to `MAIN`, the demo canvas sends it off the drawing). The CanvasPlan action set (`move`, `couple`, `uncouple`, `set_state`, `arrive`, `depart`) is already the right primitive set. Define the engine on those primitives, define each `do` verb as an expansion to primitives with stated defaults (for example "stop clear of the last switch passed, by the clearance distance"), and the vocabulary stops being ambiguous. Two gaps the demo exposes: there is no verb for "the power leaves the drawing and comes back later" (the demo's steps 3 and 5), and the first switch's `distanceFt` is defined from "where the drawing starts", which is not a thing. Better: leave the first distance out, and have layout compute the approach length from the arriving train's length plus a margin, so the whole train fits on the main to scale before the first switch.

**One public format, not two.** PlanReading is the source of truth, saved, shared and scored. CanvasPlan is rebuilt from it every time. Publishing CanvasPlan as a versioned JSON Schema (v0.1) creates a second contract to maintain for no consumer. Make it an internal TypeScript type. The standalone HTML export can embed the PlanReading plus the engine, layout and player code (same bundle as the app's player), which also means the export keeps improving as layout improves. Also put CanvasPlan in feet, not "schematic units", and let `render` apply one feet-to-pixel scale. The example canvas uses 50 unit cars and 50 unit spots while the spec says 66 ft per car, which is the kind of mismatch that disappears if the derived model stays in feet.

Smaller points:
- `render` and `player` must not depend on React. The spec says React is for panels, but it does not state that the player is framework free, and the standalone export and any embeddable player depend on that.
- `editor` should be a command module (`addTrack`, `setLength`, `insertStep`, `moveStep`, `splitCut`) over an immutable PlanReading with a command log for undo. The same command set is what an AI tool-calling mode would use (section 3), so it is worth designing once.
- `adapters` is fine as the seam. `proxy` is fine as a separate deployable.
- `ingest` for a first release reduces to "PDF page to PNG with pdf.js, image as is, downscaled in the browser before upload". Keep the vector path for later.
- A `share` concern is missing: the fragment encoding, compression, and version tag belong somewhere explicit, probably `export`.

## 3. The pipelines A, B, C

The comparison is a reasonable experiment in general, but as specified it has three problems.

**It is partly circular.** The fixtures are rendered by the project's own layout and renderer from the ground truth. Pipeline A (vector first) then parses the project's own PPTX and PDF output with the project's own geometry code. On those fixtures A will score near 1.0 on topology, and that number means nothing. Only the "few" hand-drawn messy variants test A honestly, and there are not enough of them to report a mean. B (vision first) on the scanned PNG is the only cell that resembles a real upload.

**A and C cost the most to build and are needed least.** `extract` and PPTX ingest are the hardest deterministic code in the project (grouped and rotated shapes, connectors, pdf.js operator lists with transforms and clipping). They are only needed for A and C. B needs none of that. Real uploads in this domain are often screenshots, photos of a slide, or PDFs exported from PowerPoint where lines are already flattened in odd ways.

**The novelty is not where the spec puts it.** "Hybrid beats vision only" is a borrowed result from P&ID and circuit work, and confirming it on fifteen synthetic plans is a footnote. What does not exist publicly is a machine-readable model of a customer switching plan with a simulator that can tell whether the plan is feasible. That is the research object. The AI's job is to get a document into that model with the least human fixing.

Recommended framing:
- Run B first, across models and the four renders, and publish that. It answers the question users actually have ("can I upload my slide?") and it is cheap.
- Change the `sequence` score to outcome based. Because verbs overlap (`set_out` equals `shove` plus `cut_off`), edit distance over `(actor, do, cars, to)` penalises correct readings that use different words. Run both readings through the engine and compare the world state after each step (which cuts are where, coupled to what, loaded or empty). That is a scoring method nobody else has, it falls out of the engine for free, and it is a better paper paragraph than A versus B.
- Add a second AI mode that is more useful than a better first draft: the model edits the plan through the editor's command set (tool calls), so the user can say "the spur is 600 ft, not 800" or "add a runaround before the pull" and the plan updates with validation. Measure how many turns it takes to reach a valid plan from a B draft. That is iterative correction, and it reuses the editor instead of a second pipeline.
- Keep A and C as a second study, done only if B's topology score is below the usable line, and build four or five hand-drawn fixtures before that study so it is not circular.
- A "critique this plan" prompt (model reads the PlanReading and the validator output, explains in plain words) is cheap and demo friendly, but the deterministic validator is the real check. Do not let the model be the safety judge.

Since "the benchmark compares A, B and C" is a decision already made, this is not a request to reverse it, only to reorder it and to fix the circularity before the numbers are published.

## 4. Tech stack

Agree: TypeScript, Vite, React for panels, hand-written SVG, Vitest, Cloudflare Worker, OpenRouter only. Notes:

- Make the engine, layout, render and player a plain TypeScript package with no DOM dependency except in `render` and `player`, so the bench CLI, the app and the standalone export all import the same code. The spec says this, the module table does not enforce it.
- pdf.js for page images is fine. pdf.js for vector paths (operator list) is a week of unpleasant work and is only needed for A and C. Defer.
- PPTX in the browser is a sharp edge for pipeline B, not just A. B needs a page image, and there is no good browser-side PPTX renderer. For a first release accept PDF, PNG and JPG, and when someone drops a PPTX show "export this slide as PDF or PNG from PowerPoint (File, Export) and drop that". Reading slide XML to draw an image yourself is the A ingest work in disguise.
- Downscale page images in the browser before sending (a long side of about 1500 px is plenty for a schematic). It cuts tokens, cuts proxy payload, and makes the request size cap realistic.
- Proxy state: the per-visitor daily limit needs storage. Workers KV on the free plan allows about 1,000 writes a day, which is roughly the OpenRouter cap anyway, so it is fine, but say so. The Workers rate limiting binding is the other option. An `Origin` header check is a courtesy, not a defence; Turnstile is the real gate, so the Worker must verify the Turnstile token server side on every call.
- The user's OpenRouter key lives in the browser after PKCE sign-in. Set a strict Content Security Policy (a meta tag works on a static host), load no third-party scripts, and store the key in memory or session storage with a clear sign-out.
- Share links: compress the PlanReading (a small deflate implementation or the browser's CompressionStream) into the fragment and prefix it with the schema version.
- Fonts: the demo loads Google Fonts. The standalone export should either inline or fall back cleanly so it works offline and in a locked-down corporate browser.

## 5. Risks and sharp edges

- **Layout of anything beyond a spur off the main.** Rule 3 in section 6.3 covers a branch that leaves the main. It does not cover a yard lead with a ladder (tracks off a track that is off the main), a siding that rejoins, two spurs off the same side that would overlap, or a facility longer than the track drawn at the same scale. The real algorithm is lane assignment: the main is lane 0, each branch gets a lane above or below based on `side`, and a branch off a branch takes the next lane in the same direction. Tier 3 yards will expose this. Keep tier 3 out of the first release and write the lane algorithm with tier 2 in mind.
- **The simulator is harder than two bullet points.** Which end the power is on changes whether a move is a shove or a pull, a facing versus trailing switch decides whether a move needs a runaround, a `pull` out of a spur means the power must be on the switch side of the cut, and a runaround needs a siding with two switches and enough room. Each of these is a few rules, but they must be written once in the engine with tests, not implied by layout.
- **Golden test as written cannot pass.** The demo is not to scale (its own note says so), the spec requires scale. The canvas example has 50 unit cars, 50 unit spots and a 300 unit racks box for 360 ft. Define the golden test on topology, step count, order of units along the track, which track each group ends on, and loaded or empty state. Not on coordinates.
- **Demo reading and demo canvas disagree.** The reading sends the loco to `MAIN` in step 3; the canvas sends it off the drawing. Decide the rule before P1 or the golden test will fail for a second reason.
- **Schema evolution.** `additionalProperties: false` and a `const` version are right for what the AI sends, and wrong for a user's saved file from last month. Plan a `migrate(reading)` function per version from the start and tag share links. `unsure` as dotted paths with ids inside them ("tracks.SPUR1.lengthFt") needs one documented rule for how a path is resolved.
- **Free model reliability.** Free endpoints change provider under the same id, often ignore `response_format`, sometimes do not accept images, and are rate limited per account. The spec's mitigations are right. Add: record the exact model and provider on every plan, and show it in the UI. Also note the shared free mode is a demo-scale feature: 50 requests a day across all visitors without the $10 purchase. Spend the $10. It is the cheapest capacity in the project.
- **Proxy abuse.** Covered well. Add image downscaling and a hard payload cap in the Worker (reject before reading the body when `Content-Length` is too large).
- **Testing.** Unit tests on the engine are the core. Add property tests (random valid plans, assert conservation: every car that arrived is somewhere at the end, no two groups overlap on a track, no group past a buffer stop). Snapshot tests for layout per tier. One browser smoke test for the player. The bench stays out of CI, as the spec says.
- **"Errors block export."** Reasonable for the benchmark, harsh for a user who wants to send a draft to a colleague. Export with a visible "draft, 2 errors" banner instead. This is a judgement call.

## 6. What would make this industry-shaking without losing focus

Ranked by impact against effort. The first three are the headline, and they are mostly already in the plan if the engine exists.

1. **Plan feasibility checks from the engine.** Fit at the facility, clear of the switch after every move (a default clearance distance per switch), nothing shoved past a buffer stop, power on the correct end for each pull, facing versus trailing feasibility, runaround needs a siding. High impact, medium effort, and it is what rail people will talk about. Nobody has this in a free browser tool.
2. **Plan metrics and compare two plans.** The engine gives these for free: number of moves, switch throws, feet travelled, times the main is fouled, number of coupling operations. Put two plans side by side (same customer, two orders of work) and show the numbers. That is how a plan gets sold to a customer and a crew. High impact, low effort once the engine exists.
3. **The open format.** Name it, publish the JSON Schema at a stable URL, write a one-page format description with three examples, and state the licence. The spec is already doing most of this. High impact over time, low effort.
4. **Embeddable player.** One script tag, one JSON file or a fragment, works on any static page including an internal wiki. Depends on the player being framework free. High impact for adoption, low effort after that.
5. **Crew-ready briefing export.** A printable page: step list, car counts, which cut goes where, switch positions per step, callouts. Medium impact, low effort.
6. **Public gallery.** A static list of example plans in the repo, submissions by pull request. Medium impact, low effort, but only worth it after the format is stable.
7. **Chat to fix the plan.** The AI calls editor commands. High impact on the "AI" headline, medium effort, and reuses the editor (section 3).
8. **Vector pipelines A and C.** Low visible impact for users, high effort. Second study.

## 7. Recommended first release

In:
- PlanReading v1 as the one public format, with migration from 0.2.
- Engine (plan state, primitives, verb expansion, feasibility checks), validate, layout for tier 1 and tier 2 (main, spurs, one siding that rejoins, one runaround), render and player, framework free.
- Editor as forms and lists: tracks and lengths, switches, facilities, consist, step list with reorder and insert, `unsure` highlights, undo. No canvas dragging.
- Share link, standalone HTML export, SVG per step, PlanReading JSON export and import.
- Upload: PDF, PNG, JPG. PPTX shows the export-as-PDF hint.
- One AI pipeline (B, vision first) behind the adapter interface, with the `none`, `proxy` and `openrouter` adapters. Proxy on a Cloudflare Worker.
- Bench CLI for B across the four renders and the model groups in section 8.3, with outcome-based sequence scoring. Results page.
- Three pre-run examples on the live site, including the portfolio demo.
- Deployed from the first week on GitHub Pages, even with only the demo plan.

Out (for now): pipelines A and C and the `extract` module, PPTX ingest, tier 3 yards, canvas drag editing, WebM, Sign in with ChatGPT, the gallery, compare mode (unless the engine makes it trivial, in which case put it in).

### Revised section 5 outline, written so the spec could adopt it

5. Architecture

Single repo in TypeScript. The core is a plain TypeScript package with no browser dependency: schema, engine, validate, layout. The app (Vite, React for panels) and the bench CLI (Node) both import that package. The renderer and player are plain SVG and DOM code with no framework, so the same code runs in the app, in the standalone export and in an embeddable player.

5.1 Data flow

upload to ingest to adapter to PlanReading to engine to validate and layout to render and player to export. The bench CLI feeds fixture documents into the same adapters and scores the PlanReading, and the engine's step outcomes, against the fixture's truth.

5.2 Modules

- schema: PlanReading types, JSON Schema, version tag and migrations between versions. Depends on nothing.
- engine: the plan as a state machine. Holds units, groups, coupling, power position and track offsets in feet. Expands each railroader verb into primitives (move, couple, uncouple, set state, arrive, depart) with stated defaults, and produces one world state per step. Reports feasibility problems as structured findings. Depends on schema.
- validate: schema check, reference check, topology rules, then the engine run with its findings. Errors and warnings in one list. Depends on schema and engine.
- layout: lane assignment and geometry in feet: the main on lane 0, branches on lanes above or below by side, switches in order, approach length from the arriving train. Converts engine world states into positions on track paths. Depends on schema and engine.
- render: draws tracks, facilities, callouts and units as SVG in the demo's visual language. Applies one feet-to-pixel scale. No framework.
- player: moves groups along concatenated track paths between step states, with play, pause, step and seek. No framework.
- editor: a command set over an immutable PlanReading (add, remove, set, insert step, move step, split cut) with a command log for undo and redo. Re-runs validate and layout on every change and highlights unsure fields. The same command set is the interface for an AI editing mode.
- ingest: file to page images. PDF through pdf.js, images as is, downscaled before upload. PPTX is not read in this release; the app asks for a PDF or image export.
- adapters: one interface, read(doc, options) returning reading, usage and warnings. Implementations: none, proxy, openrouter, later chatgpt. Only pipeline B in this release.
- proxy: Cloudflare Worker holding the project key. Verifies Turnstile on every call, enforces a payload cap and a per-visitor daily count, and sends the ranked free model list.
- export: PlanReading JSON, share link (compressed, version tagged fragment), standalone HTML with the plan and the player code embedded, SVG per step.
- bench: Node CLI over fixtures, models and renders. Scores topology, facilities, consist and sequence, with sequence scored on engine outcomes, not verb strings. Writes the results table.

5.3 Rules

- The model only ever produces a PlanReading. Nothing downstream can tell whether a reading came from a model or a person.
- PlanReading is the only public format. The canvas model is internal and is rebuilt from the reading on every change.
- One simulation. Validation, layout and scoring all use the engine; nothing else re-implements plan state.
- Core code has no DOM dependency; render and player have no framework dependency.

5.4 Order of work

Engine and layout with the demo plan first, deployed on the first day it plays. Then editor, share link and exports. Then the vision adapter and proxy. Then the benchmark. Vector pipelines are a second study, only if the vision results call for them.
