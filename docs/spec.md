# Railway Operating Plan Creator: research spec

Status: draft for review, 2026-10-20 (section 5 and the first-release scope revised after a senior architecture review)
Owner: Orgo Nag, P.Eng

## 1. Problem

Operating plans already exist, and they're painful to work with. They live in PowerPoint slides, or as a list of steps on a single PDF. You can't watch the moves happen, you can't try a different order without redrawing, and anyone who wasn't in the room struggles to follow them.

I'm building a tool that animates simple operating plans. You lay out the plan, play around with the steps the cars will take, watch the train do the work, and then export it to share.

You build the plan yourself, on the canvas, and the tool checks every move as you add it. If you already have a slide or PDF, an optional import can give you a rough starting draft, asking you about anything it had to guess.

## 2. Goals and non-goals

### Goals

1. Build an operating plan on the canvas by hand: lay out the track, set lengths, place the facility and cars, and add the steps one at a time.
2. Get helpful notes as you build it, never roadblocks: cars that may not fit, a move that may foul a switch, a shove past a buffer stop, power that looks to be on the wrong end.
3. Play the plan step by step, in the style of the existing demo, and try a different order of work.
4. Export and share the result: JSON, a share link, a standalone animated HTML page, and SVG.
5. Optionally, import an existing plan (most common file types) to get a rough draft. The AI asks a clarifying question for every assumption it makes, and the person decides.
6. Measure, with a small benchmark, which free model gives the best import, and how often it guesses wrong without asking.

### Non-goals (for now)

- Surveyed geometry or CAD accuracy. Track lengths are to scale, but the layout is a clean schematic, not a map.
- Signals, interlocking, speed restrictions, timetables or multi-train conflict checks. A step can still include a stop with a callout that explains it, for example "stop clear of S1 and wait for the signal".
- Accounts, a backend database or server-side storage, in the first release. If a real need comes up, Supabase is available to connect (section 4.3).
- Any proprietary railway data. All fixtures are synthetic and drawn for this project.

## 3. Who it is for

First version: a portfolio research piece. It should show clear problem framing, a well-made editor, a small and well-tested domain model that understands switching, and a live demo. The AI import is a helpful extra, not the product. A practitioner in industrial development or customer service should be able to try it in a browser at no cost, but polish for daily production use is out of scope for v1.

## 4. How people use it

The app is a static web page on GitHub Pages. There's one small exception to "no backend": a proxy that holds the project's own OpenRouter key so anyone can use a free model without signing up for anything (section 4.1).

| Mode | What happens | Cost to the user | Cost to the project |
|---|---|---|---|
| **Free (default)** | The app calls the project's proxy, which uses the project's OpenRouter key and the best free model from our benchmark, with fallbacks | Free, no sign-up | Free (shared daily limit, see 4.1) |
| **Your OpenRouter account** | Sign in with OpenRouter (OAuth PKCE, runs in the browser). Pick any model, free or paid. The user's key stays in their browser | Free on free models; usually well under a cent per document on cheap paid ones | Free |
| **Your ChatGPT plan** (later) | Sign in with ChatGPT and use the user's Plus or Pro plan for the AI step (see 4.2) | Counts against their plan | Free |
| **No model** | Draw or fix the plan by hand | Free | Free |

None of this is needed to use the tool: the editor, checks, player and exports work with no AI at all. For the import button, the user can switch modes and models from a dropdown at any time, and the app records which model produced each plan. The public demo also ships with pre-run examples.

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

### 4.3 Supabase, only if needed

The first release needs no database: plans live in the browser and in share links. Supabase is available to connect if a real need appears. Likely uses, in rough order:

- **Short share links** for plans too big to fit in a URL comfortably.
- **The proxy,** as a Supabase Edge Function instead of a Cloudflare Worker, if Supabase is already in use.
- **A public gallery** of example plans, later.
- **Saving plans to an account,** later, if people ask for it.

Before adding it, check the free plan's limits at the time (for example, free projects can be paused when idle) and agree any spend first.

## 5. Architecture

