# Railway Operating Plan Creator

An open research project. Upload a rail operating plan (a PDF drawing, a PowerPoint slide or an image of a track schematic) and get back a structured plan you can see, animate, fix and share.

A model reads the document and sends back the plan in railway terms: tracks and their lengths, switches, customer facilities, the train consist, and the arrival, spotting work and departure. Code then lays it out as a clean schematic, to scale. The plan renders on a canvas and plays step by step. You correct what the model got wrong, then export the plan as JSON, an animated page or SVG.

The research question is how cheaply that baseline can be produced without giving up accuracy. A small synthetic benchmark compares pipelines and models on both.

Status: research spec, no code yet.

- [Research spec](docs/spec.md)
- What the AI sends: [PlanReading schema](docs/schema/plan-reading.schema.json), with the [demo as an example](docs/schema/examples/customer-service-demo.reading.json)
- What the canvas draws: [CanvasPlan schema](docs/schema/canvas-plan.schema.json), with the [demo as an example](docs/schema/examples/customer-service-demo.canvas.json)
- Research notes: [models](docs/research/models.md), [prior art](docs/research/prior-art.md), [canvas and ingestion](docs/research/canvas.md)

All example plans are synthetic. The project uses no proprietary railway data.
