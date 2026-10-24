# Railway Operating Plan Creator

An open research project. Build a rail operating plan on a canvas, play it step by step, and share it. You lay out the track to scale, place the customer's facility and the cars, and add the moves one at a time. A switching engine looks over every move as you go and points out anything worth a second look, such as cars that may not fit at the racks. It never stops you. The editor's commands are built so an AI agent could drive them later, with you able to undo anything. Then export the plan as JSON, a share link, an animated page or SVG.

If you already have a plan in PowerPoint, PDF, an image or another common format, an optional import gives you a rough first draft. It asks you about every assumption it made, so nothing goes into the plan without you seeing it.

A small benchmark picks the free model the import uses, and measures how often it guesses wrong without asking.

Status: Release 1 is built. The engine and player (P1) and the canvas editor with sharing (P2) are done: build track by dragging turnouts and stretching track ends, place facilities and cars, make steps by dragging the train, undo anything, and export the plan as JSON, a share link, a standalone HTML page or an SVG per step. The repo is private until the owner opens it; the Pages workflow in `.github/workflows/pages.yml` stays inert until then.

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