Single repo in TypeScript. The core is a plain TypeScript package with no browser dependency: schema, engine, validate, layout. The app (Vite, React for panels) and the bench CLI (Node) both import that package. The renderer and player are plain SVG and DOM code with no framework, so the same code runs in the app, in the standalone export and in an embeddable player.

What makes this worth noticing isn't that an AI can read a slide. It's that the person can build a plan quickly and the tool understands switching. It animates the plan, and it can point out things worth a second look: 5 cars at 66 ft need 330 ft and the racks have 360, the spur is trailing point for this arrival, the power looks to be on the wrong end for the pull. It points these out; it never stops anyone. Today that gets argued over by eye on a slide. The architecture is built around the editor and that engine; the AI import sits off to one side.

### 5.1 Data flow

```
person ─> editor ─────────────────────────────┐
                                               ├─> PlanReading ─> engine ─> validate + layout ─> render + player ─> export
optional: files ─> ingest ─> adapter ─> draft ─┘        (questions answered by the person)

bench CLI scores the import draft, and how well its questions covered its mistakes, against the fixture's truth.
```

### 5.2 Modules

| Module | Job | Depends on |
|---|---|---|
| `schema` | PlanReading types, JSON Schema, version tag, and migrations between versions | nothing |
| `engine` | The plan as a state machine, and a forgiving one. Holds units, groups, coupling, power position and track offsets in feet. Expands each railroader verb into primitives (move, couple, uncouple, set state, arrive, depart) with stated defaults, and produces one world state per step. Works the other way too: given where things were before and after a drag in the editor, it finds the route and names the move (shove, pull, run light). Reports anything that looks off as notes, never as blocking errors. If it can't make sense of a step, it still produces a step: the cars slide straight to where the person put them | `schema` |
| `validate` | Schema and reference checks for files coming in (imports, shared links, JSON), then the engine run with its notes | `schema`, `engine` |
| `layout` | Lane assignment and geometry in feet: the main on lane 0, branches on lanes above or below by side, switches in order, approach length from the arriving train. Converts engine world states into positions on track paths | `schema`, `engine` |
| `render` | Draws tracks, facilities, callouts and units as SVG in the demo's visual language. Applies one feet-to-pixel scale. No framework | `layout` output |
| `player` | Moves groups along track paths between step states, with play, pause, step and seek. No framework | `render` |
| `editor` | The main way to make a plan, designed to feel like PowerPoint (section 5.6): track blocks, a step strip, drag to make moves, a properties panel. A command set over an immutable PlanReading with undo and redo, and autosave in the browser. Layout stays automatic | core, `render` |
| `ingest` | Turns most common files into what a model can read: page images plus text (section 7.1). One or several files at once, all in the browser | pdf.js, a zip reader |
| `adapters` | One interface, `read(doc, options) -> { reading, usage, warnings }`. Implementations: `none`, `proxy` (shared free key), `openrouter` (user signs in), later `chatgpt`. The reading comes back with its clarifying questions | `schema` |
| `questions` | Shows the import's clarifying questions as a short checklist, each with the AI's guess pre-filled. The person answers, accepts the guess or skips; answers are applied as editor commands, so they can be undone | `editor` |
| `proxy` | Cloudflare Worker holding the project key. Verifies Turnstile server side on every call, rejects oversized payloads before reading them, keeps a per-visitor daily count, and sends the ranked free model list | OpenRouter |
| `export` | PlanReading JSON, share link (compressed, version-tagged URL fragment), standalone HTML with the plan and player code embedded, SVG per step | core, `render`, `player` |
| `bench` | Node CLI over fixtures, models and renders. Scores topology, facilities, consist and sequence, with sequence scored on engine outcomes rather than verb strings. Writes the results table | core, `adapters` |

### 5.3 Rules

- The model only ever produces a PlanReading. Nothing downstream can tell whether a reading came from a model or a person.
- PlanReading is the only public format. The canvas model is an internal type, in feet, rebuilt from the reading on every change.
- One simulation. Validation, layout and scoring all use the engine; nothing else re-implements plan state.
- Core code has no DOM dependency; render and player have no framework dependency.

### 5.4 Order of work

