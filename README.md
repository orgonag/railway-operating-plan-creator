# Railway Operating Plan Creator

An open research project. Build a rail operating plan on a canvas, play it step by step, and share it. You lay out the track to scale, place the customer's facility and the cars, and add the moves one at a time. A switching engine looks over every move as you go and points out anything worth a second look, such as cars that may not fit at the racks. It never stops you. The editor's commands are built so an AI agent could drive them later, with you able to undo anything. Then export the plan as JSON, a share link, an animated page or SVG.

If you already have a plan in PowerPoint, PDF, an image or another common format, an optional import gives you a rough first draft. It asks you about every assumption it made, so nothing goes into the plan without you seeing it.

A small benchmark picks the free model the import uses, and measures how often it guesses wrong without asking.

Status: research spec, no code yet.

- [Research spec](docs/spec.md)
- What the AI sends: [PlanReading schema](docs/schema/plan-reading.schema.json), with the [demo as an example](docs/schema/examples/customer-service-demo.reading.json)
- Research notes: [models](docs/research/models.md), [prior art](docs/research/prior-art.md), [canvas and ingestion](docs/research/canvas.md), [architecture review](docs/research/architecture-review.md)

All example plans are synthetic. The project uses no proprietary railway data.

Licensed under the [Apache License 2.0](LICENSE).
