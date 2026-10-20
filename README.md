# Railway Operating Plan Creator

An open research project. Upload a rail operating plan (a PDF drawing, a PowerPoint slide or an image of a track schematic) and get back a structured plan you can see, animate, fix and share.

An open model reads the document and produces a baseline plan as JSON: tracks, switches, sidings, customer racks, the train consist, and the ordered service steps (arrive, spot the cars, pull the empties). The plan renders on a canvas and plays step by step. You correct what the model got wrong, then export the plan as JSON, an animated page or SVG.

The research question is how cheaply that baseline can be produced without giving up accuracy. A small synthetic benchmark compares pipelines and models on both.

Status: research spec, no code yet.

- [Research spec](docs/spec.md)
- [OpPlan JSON Schema](docs/schema/opplan.schema.json) and a [worked example](docs/schema/examples/customer-service-demo.json)
- Research notes: [models](docs/research/models.md), [prior art](docs/research/prior-art.md), [canvas and ingestion](docs/research/canvas.md)

All example plans are synthetic. The project uses no proprietary railway data.