Engine and layout with the demo plan first, deployed on GitHub Pages on the first day it plays. Then the canvas editor, share link and exports: at that point the tool is complete without any AI. Then the import button (ingest, adapter, proxy, questions). Then the small benchmark that picks the import model. Reading PowerPoint and PDF shapes as geometry is a second study, done only if the import results call for it (section 8.4).

### 5.5 What the AI does, and doesn't

The AI has one job: the optional **import** button. It reads the files the person drops in and returns a rough PlanReading plus a list of clarifying questions.

**It asks about every assumption.** Anything the AI did not read directly from the document (a length it estimated, a switch side it inferred, a car count it couldn't see, which cut goes where) must come with a question. Each question names the field it's about, asks it in plain words, offers the AI's guess, gives choices where they make sense, and says what in the document led to the guess. For example: "The spur's length isn't labelled. I guessed 800 ft from its drawn length next to the main. Is that right?" Fields read directly need no question.

The person works through the questions as a short checklist: answer, accept the guess, or skip and fix it later on the canvas. There's an "accept all guesses" button for people in a hurry. Answers become editor commands, so everything is undoable, and nothing reaches the plan without the person seeing it. If an answer changes the picture (for example "there are two spurs, not one"), the person can send the answers back for one more pass.

The AI doesn't build the plan, edit it, run it, or judge whether it works. The person builds and edits; the engine checks.

### 5.6 The canvas editor

The people using this are railroaders, customer service and industrial development staff, not software people. Many are not confident with computers. The editor should feel like PowerPoint, which they already use, and should make it hard to get wrong.

**Principles**
- **Looks and behaves like PowerPoint.** A toolbar of large buttons with an icon and a word, a step strip down the left like slide thumbnails, a properties panel on the right like the Format pane, right-click menus, and the usual keys (Ctrl+Z, Ctrl+Y, Delete, Ctrl+C and Ctrl+V for steps).
- **The drawing is automatic and to scale.** People never place or nudge track by hand, so they can't make a messy or impossible drawing. They decide what connects to what and how long it is, and the layout does the rest.
- **One obvious way to do each thing.** No modes to get stuck in; Esc always cancels.
- **Plain words.** Railway terms only where railroaders use them. A short tooltip on every button.
- **Undo is always visible** in the toolbar, not only on a key.
- **Work is never lost.** The plan saves itself in the browser as you go, and the app reminds you to export or share.
- **Nothing is ever blocked.** People can't think of every situation in advance, and neither can we. The tool lets the person do what they want, and only points things out.
- **Notes, not errors.** When something looks off, a small note appears next to it in plain words ("Heads up: the racks hold 5 cars and you've moved 6"). Notes are information. They can be dismissed, and they never stop a step, a Play or an export.
- **Start from a template**: "Single spur", "Spur with runaround", or the demo plan, instead of a blank page.
- **Mouse first.** Big targets, readable at normal zoom. Touch is a nice extra, not a requirement.

**Building track with blocks**
- A new plan starts with a main line.
- Track blocks in the toolbar: **Turnout (left)**, **Turnout (right)**, **Track end (buffer stop)** and **Facility**.
- **Drag a turnout onto a track** to place it. A new branch grows out of it with a default length, and the distance from the previous switch shows and can be edited.
- **Drag the end of the branch** to stretch it. It snaps in 10 ft steps and shows its length in feet as you drag, or you can type the length in the properties panel. Dropping a turnout on the new branch builds the next track off it, and so on.
- **Drag a branch's end onto another track** to join it back (a siding).
- **Drag a facility onto a track** to place it, and drag its ends to size it along the track. The number of cars it holds at 66 ft each shows as you drag.
- **Right-click any track** to rename it, set it as main, siding or spur, set its length, or delete it.

**Making the steps (like PowerPoint slides with Morph)**
1. Set the arrival: which way the train is heading (north, south, east or west) and which side of the drawing it comes in from (left or right).
2. Add the train: the loco and the cuts of cars, with a count and loaded or empty for each cut.
3. **Step 1 is the arrival.** The train stands on the main as it arrives.
4. **"New step" copies the previous step**, the way duplicating a slide does.
5. **In the new step, drag the train or a cut to where it should end up.** It slides along the track, so it can't be dropped off it.
6. **The tool works out the move.** Power behind the cars is a shove, power in front is a pull, a loco on its own is running light. It writes the caption ("Shove 5 loads to the unloading racks"), which you can edit.
7. **Small buttons on the train** do the rest: scissors between two cars or the loco to cut off, a link to couple, and Load or Unload on cars at a facility for a customer step. A Stop button adds a stop with a callout ("Wait for the signal before entering the main").
8. **The engine looks over each step as you make it.** If something looks off, a small note icon appears on the step with the reason in plain words. The step still works and still plays.
9. **Play** animates from step to step, like Morph. Steps can be reordered by dragging them in the strip, and the engine looks over the whole plan again.

**One step, one animation.** Each step does exactly one thing: one move, one cut-off, one couple, one load or unload, or one stop. That keeps every step easy to follow on screen and gives the engine one change to check at a time. If someone tries a second thing in the same step (for example dragging a second cut after the first), the tool puts it in a new step and says so; Undo puts it back.

**As many steps as people like.** Thirty small steps to show a train easing into a track is fine. A step can also be a plain slide where nothing moves, just a caption or a callout over the current picture.

**Following the path the user took.** While a cut is being dragged, the engine follows the drag along the track. At each turnout, the way the pointer goes decides which route the cars take, so dragging up into the spur takes the spur and dragging along the main stays on the main. The engine records that route, so Play shows the same path the person drew, not just the shortest one. If the drag changes direction partway (pull out past a switch, then shove back into another track), the tool splits it into two steps and says so. If the engine can't follow the move at all, it doesn't refuse: the cars slide straight from where they were to where they were dropped, and the step gets a note saying the tool couldn't follow the route and the person may want to check it.

Under the hood, each step is still saved as the verbs in section 6.2, with the route in `via`, so a step made by dragging and a step from the import are the same thing.

## 6. Data: the PlanReading format

**PlanReading** (v0.2, `docs/schema/plan-reading.schema.json`) is the one public format. The person writes it in the editor, or the import gives them a first draft of it. It holds the plan in railway terms: tracks, lengths, switches, facilities, consist, and the arrival, work and departure. It has no coordinates. It's what gets saved, shared, edited and scored.

The canvas model is internal. The engine and layout rebuild it from the reading on every change, in feet, and `render` applies one feet-to-pixel scale. (An early public draft of it, CanvasPlan v0.1, is kept in `docs/archive/` for reference.)

Why the split: a model can reliably read "the spur leaves the main on the left, 800 ft, buffer stop at the end". It can't reliably invent "offset 550". So the import sends only what has to be read from the document, and code works out everything that can be computed. The same is true in the editor: the person sets what connects to what and how long it is, and code does the drawing.

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
  arrival        direction (eastbound | westbound | northbound | southbound), enters (left | right), on (main track id), locos (head | rear), text
  carLength      ft (default 60), allowancePct (default 10)
  tracks[]       id, role (main | siding | spur | yard | lead), name?, lengthFt?, end? (buffer_stop | continues | rejoins)
  switches[]     id, on (track), to (diverging track), side (left | right), approach (facing | trailing), order?, distanceFt?
  facilities[]   id, name, kind, track, lengthFt?, startFt?, spots?
  consist        locos { count, lengthFt? }, cuts[] { id, cars, state, carType?, carLengthFt?, for? },
                 onSite[] { id, cars, state, at }: cars already on site before the train arrives
  work[]         actor, do, cars?, to?, via?, text
  departure      direction, cars?, text
  questions[]    import only: id, about (field path), ask, guess?, options?, basis
  notes[]        anything that didn't fit
```

The terms are chosen to match how a railroader would describe the plan:
- `side` and `approach` are relative to the **arriving** train. "The spur leaves on the left, facing point" is how you'd say it, and it's why a plan is tied to one direction.
- **Cars come in cuts** ("5 loads for the racks"), not as numbered individual cars. The editor can split a cut.
- **Lengths are in feet and to scale.** Cars default to 60 ft. The **10% allowance is always shown** on top, so each car plans as 66 ft. Users can override the default length and the allowance for the plan, or the length for one cut. Lengths the document doesn't give are left out and the editor asks for them.
- **`questions`** appear only on an import draft. They make every AI guess visible and put the decision with the person (section 5.5). Once answered, they are removed from the saved plan. A field path is `collection.id.field`, for example `tracks.SPUR1.lengthFt`.

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
| either | `note` | A plain slide: nothing moves, just a caption and an optional callout |

Each step has exactly one `do`, `cars` (cut ids), `to` (a track or facility), optional `via` (switches, in order) and a plain-language `text`, which becomes the step caption. In the editor, a reversal becomes two steps (section 5.6).

Any step can also carry a **`callout`**: `{ text, at? }`, where `at` is a switch, track or facility id. The canvas pins it to that spot during the step, for example "Stop clear of S1. Wait for the signal before entering the main." A `stop` step needs a callout.

**Verbs are shorthand for primitives.** The engine works on six primitives: `arrive`, `move`, `couple`, `uncouple`, `set_state` and `depart`. Each verb above expands into them with stated defaults. For example, `set_out` is a `shove` or `pull` followed by `cut_off`; `pick_up` is `couple` followed by `pull`; a move stops clear of the last switch it passed unless `to` says otherwise. Because two readings can describe the same work in different words, scoring compares what the plan does, not which words it uses (section 8.2).

### 6.3 Layout: from reading to canvas

The `layout` module draws a clean schematic in the demo's style. It never tries to copy the original drawing's positions.

1. The main line is horizontal on lane 0. The arriving train enters from the **left or the right**, as the plan says (`arrival.enters`), so the drawing can match how people picture the location. The heading is labelled clearly: each end of the main shows its compass point (for an eastbound train entering from the left, "West" on the left end and "East" on the right), with a small arrow and "Eastbound" by the arriving train. Everything else is drawn relative to that.
2. Lanes: "left" and "right" for switches mean the arriving train's left and right. For a train entering from the left, its left is up the page; for a train entering from the right, its left is down the page. A branch on the train's left goes on a lane on that side, and one on its right on the other side. A branch off a branch takes the next lane out in the same direction. Two branches on the same side get separate lanes so they never overlap.
3. Switches go on their track in `order`, spaced by `distanceFt` when given, otherwise evenly. The approach before the first switch isn't read from the document: layout makes it long enough for the whole arriving train to stand on the main, to scale, plus a margin.
4. A branch leaves at a fixed angle, then runs parallel to its parent. Facing switches diverge forward and trailing switches diverge back toward the arrival end. A siding that `rejoins` closes back onto its parent at its second switch.
5. One scale (feet to pixels) fits the longest lane to the canvas width, and every track is drawn to that scale. Tracks with no length get a default and a visible "length needed" marker.
6. Facilities sit along their track at `startFt`, or at the far end. Spots are laid out at 66 ft per car, or the overrides.
7. Callouts are drawn as a labelled marker at their `at` feature, kept clear of the track, and shown only during their step.
8. Unit positions for each step come from the engine's world states, not from layout's own reasoning.

First release covers tier 1 and tier 2 layouts: the main, spurs, one siding that rejoins, one runaround. Yards with ladders (tier 3) come later.

### 6.4 Validation and feasibility

Two kinds of checks, and only the first kind ever stops anything.

**File checks** apply only to files coming in: an import draft, a shared link or a JSON file. Constrained decoding can force the right JSON shape but not the right content, so these are checked and fixed up on the way in, with the problems listed for the person:
1. Every id is unique and every reference resolves.
2. The arrival is on a `main` track, and every switch's `on` and `to` are different tracks.
3. A spur is reached by one switch; a siding that `rejoins` is reached by two.
4. Every `via` switch is on a real path between where the move starts and its `to`.

**Notes from the engine** apply to everything, and never block a step, a Play or an export. The engine can't foresee every situation, so these are things to look at, not rules:
5. **Fit.** Every cut fits where it's sent. Cars × (car length + allowance) must be no longer than the facility or track, with the numbers shown, e.g. "5 × 66 ft = 330 ft of 360 ft at the racks: fits".
6. **Clear of switches.** After every move, every group stands clear of every switch it isn't using, by a default clearance distance that the user can change.
7. **Buffer stops.** Nothing is shoved past the end of a track.
8. **Power on the right end.** A `pull` needs the power on the far side of the cut from where it's going; a `shove` needs it behind. A trailing-point spur needs a runaround (or a different plan) to be served as drawn.
9. **Runaround.** A runaround needs a siding with two switches and room for the power.
10. **Unclear move.** The engine couldn't follow the route, so the step slides straight to the end position.
11. **Work sequence.** The power is attached before it moves a cut; `cut_off` leaves cars where they are; customer `unload` needs loaded cars at a facility; `departure.cars` are on the train at the end.

Notes show on their steps and in one list the person can open or ignore. Exports and share links leave notes out unless the person chooses to include them.

**Plan metrics** come from the same engine run: number of moves, switch throws, feet travelled, times the main is fouled, couplings. They let two versions of a plan for the same customer be compared side by side (section 12).

## 7. Error handling in the pipeline

- Model returns invalid JSON: one repair retry with the validator messages fed back. If it still fails, keep every part that parses, mark the rest as warnings, and open the editor.
- Model times out or the key is rejected: show the message and offer no-model mode.
- Free model rate limit hit (HTTP 429): say so plainly, show when to retry, and offer a paid model or no-model mode.
- Unsupported or encrypted file: say so, suggest a format that works (section 7.1), and remind the person they can build the plan by hand.
- The import returns too many questions (more than about 20): show the most important first, grouped by section, and let the person stop and edit on the canvas.

### 7.1 Files the import accepts

All reading happens in the browser. One or several files can be dropped at once, for example a slide plus a spreadsheet of car counts.

| File | How it's read |
|---|---|
| PDF | Page images (pdf.js) plus the text layer |
| PNG, JPG, WebP, GIF | As is, downscaled to a long side of about 1,500 px |
| SVG | Drawn to an image in the browser, plus its text |
| PowerPoint (PPTX) | Unzipped in the browser. Each slide's text and a compact list of its shapes (type, position, size, label, connector ends) go to the model as text, with any pictures on the slide as images. No slide rendering is needed |
| Word (DOCX) | Text, tables and embedded pictures |
| Visio (VSDX) | Like PowerPoint: page text and shape list, plus embedded pictures |
| Excel (XLSX), CSV | Sheets as plain tables, useful for step lists, car counts and track lengths |
| Old .ppt, .doc, .vsd, HEIC photos | Not read in the browser. The app asks the person to save as the newer format, PDF or JPG |

Reading the shape list from PowerPoint or Visio is lighter than the vector pipeline in section 8.4. We don't build a track graph from geometry; we only describe the shapes in text and let the model interpret them, with questions where it's unsure.

## 8. Benchmark design

The benchmark is a side study with one practical purpose: pick the free model the import button uses, and check that its questions catch its mistakes. There is no public dataset for parsing rail track schematics (see research notes), so the project builds a small one.

### 8.1 Fixtures

- About 15 synthetic plans in three tiers:
  - Tier 1, single customer spur (5 plans; includes the demo).
  - Tier 2, two customers or a run-around move (5 plans).
  - Tier 3, a small yard with several tracks and customers (5 plans). These join the benchmark once layout handles tier 3, since layout draws the fixtures.
- For each plan, the ground truth PlanReading is written first, and layout draws it. Code then renders it as PPTX, PDF, clean PNG, a "scanned" PNG (slight rotation, blur, noise), and a "photo of a slide" PNG (perspective, glare). The answers are exact by construction.
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

Question quality, the measure that matters most for a human-led tool:

| Score | How |
|---|---|
| `silent errors` | Fields the draft got wrong **without** asking about them, per plan. The target is zero; this is the headline number |
| `question precision` | Share of questions that were about something actually uncertain in the document, so the person isn't buried in needless questions |
| `after answers` | `overall` again after applying the true answers to the questions. Shows how close the draft gets once the person has done the checklist |

**Usable** means `valid` and `overall` of at least 0.8 after answers, with silent errors near zero: a first draft the user only needs to touch up. This threshold is a starting guess; we'll check it by timing a few real fix-ups.

Each run also records input and output tokens, cost in USD (from the provider's usage response), wall time and repair count.

### 8.3 Matrix for the first run

| Group | Models (first pass) | Where |
|---|---|---|
| Free | `openrouter/free` (random free model), plus 2 or 3 pinned `:free` vision models | OpenRouter, free tier |
| Cheap hosted, open | Qwen3-VL 32B, Gemma 4 31B, Qwen3-VL 235B-A22B | OpenRouter |
| Ceiling, closed | Claude Opus 5.5 | OpenRouter, reference only |

The first benchmark runs the import (page images, plus shape lists for PowerPoint) on every render. The result table lists every model with mean overall, usable rate, cost per document and time per document, separately for synthetic and hand-drawn fixtures. The recommendation, and the proxy's ranked free model list, is the cheapest setup whose usable rate is within a few points of the best.

### 8.4 Second study: reading vectors directly

Two more pipelines stay in the research plan as a second study, done only if the import's topology score falls below the usable line:

- **A. Vector first.** Read lines, shapes and text from the PPTX or PDF directly, build the track graph with geometry code, and use a model only to interpret labels and steps.
- **C. Hybrid.** Build the track graph with geometry code first, then give the model the page image plus that graph, and have it answer by element id.

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
- **Share link:** the plan, compressed into the URL fragment and tagged with its schema version. The fragment is never sent to a server, so a static host can serve it. If big plans make links too long to paste into an email, Supabase can store the plan and give a short link instead (section 4.3).
- **Standalone HTML:** one file with the plan and the player code embedded, in the demo's style. This is what goes on the portfolio.
- **SVG:** a still for each step.
- **Later:** an embeddable player (one script tag), a crew briefing page, WebM video.

## 12. First release, phases, and what comes after

### 12.1 First release

In:
- PlanReading v1 as the one public format, with migration from v0.2.
- Engine (plan state, primitives, verb expansion, feasibility checks and metrics), validate, and layout for tier 1 and tier 2. Render and player with no framework.
- The canvas editor in section 5.6 as the main tool: track blocks, drag to stretch track, facilities, the train, steps made like slides by dragging, the engine naming each move and adding notes where something looks off, templates, autosave, undo and redo.
- Share link, standalone HTML export, SVG per step, PlanReading JSON export and import.
- One optional import button accepting the files in section 7.1, with clarifying questions shown as a checklist.
- The import behind the adapter interface, with the `none`, `proxy` and `openrouter` adapters, and the proxy on a Cloudflare Worker.
- A small bench CLI for the import across the renders and the model groups in section 8.3, scoring silent errors and outcome-based sequence, and a results page.
- Three pre-run examples on the live site, including the portfolio demo.
- Deployed on GitHub Pages from the first week, even with only the demo plan.

Out for now: vector pipelines A and C, tier 3 yards, WebM, Sign in with ChatGPT, the gallery, any AI beyond the import button. Compare mode goes in if the engine makes it trivial.

### 12.2 Phases

| Phase | Delivers | Done when |
|---|---|---|
| P0 Spec | This doc, research notes, PlanReading schema, demo example | Reviewed and approved |
| P1 Engine and player | Schema v1 and migration, engine, validate, layout (tier 1), render, player; deployed | The demo reading plays the 7 steps on the live site and the engine reports its fit check |
| P2 Editor and sharing | Canvas editor with undo, share link, standalone HTML, SVG, JSON import and export; tier 2 layout | Someone who uses PowerPoint but not CAD can build the demo plan from the "Single spur" template in under 10 minutes without help, and share it by link, with no AI |
| P3 Import | Ingest for the section 7.1 files, adapter, clarifying questions checklist, proxy with Turnstile and limits, Sign in with OpenRouter | A PowerPoint slide of a tier 1 plan becomes a draft plus questions; after answering them it plays on the live site, on the free mode |
| P4 Benchmark | Fixtures (synthetic and hand-drawn), bench CLI, outcome-based scoring, results page; proxy model list set from results | Results table published in `docs/results/` |
| P5 Portfolio | Three pre-run examples, plan metrics, portfolio branch line | Portfolio links to a live plan under Industrial Development (2020 to 2023) |

### 12.3 After the first release, ranked by impact against effort

1. **Engine notes** (in the first release): the switching know-how rail people will talk about, offered as notes, never as rules.
2. **Plan metrics and compare two plans:** same customer, two orders of work, numbers side by side. That's how a plan gets sold to a customer and a crew. Low effort once the engine exists.
3. **The open format:** name it, publish the schema at a stable URL, a one-page description with three examples, a stated licence.
4. **Embeddable player:** one script tag, works on any static page including an internal wiki.
5. **Crew briefing export:** a printable page with the step list, car counts, which cut goes where, switch positions per step, and callouts.
6. **Public gallery:** example plans in the repo, submitted by pull request, once the format is stable.
7. **Vector pipelines A and C:** the second study (section 8.4).

## 13. Testing

- Unit tests (Vitest) for the engine first: every verb expansion, every feasibility rule, migrations, and every scoring function.
- Property tests: random valid plans, checking that every car that arrived is somewhere at the end, no two groups overlap on a track, and nothing passes a buffer stop.
- Snapshot tests for layout, one per tier.
- Golden test for the demo, on what it means rather than its coordinates (the hand-built demo isn't to scale): same tracks and switch, 7 steps, cars at the racks after the shove, the empties on the train at departure.
- One browser smoke test for the player, and browser tests for the main editor actions (place a turnout, stretch a track, make a step by dragging, undo).
- Hallway test before the first release: two or three people who use PowerPoint but not CAD build the demo plan while we watch, without help. Anything they get stuck on gets fixed or simplified.
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
- Architecture and first-release scope as revised after the senior review: engine first, PlanReading as the only public format, vector pipelines as a second study.
- Each step shows one animation (one move, cut-off, couple, load or unload, or stop). The engine follows the route the user dragged through each turnout and splits a direction change into two steps.
- Nothing is blocked. The engine's findings are notes the person can ignore; unclear moves still play; any number of steps, including static ones, is fine.
- The train can arrive from the left or the right of the drawing, with the compass heading labelled at the ends of the main and by the train; everything else is drawn relative to that.
- The editor feels like PowerPoint: automatic, to-scale drawing, track built by dragging turnout blocks and stretching track ends, steps made like slides by dragging the train to where it ends up (section 5.6).
- The person does most of the work. Canvas editing is the main tool and is in the first release. AI is one optional import button that accepts most common files and asks a clarifying question for every assumption. No chat editing or AI explanations.

Open:
1. Licence when the repo goes public: MIT or Apache 2.0 (recommended).
2. Buy $10 of OpenRouter credits once, to lift the shared free cap from 50 to 1,000 requests a day? The review recommends it as the cheapest capacity in the project. Your call; it's a spend.
3. How should a plan say the power leaves the drawing and comes back later (demo steps 3 and 5)? Options: `run_light` to a special `offstage` target, or two new verbs such as `leave` and `return`.
4. Default switch clearance distance and default loco length, when the document doesn't give them.
5. Should the app warn users before sending a real plan to a free endpoint that may log prompts?
6. Proxy host: Cloudflare Workers (recommended, free plan) or a Supabase Edge Function, if we end up using Supabase for anything else.

## 16. Related docs

- `docs/research/models.md`: candidate models, licences, prices, structured output
- `docs/research/prior-art.md`: diagram-to-graph research and rail data formats
- `docs/research/canvas.md`: canvas, animation and document ingestion libraries
- `docs/research/architecture-review.md`: the senior architecture review this revision is based on
- `docs/schema/plan-reading.schema.json` and `docs/schema/examples/`
- `docs/archive/`: the early CanvasPlan v0.1 draft and its demo example
