# Slide authoring maintenance
Use when changing the storyboard workflow. Read AGENTS.md first.
Keep geometry and document operations in model.ts, DOM interactions in editor.ts. Preserve one movement per slide and partial-cut selection. Exercise a ten-car cut with five selected, a locomotive plus cars, independent cuts on multiple tracks, undo/reload, manual routing, and presentation. Never infer coupling or operating validity. Changes to an earlier slide must not silently invalidate later animation starts.
