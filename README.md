# Railway Operating Plan Creator

An open research project. Build a rail operating plan on a canvas, play it step by step, and share it. You lay out the track to scale, place the customer's facility and the cars, and add the moves one at a time. A switching engine looks over every move as you go and points out anything worth a second look, such as cars that may not fit at the racks. It never stops you. The editor's commands are built so an AI agent could drive them later, with you able to undo anything. Then export the plan as JSON, a share link, an animated page or SVG.

If you already have a plan in PowerPoint, PDF, an image or another common format, an optional import gives you a rough first draft. It asks you about every assumption it made, so nothing goes into the plan without you seeing it.

A small benchmark picks the free model the import uses, and measures how often it guesses wrong without asking.

Status: Release 1 is built. The engine and player (P1) and the canvas editor with sharing (P2) are done: build track by dragging turnouts and stretching track ends, place facilities and cars, make steps by dragging the train, undo anything, and export the plan as JSON, a share link, a standalone HTML page or an SVG per step. The site is live at https://orgonag.github.io/railway-operating-plan-creator/ and redeploys from `main` through `.github/workflows/pages.yml`.

How to run:

- `npm install`, then `npm run dev` for the editor at http://localhost:5173 (this also builds the standalone player bundle the exports inline).
- `npm test` runs the unit tests and `npm run typecheck` the types.
- `npm run test:e2e` runs the browser smoke tests in Chromium (once, before the first run: `npx playwright install chromium`). They start their own dev server on port 5181.
- `npm run build` writes the site to `app/dist` with the GitHub Pages base path; `npm run preview` serves it at http://localhost:4173/railway-operating-plan-creator/.
- Export from the editor's toolbar: Download (JSON), Share (a link that holds the whole plan), Export (standalone page, SVG of this step, SVG of every step).

The demo plan's state after every step is written out in [docs/reference/demo-expected-states.md](docs/reference/demo-expected-states.md).

- [Research spec](docs/spec.md)
- What the AI sends: [PlanReading schema](docs/schema/plan-reading.schema.json), with three synthetic examples: the [customer service demo](docs/schema/examples/customer-service-demo.reading.json) (one spur), a [spur with a runaround](docs/schema/examples/spur-with-runaround.reading.json) (a trailing-point spur and a passing siding; the engine expands the `runaround` step) and [two customers](docs/schema/examples/two-customers.reading.json) (two spurs, a cut split between them)
- Research notes: [models](docs/research/models.md), [prior art](docs/research/prior-art.md), [canvas and ingestion](docs/research/canvas.md), [architecture review](docs/research/architecture-review.md)

All example plans are synthetic. The project uses no proprietary railway data.

Licensed under the [Apache License 2.0](LICENSE).

## Slide editor (new default)

The default app now starts with a blank drawing. Draw straight tracks, drop turnouts in four orientations, and add end markers or labels in Step 1. Drag endpoints to adjust the drawing. Step 2 sets the starting snapshot: drag locomotives, loaded cars and empty cars from the toolbar, then use +/- to build separate cuts on any track. Flip equipment as needed.

From Step 3, click a cut, double-click an individual car, or drag a box around any subset of cars. Shift adds selections. Drag the equipment to its destination and preview one continuous track-following movement. Use Edit path to click through the intended tracks, then Finish path. Put reversals on separate slides. This editor uses geometric paths, not the switching simulation.

Next step copies equipment positions. Each step has its own instructions, labels and arrows. Track layout and starting equipment become locked when later steps exist; remove later steps (or Undo) before revising setup. Earlier titles and instructions remain editable. Save locally, download the `.slides.json` file, or export a self-contained animated HTML presentation. Existing plan data is preserved; use **Older plans** (`?legacy=1`) for the previous editor. Old share links also open there. Automatic conversion and PowerPoint export are not included.

On Node versions exposing experimental global web storage, use `NODE_OPTIONS=--no-experimental-webstorage npm test` so happy-dom supplies isolated browser storage. This is a runtime compatibility issue in the existing test stack, not a change to application storage.

### Pauses, straight snapping and exports

Each slide now has **Pause before next step (seconds)** and **Apply pause to all steps**. **Play plan** starts autoplay; movement duration stays automatic and fixed. Manual Preview/Next still waits for you. Older files default to a three-second pause. Pauses are saved in the editable plan and carried into animated HTML and video.

**Snap: on** keeps new track lines horizontal or vertical and preserves turnout diagonals. Turn snapping off, or hold Alt while drawing, for a free-angle line.

**Export** offers editable JSON, offline animated HTML with autoplay, one-page-per-step PDF, static PowerPoint with editable titles/instructions, current-step PNG/SVG, all-step PNG/SVG ZIP archives, and video. The browser selects MP4 when supported or WebM otherwise. Video records in real time: keep the tab visible; closing the export dialog cancels recording. Exports are created on your device. Hosted share links and native PowerPoint animations are not included.
