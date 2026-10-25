# Railway Operating Plan Creator

The default app is a snapshot-based slide editor in src/storyboard. The previous simulation editor remains accessible with ?legacy=1 and for old #plan links. Do not route storyboard actions through src/core/engine.

## Product contract
- Start blank. Step 1 authors a shared fixed track layout; Step 2 places the starting equipment.
- Step 3 onward: one selected set of equipment, one continuous movement, one direction per slide. Reversal belongs on the next slide.
- Drag equipment from the toolbar. Each drop creates an independent cut; +/- changes that cut in Step 2. Click selects a cut, double-click selects a single car, box-select selects individual cars, Shift adds equipment.
- Route suggestions use drawing geometry only. Authors can adjust paths. No coupling, operational validation, physical lengths or simulated speeds.
- Keep the dark/gold visual language. Preserve old browser storage.

## Checks
Run npm test, npm run typecheck, npm run test:e2e and npm run build before committing. There is no server build in this static Vite app; build:player precedes the frontend build through prebuild.

## Gotchas
Snapshot edits must not silently rewrite later slides. Layout and starting equipment lock when subsequent steps exist; undo or remove later steps to revise setup. Store storyboard files under a distinct version and storage key. Validate imported files before replacing the current document. Escape authored text in exports.

Node 25+ exposes experimental web storage that shadows happy-dom in this test stack. Run unit tests with NODE_OPTIONS=--no-experimental-webstorage on those hosts. Offline storyboard exports embed precomputed animation frames, not serialized functions (function serialization breaks after minification). Track junctions exist at touching endpoints; plain line crossings do not connect.

## Exports and playback
- Users edit only pauseSeconds (0–3600, default 3); MOVEMENT_MS is automatic, fixed at 2200. Setup slides have no movement duration. Manual preview never advances automatically. Editor, HTML and video share these timing rules.
- Exports are browser-local and lazy-load PDF/PPTX/ZIP libraries. PowerPoint diagrams are static images with editable title/instructions; do not promise native animations or editable railway shapes.
- Video uses capability-detected MP4 or WebM and records in real time. Stop and clean up streams when cancelled or hidden. Never label a WebM file MP4.
- image-size is overridden to 2.0.4; pptxgenjs excludes it from browser builds. Only generated PNGs are fed to PowerPoint export. Do not remove the override without rechecking advisories.
- Straight snapping constrains ordinary tracks to horizontal/vertical, not turnout diagonals. Alt temporarily bypasses; preserve snapped connection coordinates.
- Run both unit/browser suites and production build sequentially: build:player clears app/generated while rebuilding. Concurrent unit tests can lose player.iife.js, and Vite hot reload can interrupt browser tests.

## Canvas authoring and onboarding
- Turnout segments share optional Track.turnout; select/delete/rotate the group. Old files without grouping remain valid individual segments. Do not infer legacy groups from proximity.
- validateTracks prevents overlaps, interior crossings, zero-length pieces . Endpoint junctions are allowed. This is geometry validation, never operational simulation.
- Track tool supports drag and click-start/click-end; it must not resize endpoints. Only Select exposes ordinary endpoint handles. Protect grouped turnout endpoints from partial resizing.
- ViewBox zoom/pan is view-only. Always convert pointer coordinates through getScreenCTM; palette drops must also check screen bounds. The editor has no page boundary: negative coordinates and positions beyond legacy page dimensions are valid.
- First-visit/New tutorial uses railway-welcome-v1 separately from plan data, with Help replay. Browser authoring tests dismiss it explicitly; retain a first-visit/New test. Dialogs must not trigger editor Delete/Space handlers.

## Annotation interactions
- Text, arrows and end markers have editor-only hit targets above track hit areas, visible selection and exact-item deletion. Do not put hit targets or selection handles into exported scenes.
- Annotation editing is independent of geometry locks: earlier slide annotations and Step 1 shared labels remain editable. Shared labels on later steps direct the author to Step 1; never look them up in slide.annotations.
- Distinguish text double-click from drag on pointerup, and clear click history on other controls. Keep Delete/Backspace inactive in inputs and dialogs. Check narrow inspector visibility, arrow handles, save/open and Undo/Redo.

## Endless canvas and movement
- The editor is an unbounded plane, not a wrapping surface. Keep authored coordinates unchanged. canvasWidth/pageSize remain legacy import metadata only; no drawing-size UI or editor bounds checks.
- drawingBounds/drawingViewBox frame content across every slide, annotations and sampled animation for exports/thumbnails. Use the same frame across slides; cap raster width at 4800. Editor background grid follows the view, not export bounds.
- Ordinary wheel pans, Shift-wheel pans horizontally, Ctrl/Meta-wheel zooms around pointer. Space-drag/middle-drag/Pan remain available. Fit frames current slide; Whole plan frames all content.
- Step 1 Select supports enclosure box selection, Shift-click toggle/add, Shift-box add, and Ctrl/Meta+A. Turnout pieces select/delete as a group. Keyboard shortcuts must ignore inputs/dialogs. Undo restores bulk deletion.
- movementRoute preserves actual endpoints, using track suggestions where possible and a direct path otherwise. moveSlide detects snapshot distortion and uses Motion.translate for rigid group movement. Never project off-track units back onto rails or collapse their spacing. Keep one direction per slide.
- Verify overhanging locomotive/car cuts move again from an off-track car, reverse on a later slide, survive reload and animate correctly in HTML. Validate negative/far-away geometry, wheel/zoom, box/Shift selection, bulk Delete/Undo, and content-framed exports.
- Expand canvas is view-only: hides steps/notes/timing, retains selection controls below the canvas. Help restores panels so tutorial arrows have visible targets.

Performance: pass a precomputed frame to scene for thumbnails, standalone and video; editor paint uses its viewport directly. Never recompute whole-plan animation bounds inside pointermove/playback frames or once per thumbnail. Imported coordinates accept any finite authored coordinate, including beyond the previous 100000 cutoff.
