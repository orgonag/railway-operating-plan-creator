# Railway Operating Plan Creator: research spec

Status: draft for review, 2026-10-20. Revised through a walkthrough with the owner (human-led editing, a forgiving engine, individual cars in side view), then checked against an outside review, whose agreed points are folded in.
Owner: Orgo Nag, P.Eng

## 1. Problem

Operating plans already exist, and they're painful to work with. They live in PowerPoint slides, or as a list of steps on a single PDF. You can't watch the moves happen, you can't try a different order without redrawing, and anyone who wasn't in the room struggles to follow them.

I'm building a tool that animates simple operating plans. You lay out the plan, play around with the steps the cars will take, watch the train do the work, and then export it to share.

You build the plan yourself, on the canvas, and the tool looks over every move as you add it and points out anything worth a second look. If you already have a slide or PDF, an optional import can give you a rough starting draft, asking you about anything it had to guess.

## 2. Goals and non-goals

### Goals

1. Build an operating plan on the canvas by hand: lay out the track, set lengths, place the facility and cars, and add the steps one at a time.
2. Get helpful notes as you build it, never roadblocks: cars that may not fit, a move that may foul a switch, a shove past a buffer stop, power that looks to be on the wrong end.
3. Play the plan step by step, one animation per step, and try a different order of work.
4. Export and share the result: JSON, a share link, a standalone animated HTML page, and SVG.
5. Optionally, import an existing plan (most common file types) to get a rough draft. The AI asks a clarifying question for every assumption it makes, and the person decides.
6. Measure, with a small benchmark, which free model gives the best import, and how often it guesses wrong without asking.

### Non-goals (for now)

- Surveyed geometry or CAD accuracy. Track lengths are to scale, but the layout is a clean schematic, not a map.
- Signals, interlocking, speed restrictions, timetables or multi-train conflict checks. A step can still include a stop with a callout that explains it, for example "stop clear of S1 and wait for the signal".
- Accounts, a backend database or server-side storage, in Releases 1 and 2. If a real need comes up, Supabase is available to connect (section 4.3).
- Any proprietary railway data in the repo or anything published. All public fixtures are synthetic and drawn for this project; real plans are used only privately for testing (section 8.1).

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

None of this is needed to use the tool: the editor, the engine's notes, the player and the exports work with no AI at all. For the import button, the user can switch modes and models from a dropdown at any time, and the app records which model produced each plan. The public demo also ships with pre-run examples.

### 4.1 The shared free key

A key placed in browser code is public, so the project key never goes to the browser. It lives in a small proxy (a Cloudflare Worker on the free plan), and the proxy is locked down on both sides.

At OpenRouter:
- **The key has a $0 credit limit.** Even if it leaked, it couldn't spend money.
- **A guardrail allows only the chosen free models.** Any other model returns 403, and OpenRouter enforces this, not our code. The guardrail must actually be assigned to the key; creating it alone restricts nothing.
- **Every fallback in the ranked list is a free model**, so a fallback can never land on a paid one.
- **Setup acceptance test:** with the real key, a request for a paid model is refused, a free vision request with an image works, and the fallback list only ever reaches free models.

In the proxy:
- **An origin check** so browsers on other sites can't use it. This is one layer only: it doesn't stop scripts outside a browser, which is why Turnstile is the real gate.
- **A Cloudflare Turnstile check** blocks bots. Tokens are single use and last 5 minutes, so the app gets a fresh token for each import and for any retry.
- **A per-visitor daily limit**, for example 10 documents.
- **A cap on request size.**
- **The model list is fixed server-side.** The browser can't choose a model.

**"Auto-picked to the best"** means the proxy sends a ranked list of free models (best first, then fallbacks), taken from the latest benchmark results. If the top one is down or rate limited, OpenRouter falls back to the next. We update the list when the benchmark is re-run. This replaces OpenRouter's `openrouter/free` router, which picks at random.

**Limits to plan around** (confirmed in OpenRouter's limits page, Oct 2026): free models allow about 20 requests per minute. The daily cap is **per OpenRouter account, so every visitor shares it**: 50 requests a day if the account has never bought credits, 1,000 a day after a lifetime purchase of $10 or more. The project uses the owner's existing OpenRouter account, which is past that threshold, so the shared cap is 1,000 a day. One document is one or two requests, plus any repair retry; budget for retries too (an outside review says failed attempts also count, which OpenRouter's limits page doesn't state either way). When the shared cap runs out, the app says so and offers the other modes.

### 4.2 Sign in with ChatGPT

OpenAI now lets apps use a user's ChatGPT plan (Plus or Pro) for AI requests through "Sign in with ChatGPT" (OAuth 2.0 with PKCE). Images are supported when the chosen model accepts them, and the user sets a weekly cap for each app.

There's a catch for us. The self-serve flow in OpenAI's developer docs is for open-source tools that run on the user's own machine (callback on `127.0.0.1` only). A hosted website needs a client ID from OpenAI, which is currently a limited trial you request through a form. So this mode is planned for later, once we've applied and been approved. It would likely also need the proxy for the token exchange.

Claude subscriptions stay out: Anthropic's terms say Claude Free, Pro and Max sign-in is only for Claude Code and Claude.ai (reported Feb 2026). Claude models are still available through OpenRouter.

### 4.3 Supabase, only if needed

Releases 1 and 2 need no database: plans live in the browser and in share links. Supabase is available to connect if a real need appears. Likely uses, in rough order:

- **Short share links** for plans too big to fit in a URL comfortably.
- **The proxy,** as a Supabase Edge Function instead of a Cloudflare Worker, if Supabase is already in use.
- **A public gallery** of example plans, later.
- **Saving plans to an account,** later, if people ask for it.

Before adding it, check the free plan's limits at the time (for example, free projects can be paused when idle) and agree any spend first.

## 5. Architecture

Single repo in TypeScript. The core is a plain TypeScript package with no browser dependency: schema, engine, validate, layout. The app (Vite, React for panels) and the bench CLI (Node) both import that package. The renderer and player are plain SVG and DOM code with no framework, so the same code runs in the app, in the standalone export and in an embeddable player.

What makes this worth noticing isn't that an AI can read a slide. It's that the person can build a plan quickly and the tool understands switching. It animates the plan, and it can point out things worth a second look: 5 cars at 60 ft need 300 ft, 330 ft with slack, and the racks have 360, the spur is trailing point for this arrival, the power looks to be on the wrong end for the pull. It points these out; it never stops anyone. Today that gets argued over by eye on a slide. The architecture is built around the editor and that engine; the AI import sits off to one side.

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
| `layout` | Lane assignment and geometry in feet: the main on lane 0, branches on lanes to the arriving train's left or right, switches in order, approach length from the arriving train. Converts engine world states into positions on track paths | `schema`, `engine` |
| `render` | Draws tracks, facilities, callouts, and cars and locos as side-view silhouettes, as SVG. Applies one feet-to-pixel scale along the track. No framework | `layout` output |
| `player` | Moves groups along track paths between step states, with play, pause, step and seek. No framework | `render` |
| `editor` | The main way to make a plan, designed to feel like PowerPoint (section 5.6): track blocks, a step strip, drag to make moves, a properties panel. Every change goes through one typed command set (section 5.7), with undo and redo and autosave in the browser. Layout stays automatic | core, `render` |
| `commands` | The editor's commands as a documented tool interface: each command has a name, a JSON Schema for its inputs, a plain-language description and an undo. The editor's buttons and drags call these, and later an agent can call the same ones (section 5.7) | `schema`, `engine` |
| `ingest` | Turns most common files into what a model can read: page images plus text (section 7.1). One or several files at once, all in the browser | pdf.js, a zip reader |
| `adapters` | One interface, `read(doc, options) -> { reading, usage, warnings }`. Implementations: `none`, `proxy` (shared free key), `openrouter` (user signs in), later `chatgpt`. The reading comes back with its clarifying questions | `schema` |
| `questions` | Shows the import's clarifying questions as a short checklist, each with the AI's guess pre-filled. The person answers, accepts the guess or skips; answers are applied as editor commands, so they can be undone | `editor` |
| `proxy` | Cloudflare Worker holding the project key. Verifies Turnstile server side on every call, rejects oversized payloads before reading them, keeps a per-visitor daily count, and sends the ranked free model list | OpenRouter |
| `export` | PlanReading JSON, share link (compressed, version-tagged URL fragment), standalone HTML with the plan and player code embedded, SVG per step | core, `render`, `player` |
| `bench` | Node CLI over fixtures, models and renders. Scores the import's silent errors and question quality, plus topology, facilities, consist and sequence, with sequence scored on engine outcomes rather than verb strings. Writes the results table | core, `adapters` |

### 5.3 Rules

- The model only ever produces a PlanReading. Nothing downstream can tell whether a reading came from a model or a person.
- PlanReading is the only public format. The canvas model is an internal type, in feet, rebuilt from the reading on every change.
- One simulation. Validation, layout and scoring all use the engine; nothing else re-implements plan state.
- Core code has no DOM dependency; render and player have no framework dependency.

### 5.4 Order of work

Engine and layout with the demo plan first, running as a preview build from the first day it plays. Then the canvas editor, share link and exports: at that point the tool is complete without any AI, and that's Release 1. The repo stays private until then; then it goes public and the site goes live on GitHub Pages. Then the import button (Release 2) (ingest, adapter, proxy, questions). Then the small benchmark that picks the import model. Reading PowerPoint and PDF shapes as geometry is a second study, done only if the import results call for it (section 8.4).

### 5.5 What the AI does, and doesn't

The AI has one job: the optional **import** button. It reads the files the person drops in and returns a rough PlanReading plus a list of clarifying questions.

**It asks about every assumption.** Anything the AI did not read directly from the document (a length it estimated, a switch side it inferred, a car count it couldn't see, which cut goes where) must come with a question. Each question names the field it's about, asks it in plain words, offers the AI's guess, gives choices where they make sense, and says what in the document led to the guess. For example: "The spur's length isn't labelled. I guessed 800 ft from its drawn length next to the main. Is that right?" Fields read directly need no question.

The person works through the questions as a short checklist: answer, accept the guess, or skip and fix it later on the canvas. There's an "accept all guesses" button for people in a hurry. Answers become editor commands, so everything is undoable, and nothing reaches the plan without the person seeing it. If an answer changes the picture (for example "there are two spurs, not one"), the person can send the answers back for one more pass.

In Releases 1 and 2, the AI doesn't build the plan, edit it, run it, or judge whether it works. The person builds and edits; the engine points things out. Later, an agent may edit through the same commands the person uses (section 5.7), with the person watching and able to undo every change.

### 5.6 The canvas editor

The people using this are railroaders, customer service and industrial development staff, not software people. Many are not confident with computers. The editor should feel like PowerPoint, which they already use, and should make it hard to get wrong.

**Principles**
- **Looks and behaves like PowerPoint.** A toolbar of large buttons with an icon and a word, a step strip down the left like slide thumbnails, a properties panel on the right like the Format pane, right-click menus, and the usual keys (Ctrl+Z, Ctrl+Y, Delete, Ctrl+C and Ctrl+V for steps).
- **The drawing is automatic and to scale.** People never place or nudge track by hand, so they can't make a messy or impossible drawing. They decide what connects to what and how long it is, and the layout does the rest.
- **One obvious way to do each thing.** No modes to get stuck in; Esc always cancels.
- **Plain words.** Railway terms only where railroaders use them. A short tooltip on every button.
- **Undo is always visible** in the toolbar, not only on a key.
- **Saving is automatic and visible.** Changes save in this browser as you go, with a small "Saved in this browser" status, and a Download button gives the plan as a file. Opening a share link opens it as a separate copy, so it never replaces a plan already saved.
- **The drawing holds still while you work.** The scale doesn't change during a drag; the drag shows a preview and commits on release, and Esc puts things back. A **Fit plan** button refits the drawing when you want it. Zoom and pan are in Release 1, so long plans stay readable.
- **One gesture, one Undo.** If a single drag adds a cut, a move and a second step, one Undo puts all of it back.
- **Nothing is ever blocked.** People can't think of every situation in advance, and neither can we. The tool lets the person do what they want, and only points things out.
- **Notes, not errors.** When something looks off, a small note appears next to it in plain words ("Heads up: the racks hold 5 cars and you've moved 6"). Notes are information. They can be dismissed, and they never stop a step, a Play or an export.
- **Start from a template**: "Single spur", "Spur with runaround", or the demo plan, instead of a blank page.
- **Mouse first.** Big targets, readable at normal zoom. Touch is a nice extra, not a requirement.

**Building track with blocks**
- A new plan starts with a main line.
- Track blocks in the toolbar: **Turnout**, **Track end (buffer stop)** and **Facility**.
- **Drag a turnout onto a track** to place it. A new branch grows out of it with a default length, and the distance from the previous switch shows and can be edited.
- **The tool guesses the turnout's direction, and two flip buttons fix it.** When a turnout is dropped, the engine picks the most likely way for it to face from how the branch is dragged out. If that's wrong, **Flip up/down** (across the horizontal axis) moves the branch to the other side of the track (left and right), and **Flip left/right** (across the vertical axis) turns it to point the other way along the track (facing and trailing). Either flip redraws at once and can be undone.
- **Drag the end of the branch** to stretch it. It snaps in 10 ft steps and shows its length in feet as you drag, or you can type the length in the properties panel. Dropping a turnout on the new branch builds the next track off it, and so on.
- **Drag a branch's end onto another track** to join it back (a siding).
- **Drag a facility onto a track** to place it, and drag its ends to size it along the track. The number of 60 ft cars it holds shows as you drag.
- **Right-click any track** to rename it, set it as main, siding or spur, set its length, or delete it.

**Placing cars**
- **Every car is its own car.** Each has a type (boxcar, covered hopper, tank car, gondola and so on, section 6.5) that sets how it looks, loaded or empty, and optionally a reporting mark and number ("ABCX 1234"). Every car is drawn and planned at 60 ft and every loco at 80 ft, whatever the type (section 6.5).
- **Add cars in groups, handle them one by one.** "Add 5 covered hoppers, loaded" makes 5 separate cars in a row, each with its own permanent ID straight away. Any of them can be changed, renumbered or moved on its own.
- **Three things kept apart:** a car or loco (one piece of equipment, always the same ID), a named group (a handy label for some cars, such as "the loads"), and what's coupled right now (which cars are joined, in order). Switching changes what's coupled; it never changes what a car is or quietly changes what a group name means.
- **Cars already on site.** A "Place cars" button drops cars straight onto any track or facility before Step 1: empties waiting at the customer, cars stored on a siding, a bad-order car on a spur.
- **Numbered spots are fixed places.** A facility's spots (1, 2, 3...) are set when the facility is placed, 60 ft apart by default, and can be dragged. They're operating positions, so changing a car's length never moves spot 3. Cars dropped at a facility snap to spots, so a step can be "ABCX 1234 to spot 3". Spots are used for fit and placement but are not drawn by default: the facility shows as a box with its name, and the spot ticks and numbers can be switched on when someone wants to see them.

**Making the steps (like PowerPoint slides with Morph)**
1. Set the arrival: which way the train is heading (north, south, east or west) and which side of the drawing it comes in from (left or right).
2. Add the train: the loco or locos, and the cars, with a type, a count, and loaded or empty for each group. Place any cars that are already on site.
3. **Step 1 is the arrival.** The train stands on the main as it arrives.
4. **"New step" starts from the previous step's picture**, the way duplicating a slide does. Nothing has changed until you move something.
5. **In the new step, pick the cars and drag them to where they should end up.** Click a car, shift-click to add more, or drag a box around several. Selecting only selects. If the move needs cars uncoupled first, the tool shows the uncoupling as its own step before the move, so you can see it and change it. Cars slide along the track, so they can't be dropped off it. Dragging the loco (alone or with cars) off the edge of the drawing sends it away for other work; dragging it in from the edge brings it back.
6. **The tool works out the move.** Power behind the cars is a shove, power in front is a pull, a loco on its own is running light. It writes the caption ("Shove 5 loads to the unloading racks"), which you can edit.
7. **Small buttons on the train** do the rest: scissors between any two pieces of equipment to uncouple them there, a link to couple, and Load or Unload on cars at a facility for a customer step. A Stop button adds a stop with a callout ("Wait for the signal before entering the main"), and a Note button adds a plain slide where nothing moves.
8. **The engine looks over each step as you make it.** If something looks off, a small note icon appears on the step with the reason in plain words. The step still works and still plays.
9. **Play** animates from step to step, like Morph. Steps can be reordered by dragging them in the strip, and the engine looks over the whole plan again.

**One step, one animation.** Each step does exactly one thing: one move, one uncouple, one couple, one load or unload, one stop or one note. That keeps every step easy to follow on screen and gives the engine one change to check at a time. If someone tries a second thing in the same step (for example dragging a second cut after the first), the tool puts it in a new step and says so; Undo puts it back.

**As many steps as people like.** Thirty small steps to show a train easing into a track is fine. A step can also be a plain slide where nothing moves, just a caption or a callout over the current picture.

**Following the path the user took.** While a cut is being dragged, the engine follows the drag along the track. At each turnout, the way the pointer goes decides which route the cars take, so dragging up into the spur takes the spur and dragging along the main stays on the main. The engine records that route, so Play shows the same path the person drew, not just the shortest one. Small wobbles of the mouse don't count as a reversal; the drag has to clearly turn back (more than about a car length) before it's treated as one. If the drag does change direction (pull out past a switch, then shove back into another track), the tool shows the proposed route and splits it into two steps, and says so. If the engine can't follow the move at all, it doesn't refuse: the cars move to where they were dropped with a dashed, faded transition labelled "Route not established" (section 6.4).

Under the hood, each step is saved as one action in section 6.2, with its route and exact stopping position, so a step made by dragging and a step from the import are the same thing.

### 5.7 Commands an agent can use later

Every change to a plan, whether from a button, a drag or the import, goes through one command set. Designing it this way from the start means a natural-language agent can be added later (for example through Sign in with ChatGPT, or the person's own OpenRouter account) without rebuilding the editor.

- **Typed commands with plain descriptions.** For example `addTurnout(trackId, distanceFt)`, `flipTurnout(switchId, axis)`, `setTrackLength(trackId, ft)`, `placeCars(type, count, state, at)`, `addStep(action)`, `moveCars(carIds, to)`, `uncouple(betweenA, betweenB)`, `reorderStep(stepId, index)`. Each has a JSON Schema for its inputs and a one-line description, so the list can be handed straight to a model as tool definitions.
- **Read tools too:** get the plan, list the steps, get the engine's notes for a step, get the picture after a step as plain data.
- **Same rules for everyone.** A command from an agent goes through the same validation, engine notes and undo as one from the person. The agent can't do anything the person couldn't do, and every agent change appears in the step strip and can be undone.
- **Not in Releases 1 and 2.** The command set ships in Release 1 because the editor needs it anyway; the agent that talks to it comes later.

## 6. Data: the PlanReading format

**PlanReading** is the one public format. The schema file `docs/schema/plan-reading.schema.json` is currently the v0.3 draft; P1 turns it into v1 (permanent step IDs, explicit equipment lists, logical offstage ends) with migration from the drafts. The person writes it in the editor, or the import gives them a first draft of it. It holds the plan in railway terms: tracks, lengths, switches, facilities, consist, and the arrival, work and departure. It has no coordinates. It's what gets saved, shared, edited and scored.

The canvas model is internal. The engine and layout rebuild it from the reading on every change, in feet, and `render` applies one feet-to-pixel scale. (An early public draft of it, CanvasPlan v0.1, is kept in `docs/archive/` for reference.)

Why the split: a model can reliably read "the spur leaves the main on the left, 800 ft, buffer stop at the end". It can't reliably invent "offset 550". So the import sends only what has to be read from the document, and code works out everything that can be computed. The same is true in the editor: the person sets what connects to what and how long it is, and code does the drawing.

Worked example of the portfolio demo: `docs/schema/examples/customer-service-demo.reading.json`.

### 6.1 Plan structure

A plan follows the order a railroader thinks in:

1. **Arrival.** The train arrives on the main in **one direction**. The direction is fixed for the plan; serving the same customer from the other direction is a separate plan. The arrival also says which side of the drawing the train enters from, and whether the power is on the head end or the rear.
2. **Spotting and yard work.** An ordered list of steps that starts once the train is on the main. This is where the railroad puts cars on the customer's track (or related tracks) and picks cars up.
3. **Departure.** The railroad puts the train together on the main and leaves, with a direction and the cuts it takes.
4. **Customer work (optional).** The customer loading, unloading or moving cars with their own equipment. It isn't a fixed section: customer steps can sit anywhere in the work list, marked `actor: customer`.

### 6.2 PlanReading fields

```
PlanReading
  schemaVersion  "0.3"
  title, description?
  arrival        direction (eastbound | westbound | northbound | southbound), enters (left | right), on (main track id), locos (head | rear), text
  carLength      ft (default 60), allowancePct: the engine's internal slack check for fit notes (always at least 10)
  locoLength     ft (default 80)
  tracks[]       id, role (main | siding | spur | yard | lead), name?, lengthFt?, end? (buffer_stop | continues | rejoins)
  switches[]     id, on (track), to (diverging track), side (left | right), approach (facing | trailing), order?, distanceFt?
  facilities[]   id, name, kind, track, lengthFt?, startFt?, spots?
  consist        locos { count, type?, lengthFt? },
                 cuts[] { id, cars (count), carType?, state, carLengthFt?, for?, list[]? }: cars in the arriving train
                 onSite[] { id, cars, carType?, state, at, spot?, list[]? }: cars already on site before the train arrives
                 list[] holds individual cars when they matter: { id, type?, lengthFt?, state?, mark?, number?, spot? }
  work[]         actor, do, cars? (car or group ids), to?, spot?, stop?, between?, via?, text, callout?
                 stop: { track, ft, end (lead | rear) } or { beyond (switch id), ft, end }: exactly where the move ends
                 between: [a, b] for uncouple: the two pieces of equipment to split
  provenance     per field: read (with where in the source), assumed, unknown, or confirmed by the person
  departure      direction, cars?, text
  questions[]    import only: id, about (field path), ask, guess?, options?, basis
  notes[]        anything that didn't fit
```

The terms are chosen to match how a railroader would describe the plan:
- `side` and `approach` are relative to the **arriving** train. "The spur leaves on the left, facing point" is how you'd say it, and it's why a plan is tied to one direction.
- **Cars can be counted or listed in the file, but always become individual cars.** "5 loads for the racks" is a group with a count, which is how most imports describe them. When the plan is opened, every counted car gets its own ID. If a group gives both a count and a list, the list wins and a mismatch becomes a question. Lists run from the head end of the arriving train, or from the switch end of the track for cars on site. With several locos, each loco has its own ID too, and a step names which ones move.
- **Where a move stops** is saved in railway terms, never screen positions: a facility spot, a distance along a track with which end of the moving group is placed there ("the rear car 50 ft past S1"), or `offstage` with the end of the main it leaves by (`arrival_end` or `far_end`, never left or right, so mirroring the drawing can't change the meaning). A loco that leaves and comes back keeps its ID and which way it faces. A stop past the end of a track is kept as authored, shown where the person put it, and gets a note; nothing is shortened or pulled back.
- **Lengths are in feet and to scale, kept general on purpose.** Every car is drawn and counted at 60 ft and every loco at 80 ft, whatever its type. These are planning assumptions, not measured lengths, and fit notes say so. A length can be changed for one car or one cut when someone knows better.
- **A 10% slack check runs inside the engine.** It isn't added to the drawing or the spots. The engine uses it only when deciding whether to raise a fit note, and the note explains it: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft." The check never goes below 10%.
- **Track lengths mean usable standing length**, the length cars can actually stand on. On a branch it's measured from the clear point, 290 ft past the switch points (the 240 ft turnout plus 50 ft to get clear), so the branch's full length is 290 ft plus its usable length. A facility's length means its loading or unloading frontage along the track. Track lengths the document doesn't give are left out and the editor asks for them.
- **`questions`** appear only on an import draft. They make every AI guess visible and put the decision with the person (section 5.5). Once answered, the question is removed but its **provenance** stays: a guess the person accepted is marked "confirmed by the person", never "read from the drawing". The engine ignores provenance; the editor shows it. A field path is `collection.id.field`, for example `tracks.SPUR1.lengthFt`.

Names follow OpenStreetMap railway tagging where it fits (track roles, switch side). Concepts follow railML and RailTopoModel, but we don't copy railML's schema because of its licence (CC BY-NC-ND, see research notes).

**Work steps (`do`)**

| Actor | `do` | Meaning |
|---|---|---|
| railroad | `shove` | Push cars ahead of the power |
| railroad | `pull` | Draw cars behind the power |
| railroad | `uncouple` | Split the equipment between two named pieces (`between`); `cut_off` is the same thing between the power and its cars |
| railroad | `couple` | Couple to cars |
| railroad | `run_light` | Move the power alone |
| railroad | `runaround` | Shortcut: inserts the steps to get the power to the other end of its cars |
| railroad | `set_out` | Shortcut: inserts a move and an uncouple to leave cars on a track |
| railroad | `pick_up` | Shortcut: inserts a couple and a move to collect cars from a track |
| railroad | `stop` | Stop and hold, with a callout saying why (signal, derail, crew, customer gate) |
| customer | `load` / `unload` | The customer loads or unloads cars where they sit |
| customer | `move_cars` | The customer moves cars with their own equipment |
| either | `note` | A plain slide: nothing moves, just a caption and an optional callout |

Each step has exactly one `do`, `cars` (cut or car ids), `to` (a track, a facility, or `offstage` when the power leaves the drawing), optional `spot` and `via` (switches, in order), and a plain-language `text`, which becomes the step caption. In the editor, a reversal becomes two steps (section 5.6).

Any step can also carry a **`callout`**: `{ text, at? }`, where `at` is a switch, track or facility id. The canvas pins it to that spot during the step, for example "Stop clear of S1. Wait for the signal before entering the main." A `stop` step needs a callout.

**Shortcuts become ordinary steps.** `set_out`, `pick_up` and `runaround` do several things, so they're never saved as one step. When the person picks one, or the import reads one, it's expanded into the separate steps it stands for, each with its own animation and each correctable. A saved plan only ever holds single actions. Under those, the engine works on six primitives: `arrive`, `move`, `couple`, `uncouple`, `set_state` and `depart`. Scoring compares the expanded actions and routes, so a reading that said "set out" and one that said "shove, then cut off" compare as equal (section 8.2).

### 6.3 Layout: from reading to canvas

The `layout` module draws a clean schematic in the demo's style. It never tries to copy the original drawing's positions.

1. The main line is horizontal on lane 0 and always runs the full width of the canvas: it is continuous, so it reaches at least to the furthest branch end and never stops short while a branch carries on. The arriving train enters from the **left or the right**, as the plan says (`arrival.enters`), so the drawing can match how people picture the location. The heading is labelled clearly: each end of the main shows its compass point (for an eastbound train entering from the left, "West" on the left end and "East" on the right), with a small arrow and "Eastbound" by the arriving train. Everything else is drawn relative to that.
2. Lanes: "left" and "right" for switches mean the arriving train's left and right. For a train entering from the left, its left is up the page; for a train entering from the right, its left is down the page. A branch on the train's left goes on a lane on that side, and one on its right on the other side. A branch off a branch takes the next lane out in the same direction. Two branches on the same side get separate lanes so they never overlap.
3. Switches go on their track in `order`, spaced by `distanceFt` when given, otherwise evenly. The approach before the first switch isn't read from the document: layout makes it long enough for the whole arriving train to stand on the main, to scale, plus a margin. Past the last switch the main runs on by the turnout plus the arriving train's length, or further when a branch reaches further, so the main always ends at the far edge of the drawing.
4. A turnout is drawn to scale at about 240 ft from the points to where the branch runs parallel. A branch leaves at a fixed angle, then runs parallel to its parent. Facing switches diverge forward and trailing switches diverge back toward the arrival end. A siding that `rejoins` closes back onto its parent at its second switch.
5. One scale (feet to pixels) fits the longest lane to the canvas width, and every track is drawn to that scale. Tracks with no length get a default and a visible "length needed" marker.
6. Facilities sit along their track at `startFt`, or at the far end, and are drawn as a box with the facility's name. Their spots are fixed, numbered positions, 60 ft apart by default; the engine uses them for fit notes and stop positions, but they are not drawn by default, since spot ticks and numbers clutter the picture. Car length and scale matter only for the does-it-fit arithmetic.
7. **Cars and locos are drawn in side view**, as realistic silhouettes of their type, to scale along the track (section 6.5). To make room for them, the gap between parallel tracks is stretched beyond scale; lengths along the track stay true. On the angled part of a turnout, cars tilt to follow the track.
8. Callouts are drawn as a labelled marker at their `at` feature, kept clear of the track, and shown only during their step. Anything a person typed (captions, callouts, names, reporting marks) is always shown as plain text, never treated as markup.
9. Unit positions for each step come from the engine's world states, not from layout's own reasoning.

First release covers tier 1 and tier 2 layouts: the main, spurs, one siding that rejoins, one runaround. Yards with ladders (tier 3) come later.

### 6.4 Validation and notes

Two kinds of checks. Neither one stops the person; the first only tidies files on the way in.

**File checks** apply only to files coming in: an import draft, a shared link or a JSON file. Constrained decoding can force the right JSON shape but not the right content, so these are checked and fixed up on the way in, with the problems listed for the person:
1. Every id is unique and every reference resolves.
2. The arrival is on a `main` track, and every switch's `on` and `to` are different tracks.
3. A spur is reached by one switch; a siding that `rejoins` is reached by two.
4. Every `via` switch is on a real path between where the move starts and its `to`.

**Notes from the engine** apply to everything, and never block a step, a Play or an export. The engine can't foresee every situation, so these are things to look at, not rules:
5. **Fit.** A note when cars may not fit where they're sent. It looks at everything that will stand there: cars already on site, the cars being moved, and the loco if it stays coupled. The 10% slack check is applied inside, and the note shows the numbers and the assumption: "6 cars at 60 ft = 360 ft, plus 10% for slack = 396 ft; the racks have 360 ft. Lengths are the general 60 ft planning length."
6. **Clear of switches.** Kept simple on purpose. Turnouts are drawn to scale at about 240 ft, so people can see when cars are sitting in a switch. If any part of a group (its far end as well as its near end) stops within about 290 ft of a switch it isn't using (the 240 ft switch plus about 50 ft to get clear), a note says it looks like they may be fouling it. It still shows and plays exactly as placed. The exact clear point really depends on the switch type and track spacing, so this is a rule of thumb, not a calculation.
7. **Buffer stops.** A note when cars are moved past the end of a track.
8. **Power on the right end.** A note when the power looks to be on the wrong end for the move being made. The engine judges this from the actual order of equipment, the direction of this move and the route available, not from a blanket rule. Facing and trailing are fixed relative to the arrival, but each move can go either way, so a head-end train can pull past a trailing-point spur and then shove back into it with no runaround.
9. **Runaround.** A note when a runaround has no siding with two switches, or no room for the power.
10. **Unclear move.** The engine couldn't establish a route. The step still saves, plays and exports, but its transition is shown differently so nobody mistakes it for a worked-out move.
11. **Work sequence.** A note when the order looks off: the power moving cars it isn't coupled to, a customer unloading empty cars, or cars listed for departure that aren't on the train.

How each step is shown:

| Engine result | Shown as |
|---|---|
| Route understood | Equipment follows the track |
| Route understood, with a note | Normal animation, with the note |
| Route not established | Dashed, faded transition labelled "Route not established" |

Notes show on their steps and in one list the person can open or ignore. Exports and share links leave the detailed notes out unless the person chooses to include them, but always keep the "Route not established" label, because it explains what the viewer is seeing.

**Plan metrics** come from the same engine run, with fixed meanings: a move is one movement of one coupled group, however many steps show it; feet travelled is counted for the locos and for each car separately; switch throws count changes from the switch's normal position at the start; couplings count couple steps. A step with no established route makes the plan's totals "incomplete", never silently zero. They let two versions of a plan for the same customer be compared side by side (section 12.3).

### 6.5 Car and locomotive types

**Planning lengths are general: 60 ft for every car and 80 ft for every loco.** The type only changes the silhouette, so a tank car looks like a tank car, but it's drawn and counted at the same 60 ft as a boxcar. This keeps plans simple. It is a planning assumption, not a safe upper bound: some cars are much longer (an autorack is about 94 ft), so fit notes always state the assumption, and the 10% slack check inside the engine adds a margin. Anyone who knows the real equipment can set an exact length on a car.

The typical real lengths below, from car builder, lessor and reference sources (`docs/research/car-lengths.md`), are kept for reference and for anyone who wants to set an exact length on a car. They are lengths over couplers, rounded to the foot.

| Type | Typical real length | Source quality |
|---|---|---|
| Boxcar, 50 ft | 58 ft | Builder sheet |
| Boxcar, 60 ft high cube | 68 ft | Builder sheet |
| Covered hopper, small (cement, sand) | 42 ft | Builder sheet |
| Covered hopper, large (grain) | 55 ft | Estimate from similar cars |
| Covered hopper, plastics | 60 ft | Builder sheet |
| Open-top hopper (coal) | 57 ft | Estimate |
| Gondola (52 ft mill) | 58 ft | Builder sheet |
| Tank car, general service | 60 ft | Builder sheets for similar cars |
| Tank car, pressure (LPG) | 67 ft | Builder sheets differ by 3 ft |
| Flatcar, bulkhead | 65 ft | Estimate from length over strikers |
| Flatcar, centerbeam | 80 ft | Sources conflict; to confirm |
| Flatcar, 89 ft | 95 ft | Builder and railway sheets |
| Autorack | 94 ft | Builder sheet |
| Double-stack well car (single unit) | 77 ft | Builder sheet |
| Reefer (72 ft) | 82 ft | Builder sheet |
| Loco, six-axle road unit | 74 ft | Builder and reference figures |
| Loco, four-axle (GP38-2 class) | 59 ft | Lessor spec sheet |
| Loco, switcher (SW1500 class) | 45 ft | Reference figure |

Several figures came from search summaries rather than a sheet read in full, and the estimates are marked. These are defaults to make the drawing look right, not engineering values; worth a check by someone with current equipment data before the public release.

First set of types: 50 ft boxcar, 60 ft high-cube boxcar, small covered hopper (cement, sand), large covered hopper (grain), plastics covered hopper, open-top hopper, gondola, general service tank car, pressure tank car, bulkhead flatcar, centerbeam flatcar, 89 ft flatcar, autorack, double-stack well car, reefer, and a generic car. Locos: six-axle road unit, four-axle (GP38-2 class), and switcher, all planned at 80 ft.

Loaded and empty look different where it's visible from the side (coal or scrap showing in a gondola or open hopper, a load on a flatcar), and every car also carries a small loaded or empty marker. Cars are not labelled on the drawing. Each car keeps an internal ID so the engine can track it, and an optional reporting mark and number in the data, but nothing is written on or under the cars by default. The same goes for facility spots: car length and scale decide whether a cut fits, and the spot positions decide where cars stand, but neither spot ticks nor spot numbers are drawn unless asked for.

### 6.6 Editing and replay

The saved plan is the starting picture plus the ordered steps. The picture after each step is always worked out again from those; it's never saved on its own. So:

- **Changing or reordering a step** recalculates every step after it. Later steps keep what they were meant to do (which equipment, where to, by what route). Any step whose meaning is now in doubt (say Step 5 picks up cars that an edited Step 2 no longer puts there) is highlighted for review and still plays as best it can. Nothing is silently invented to fill the gap.
- **Deleting a track or car that steps refer to** leaves those steps in place, marked as needing attention and editable, with the gap shown plainly.
- **Files with broken references** (duplicate IDs, links to things that don't exist) are opened as an incomplete draft: everything recoverable is kept, and what was repaired or left unresolved is listed.
- **Acceptance test:** move the same cars three different distances along one track in three steps, save, reopen, and get exactly the same three positions and routes.

## 7. The import: problems and files

- Model returns invalid JSON: one repair retry with the validator messages fed back. If it still fails, keep every part that parses, turn what's missing into questions for the person, and open the editor.
- Model times out or the key is rejected: say so plainly and offer to build the plan by hand.
- Free model rate limit hit (HTTP 429): say so plainly, show when to retry, and offer the person's own OpenRouter account or building by hand.
- Unsupported or encrypted file: say so, suggest a format that works (section 7.1), and remind the person they can build the plan by hand.
- The import returns too many questions (more than about 20): show the most important first, grouped by section, and let the person stop and edit on the canvas.
- Files disagree (the slide shows 5 cars, the spreadsheet says 6): the import doesn't pick one silently; it asks, showing both values and where each came from.
- Long documents: a PDF shows page thumbnails and a deck shows slide numbers and titles, and the person ticks the pages that hold the plan (up to about 5), so the model isn't sent a 40-page document.
- Too big: files over about 20 MB in total are refused with a plain message, before anything is sent.

### 7.1 Files the import accepts

All reading happens in the browser. One or several files can be dropped at once, for example a slide plus a spreadsheet of car counts. The libraries for reading Word and Excel files must have open licences (to check at build time).

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
| CAD files (DWG, DXF) | Not accepted. The app asks for a PDF export of the drawing |
| Hand-drawn sketches | Not supported. Plans should be printed or digital; a scan of a printed plan is the roughest input the import is built for |

Scanned PDFs and images go straight to the vision model, which reads the text itself. There's no separate OCR step and no extra cost: a scanned page costs the same as any other page image, and nothing on the free models.

Reading the shape list from PowerPoint or Visio is lighter than the vector pipeline in section 8.4. We don't build a track graph from geometry; we only describe the shapes in text and let the model interpret them, with questions where it's unsure.

### 7.2 Privacy: the preview is exactly what gets sent

Anything sent to a model goes to OpenRouter and the model's provider, and free models in particular may log or train on what they receive. The rule is simple: **the preview shows the complete content that will be sent, and nothing else is sent.**

1. **A clear warning before every free import:** "This uses a free AI model. What you send may be shared with the model's provider. Only what you see on the next screen is sent, and you can check it first."
2. **Every piece is listed on the preview.** Each thing that will go out appears as its own item: page images, each embedded picture, a PDF's text layer, a slide's shape labels, a table from a spreadsheet. Items can be removed one by one.
3. **Cover-up boxes are burned in.** Covering a name on an image re-draws that image with the area blacked out before it's sent. If the same words also appear in a text item (a PDF text layer, a shape label), those text items are flagged too, and they're removed from the request unless the person edits and keeps them.
4. **Text is off by default.** PDF text layers and Word or Excel text go only if the person ticks them. Shape labels from PowerPoint and Visio are shown as an editable list.
5. **Stripped automatically:** file names, author and company metadata, speaker notes, comments, hidden slides, and email addresses and phone numbers in any text.
6. **Nothing is sent without the Send press.** The person can always skip the import and build by hand.

**PowerPoint and Visio, honestly.** The app doesn't draw slides, so for these files the preview is the list of what will actually be sent: the shape labels as text, and each embedded picture as its own image, with cover-up boxes on those pictures. There's no pretend slide thumbnail. Slides are picked by number and title. For a faithful picture of the whole slide, the app suggests exporting it as PDF.

The same rules apply when the person uses their own OpenRouter account (only the warning's wording changes), and to the private test set in section 8.1: those files are also sent to hosted models when tested, so they go through the same preview and stripping.

## 8. Benchmark design

The benchmark is a side study with one practical purpose: pick the free model the import button uses, and check that its questions catch its mistakes. There is no public dataset for parsing rail track schematics (see research notes), so the project builds a small one.

### 8.1 Fixtures

- About 15 synthetic plans in three tiers:
  - Tier 1, single customer spur (5 plans; includes the demo).
  - Tier 2, two customers or a run-around move (5 plans).
  - Tier 3, a small yard with several tracks and customers (5 plans). These join the benchmark once layout handles tier 3, since layout draws the fixtures.
- For each plan, the ground truth PlanReading is written first, and layout draws it. Code then renders it as PPTX, PDF, clean PNG, a "scanned" PNG (slight rotation, blur, noise), and a "photo of a slide" PNG (perspective, glare). The answers are exact by construction.
- Known weakness: these drawings come from our own layout code, so they're tidier than real ones. So four or five extra plans are drafted directly in PowerPoint in a messier, real-world style (odd fonts, overlapping shapes, arrows, step lists in text boxes), still made up and with no proprietary content, and reported separately.
- **Private test set.** Real op plans found online, checked by the owner for being genuine, are used only as a private test set. They live outside the repo (the `private-fixtures/` folder is git-ignored), are never committed, shared or published, and only aggregate scores from them are reported, with no file names, customers or locations. The public benchmark stays fully synthetic.

### 8.2 Scores (each 0 to 1)

Scoring compares the model's PlanReading with the true one. No coordinates are involved.

| Score | How |
|---|---|
| `valid` | Passes the schema and validator after at most one repair |
| `topology` | Tracks matched by role and by how they connect (graph match); switch side and facing/trailing correct; track lengths within 5% when the document states them |
| `facilities` | Facility on the right track, name match, length and spot count |
| `consist` | Loco count; cars with the right counts, types, states and destinations; reporting marks and spots where the document shows them; cars already on site |
| `sequence` | Arrival direction and power position, then both readings are expanded to single actions and compared on those actions, their routes, and the picture after each one (which cars are where, coupled to what, loaded or empty), plus departure direction and cars. A reading that says `set_out` where the truth says `shove` then `cut_off` scores the same, because it expands to the same thing |
| `overall` | 0.35 topology + 0.15 facilities + 0.15 consist + 0.35 sequence, and 0 if not valid |

Each fixture records which fields its drawing actually shows, which it leaves out, and which it shows unclearly (blurred, ambiguous or contradicting another label). Fields left out or unclear are the ones a good import should ask about. That list is what the question scores below are measured against.

- **Held-out plans.** A few plans are set aside and not looked at while prompts and file reading are being tuned, and are only run at the end, so the results aren't just a test of examples the code was tuned on.
- **Reported per plan, not just per image.** Five renders of one plan test robustness, but they're one arrangement, not five; results are shown both ways.
- **Hand-checked engine examples.** Because the same engine draws the fixtures and scores them, a few plans also have their step-by-step states worked out by hand, so a shared engine mistake can't make the results look better than they are.

Question quality, the measure that matters most for a human-led tool:

| Score | How |
|---|---|
| `silent errors` | Fields the draft got wrong **without** asking about them, per plan. The target is zero; this is the headline number |
| `unsupported guesses` | Fields the draft filled in without the document supporting them and without asking, even when the guess happened to be right |
| `question precision` | Share of questions that were about something the document doesn't say or shows unclearly, so the person isn't buried in needless questions |
| `correction effort` | Number of edits needed to turn the answered draft into the true plan. A high score can still hide one missing connection that makes a draft tedious to fix; this shows it |
| `after answers` | `overall` again after applying the true answers to the questions. Shows how close the draft gets once the person has done the checklist |

**Usable** means `valid` and `overall` of at least 0.8 after answers, with silent errors near zero: a first draft the user only needs to touch up. This threshold is a starting guess; we'll check it by timing a few real fix-ups.

Each run also records input and output tokens, cost in USD (from the provider's usage response), wall time and repair count.

### 8.3 Matrix for the first run

| Group | Models (first pass) | Where |
|---|---|---|
| Free | `openrouter/free` (random free model), plus 2 or 3 pinned `:free` vision models | OpenRouter, free tier |
| Cheap hosted, open | Qwen3-VL 32B, Gemma 4 31B, Qwen3-VL 235B-A22B | OpenRouter |
| Ceiling, closed | Claude Opus 5.5 | OpenRouter, reference only |

The first benchmark runs the import through exactly the same reading path as the real app (section 7.1; PowerPoint as shape labels and pictures, not a rendered slide) on every render. The result table lists every model with mean overall, usable rate, cost per document and time per document, separately for the layout-drawn and the messy PowerPoint fixtures. The recommendation, and the proxy's ranked free model list, is the cheapest setup whose usable rate is within a few points of the best.

### 8.4 Second study: reading vectors directly

Two more pipelines stay in the research plan as a second study, done only if the import's topology score falls below the usable line:

- **A. Vector first.** Read lines, shapes and text from the PPTX or PDF directly, build the track graph with geometry code, and use a model only to interpret labels and steps.
- **C. Hybrid.** Build the track graph with geometry code first, then give the model the page image plus that graph, and have it answer by element id.

Both need the hardest code in the project (PPTX shape geometry, pdf.js vector paths), and on our own synthetic fixtures they would mostly be parsing our own output, which proves little. So this study only runs on the messy PowerPoint fixtures, and only if the import needs the help. Prior work on P&ID and circuit diagrams suggests hybrids help (see `docs/research/prior-art.md`); the study would test whether that holds here.

## 9. Cost estimate and budget

Rough sizes per document: page image about 1,500 to 3,000 tokens, instructions and schema about 2,000, output about 2,000. At hosted open-model prices seen in Aug to Sep 2026 (about $0.10 to $0.26 per million input tokens and $0.34 to $1.04 per million output; secondary trackers), that is roughly $0.001 to $0.003 per document.

Full first run: about 15 plans (10 drawn by layout in tiers 1 and 2, plus 4 or 5 messy PowerPoint ones) x 5 renders x 3 hosted open models is a couple of hundred calls, well under $3. The Opus 5.5 ceiling costs more per call; its estimate gets worked out from current OpenRouter pricing before that run. **Proposed cap: $15 for the first benchmark, and nothing is spent without a go-ahead and a per-run estimate.** Free-tier runs cost nothing but share the daily cap in section 4.1: a free group of about 4 models over 75 documents is about 300 requests, The project's OpenRouter account already has well over $10 of lifetime credit purchases, so it gets the 1,000 a day cap, and the free group fits in a day. It still runs at quiet times so it doesn't use up the public import's quota.

## 10. Canvas and animation

Layout (section 6.3) produces the geometry, and the renderer only draws it. The demo already shows the right drawing technique: tracks as SVG paths, and units placed with `getPointAtLength` and rotated to the path angle. The player eases each group from one step's world state to the next.

Library choice (details in `docs/research/canvas.md`): plain SVG and small geometry helpers, with no framework in `render` or `player`, and React only for the editor panels. tldraw is ruled out by its production licence. Konva and PixiJS are ruled out because SVG export matters.

Visual language follows the portfolio demo (ink background, gold facility boxes and labels, JetBrains Mono labels, Archivo headings), with the plain boxes replaced by side-view silhouettes of each car and loco type (section 6.5). Loco red, and the demo's amber for loaded and outline for empty, carry over as accents. The standalone export inlines its fonts or falls back cleanly, so it works offline and in locked-down corporate browsers.

## 11. Publish and export

- **PlanReading JSON:** the source of truth, re-importable. Older versions are migrated on import.
- **Share link:** the plan, compressed into the URL fragment and tagged with its schema version. The fragment is never sent to a server, so a static host can serve it. If big plans make links too long to paste into an email, Supabase can store the plan and give a short link instead (section 4.3).
- **Standalone HTML:** one file with the plan and the player code embedded, in the demo's style. This is what goes on the portfolio.
- **SVG:** a still for each step.
- **What's in an export:** the whole plan, including names, reporting marks and callouts, so anyone with a share link or file can see it. The share dialog says so in one line. Engine notes are left out unless the person chooses to include them.
- **Later:** an embeddable player (one script tag), a crew briefing page, WebM video.

## 12. First release, phases, and what comes after

### 12.1 Releases

**Release 1: the editor (goes public).** Everything needed to build, play and share a plan with no AI:
- PlanReading v1 as the one public format, with migration from v0.2 and v0.3.
- Engine (plan state, primitives, shortcut expansion, notes, metrics, replay), validate, and layout for tier 1 and tier 2. Render and player with no framework, with side-view silhouettes for the car and loco types in section 6.5.
- The canvas editor in section 5.6, built on the command set in section 5.7: track blocks and flip buttons, stretch track, facilities with fixed numbered spots, individual cars and Place cars, steps made like slides by dragging (including leaving and returning off the edge), engine notes and "Route not established" transitions, templates, zoom and pan, autosave with visible status, undo and redo.
- Share link, standalone HTML export, SVG per step, PlanReading JSON download and open.
- Three example plans, including the portfolio demo.
- At the end of Release 1: the repo goes public under Apache 2.0 and the site goes live on GitHub Pages.

**Release 2: the import.** The optional import button for the files in section 7.1, with page picking, the full privacy preview (section 7.2), clarifying questions and provenance; the `none`, `proxy` and `openrouter` adapters; the proxy on a Cloudflare Worker; and the small benchmark that picks the import model. Formats can land one at a time inside this release, each with its own checks, so a slow parser doesn't hold up the others.

Out for now: vector pipelines A and C, tier 3 yards, WebM, Sign in with ChatGPT, a natural-language agent (the command set it would use is in Release 1), the gallery. Not planned at all: CAD files and hand-drawn sketches as import input. Compare mode goes in if the engine makes it trivial.

### 12.2 Phases

| Phase | Delivers | Done when |
|---|---|---|
| P0 Spec | This doc, research notes, PlanReading schema, demo example, and the demo's expected-state table (section 13) | Reviewed and approved |
| P1 Engine and player | Schema v1 and migration, engine with replay, validate, layout (tier 1), render with silhouettes, player; private preview build | The demo plan plays step by step and matches its expected-state table, and the engine shows its fit note at the racks |
| P2 Editor and sharing (Release 1) | Command set, canvas editor, undo, zoom and pan, share link, standalone HTML, SVG, JSON download and open; tier 2 layout; repo public, site live on GitHub Pages; portfolio branch line | Someone who uses PowerPoint but not CAD can build the demo plan from the "Single spur" template, and edit an existing plan, in under 10 minutes each without help, and share it by link, with no AI. The acceptance scenarios in section 13 pass |
| P3 Import (Release 2) | Ingest for the section 7.1 files, page picking, privacy preview, adapter, questions and provenance, proxy with Turnstile and limits, Sign in with OpenRouter | A PDF of a tier 1 plan becomes a draft plus questions; after answering them it plays on the live site, on the free mode. Other formats follow one by one |
| P4 Benchmark | Fixtures (layout-drawn, messy PowerPoint, held-out), bench CLI, scoring, results page; proxy model list set from results | Results table published in `docs/results/` |

### 12.3 After Releases 1 and 2, ranked by impact against effort

The engine's notes, the switching know-how rail people will talk about, are already in Release 1. After that:

1. **Plan metrics and compare two plans:** same customer, two orders of work, numbers side by side. That's how a plan gets sold to a customer and a crew. Low effort once the engine exists.
2. **The open format:** name it, publish the schema at a stable URL, a one-page description with three examples, under Apache 2.0.
3. **Embeddable player:** one script tag, works on any static page including an internal wiki.
4. **Crew briefing export:** a printable page with the step list, car counts, which cut goes where, switch positions per step, and callouts.
5. **Public gallery:** example plans in the repo, submitted by pull request, once the format is stable.
6. **Vector pipelines A and C:** the second study (section 8.4).

## 13. Testing

- Unit tests (Vitest) for the engine first: every verb expansion, every note rule, migrations, and every scoring function.
- Property tests for a forgiving engine: on random plans, including odd ones, the engine never crashes, produces a step for every step, and never loses or duplicates a car.
- Snapshot tests for layout, one per tier, including trains arriving from the left and from the right.
- Golden test for the demo, on what it means rather than its coordinates (the hand-built demo isn't to scale): same tracks and switch, the same order of work, cars at the racks after the shove, the empties on the train at departure.
- Privacy tests for the import: metadata, notes, comments, hidden slides, emails and phone numbers are gone from what's sent, and covered-up areas are blank in the images.
- One browser smoke test for the player, and browser tests for the main editor actions (place a turnout, flip it, stretch a track, place cars, make a step by dragging, undo).
- Hallway test before Release 1: two or three people who use PowerPoint but not CAD build the demo plan while we watch, without help. Anything they get stuck on gets fixed or simplified.
- The benchmark runs on demand, never in CI (it can cost money).

**Demo expected-state table.** Before P1 code, write a table for the demo plan showing, after each step: every car and loco ID, where it is (track and distance), the order, what's coupled, loaded or empty, and the notes expected. It's the reference for both building and review.

**Acceptance scenarios** (must pass before Release 1):

| Scenario | What must be shown |
|---|---|
| Three partial moves along one track | Every stopping position survives saving and reopening |
| An earlier step is changed or reordered | Later steps recalculate predictably and affected steps are highlighted |
| One middle car is separated and moved | IDs, order and couplings survive Undo, Redo and reopening |
| A plan with a trailing-point spur is mirrored left to right | It still means the same moves |
| Loads are moved toward cars already on site | The fit note counts both groups |
| A car is given a longer length than 60 ft | The fit note changes and still states its assumptions |
| The loco leaves and comes back | The same loco, facing the same way, returns through a named edge |
| A route can't be established | The step still saves, plays and exports, labelled "Route not established" |
| A share link is opened while another plan is saved | The saved plan is kept; the link opens as a copy |
| One drag adds an uncouple, a move and a second step | One Undo restores everything |

Release 2 adds: **a covered-up import**, where the covered content is absent from every outgoing piece (image, text layer, shape labels).

## 14. Risks

| Risk | Mitigation |
|---|---|
| The engine's switching rules are harder than they look (power end, facing versus trailing, runarounds) | Write them once in the engine with tests and property tests; nothing else re-implements them |
| Layout breaks on branches off branches, rejoining sidings or crowded sides | Lane assignment from the start; tier 3 yards stay out of Releases 1 and 2 |
| Saved plans and share links break when the schema changes | Version tag on every file and link; a `migrate` function per version from day one |
| Synthetic fixtures flatter the model | Messy PowerPoint fixtures, reported separately |
| Free models change provider, ignore JSON schema or refuse images | Validate locally; record the exact model and provider on every plan and show it in the UI |
| Shared free quota used up by a few heavy users or bots | Turnstile verified server side, per-visitor daily limit, payload cap, images downscaled; the app falls back to the other modes |
| Project key abused | Key never reaches the browser; $0 credit limit and a guardrail model allowlist at OpenRouter |
| A user's own OpenRouter key sits in the browser | Strict Content Security Policy that allows only our own scripts plus Cloudflare Turnstile's, key kept in memory or session storage, clear sign-out |
| Free endpoints may log or train on prompts | Warning before every free import; only what the preview lists is sent, with private details stripped and cover-ups applied across every piece (section 7.2). The public fixtures are synthetic; the private test set goes through the same preview rules |
| People with low computer confidence get lost in the editor | PowerPoint-like design (section 5.6), templates, the hallway test before release |
| A share link or export passes a plan around further than intended | The share dialog says the link contains the whole plan; nothing is stored on a server |
| Licences change (Gemma, Qwen, tldraw) | Record the licence per model in results; re-check before going public |

## 15. Decisions and open questions

Decided with the owner (2026-10-20):

**Product**
- The person does most of the work. Canvas editing is the main tool. In Releases 1 and 2, AI is at most one optional import button. The editor's commands are designed as a tool interface so a natural-language agent can be added later (section 5.7).
- Release 1 is the editor, with no AI, and goes public; the import is Release 2.
- Nothing is blocked. The engine's findings are notes the person can ignore; unclear moves still play, shown as "Route not established"; any number of steps, including static ones, is fine.
- Steps save exact stopping positions in railway terms; the picture after each step is recalculated, and edits to earlier steps flag affected later ones (section 6.6).
- Architecture and first-release scope as revised after the senior review: engine first, PlanReading as the only public format, vector pipelines as a second study.
- Licence: Apache 2.0, for the patent grant and clear trademark terms that larger organisations look for.

**Editor and drawing**
- The editor feels like PowerPoint: automatic, to-scale drawing, track built by dragging turnout blocks and stretching track ends, steps made like slides by dragging the train to where it ends up (section 5.6).
- Turnout direction: the engine guesses it when a turnout is placed; Flip up/down changes left and right, and Flip left/right changes facing and trailing.
- The train arrives from the left or the right of the drawing, with the compass heading labelled at the ends of the main and by the train; everything else is drawn relative to that.
- Each step shows one animation (one move, uncouple, couple, load or unload, stop or note). Shortcuts like set out, pick up and runaround expand into single steps. The engine follows the route the user dragged through each turnout and splits a direction change into two steps.
- Leaving and coming back: dragging the loco (alone or with cars) off the edge of the drawing sends it away for other work, with a callout if needed; dragging it in from the edge brings it back. In the data, the reserved target `offstage`.
- Cars and locos are drawn in side view, as realistic silhouettes per type, to scale along the track, with the gap between tracks stretched beyond scale to fit them.

**Plan data**
- One plan per arrival direction. Sections: arrival, spotting and yard work, departure, with optional customer steps anywhere.
- Move vocabulary as in section 6.2. Stops and callouts are in; signals and interlocking logic stay out.
- Individual cars: every car can be placed, numbered, typed and spotted on its own; counts stay as a shortcut. Cars already on site are placed before Step 1. Facilities have numbered spots.
- Track lengths to scale in feet, meaning usable standing length. All cars are drawn and counted at 60 ft and all locos at 80 ft, whatever the type. A 10% slack check runs inside the engine for fit notes only, explained in the note when it matters; it's not added to the drawing. The 80 ft loco rounds up from modern six-axle road units (EMD SD70ACe 74 ft 3 in; GE ES44AC 73 ft 2 in; GE ET44AC 74 ft 6 in).
- Switches are drawn about 240 ft long, to scale. Cars stopped within about 290 ft of a switch they aren't using get a "may be fouling the switch" note, but are still shown as placed. No per-switch clearance settings.
- Clean auto-layout from the track connections. The AI sends no coordinates.

**AI import**
- Default mode uses a project OpenRouter key behind a proxy, limited to free models, with the best free model picked from benchmark results.
- The project key lives on the owner's existing OpenRouter account, which already qualifies for the 1,000 requests a day free cap. No credit purchase needed.
- Privacy: a clear warning before every free import; the preview lists every piece that will be sent, private details are stripped, and cover-ups apply across every piece (section 7.2).
- The import asks a clarifying question for every assumption it makes.
- The import keeps all the formats in section 7.1, with a preview that lists every piece that will be sent (section 7.2). It does not accept CAD files (DWG, DXF) or hand-drawn sketches. Scans of printed plans are supported; there's no separate OCR cost.
- No local models and no Ollama. Sign in with ChatGPT is planned for later, after applying for a client ID.
- Accuracy ceiling in the benchmark: Claude Opus 5.5, called through OpenRouter, as a reference point only.
- Real op plans found online form a private test set only: never committed or published, aggregate scores only. The public benchmark is synthetic.

**Hosting**
- The repo stays private until Release 1 (the editor) is done. Then it goes public and the demo goes live on GitHub Pages; until then, a private preview build.
- Proxy on Cloudflare Workers, free plan. Supabase stays an option for storage later.

Confirmed for P1 (2026-10-20): spots are numbered from the switch end; usable length starts at the 290 ft clear point; where the train stands on arrival is the person's choice (it starts 100 ft short of the first switch only until they move it); people see more or less of the main by zooming and scrolling. The full list of ten conventions is in the P1 plan.

Open: none.

## 16. Related docs

- `docs/research/models.md`: candidate models, licences, prices, structured output
- `docs/research/prior-art.md`: diagram-to-graph research and rail data formats
- `docs/research/canvas.md`: canvas, animation and document ingestion libraries
- `docs/research/car-lengths.md`: default car and loco lengths with sources and silhouette notes
- `docs/research/architecture-review.md`: the senior architecture review this revision is based on
- `docs/schema/plan-reading.schema.json` and `docs/schema/examples/`
- `docs/archive/`: the early CanvasPlan v0.1 draft and its demo example
