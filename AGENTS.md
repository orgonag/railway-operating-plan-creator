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
Snapshot edits must not silently rewrite later slides. Earlier geometry requires Revise this step. Keep later snapshots/notes intact and mark affected movements needsReview; rebuild them in order or use the previous snapshot. Store storyboard files under a distinct version and storage key. Validate imported files before replacing the current document. Escape authored text in exports.

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
- validateTracks prevents overlaps, interior crossings, zero-length pieces. Endpoint junctions are allowed. This is geometry validation, never operational simulation.
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

## Reliability and revisions
- PlanStore saves under a cross-tab Web Lock and compares the last observed raw document before every write. Never silently replace a changed main key; a conflicting tab keeps its working copy and durable UUID-keyed draft. Without Web Locks, offer downloads and report that autosave is unavailable.
- Preserve failed-load bytes in RECOVERY_KEY before replacing the main key. If backup storage fails or already contains another original, block autosaving over the original and offer both downloads.
- Durable drafts use a distinct key per page instance. Session storage is a fallback when local storage is full. Discover both at startup. Never auto-delete another page's recovered draft: it may have newer edits than the recovery snapshot. Warn before leaving unsaved/session-only work. Successful saves remove only the current page's draft.
- Text inputs update the model on input, grouped into one undo entry per focus session. Do not render on blur: it can destroy the next clicked button before its click handler. Escape and canvas shortcuts ignore typing targets. History is capped at 50 snapshots.
- Authoring and import have no mismatched object-count caps; finite coordinates and document structure remain validated. Test 2001 tracks/units and 1001 slides round trips.
- needsReview is persisted. Geometry changes mark later movements, not notes. Review in order; Rebuild uses the current previous snapshot and the authored destination; Use previous snapshot preserves text/annotations while clearing the movement. Missing equipment must report a recovery action, not throw from pointer events. Hide manual old-path editing until the step is repaired.
- Block export/full-plan playback/presentation while reviews remain. A repaired current step can preview even if later steps still need review. Editable JSON downloads always remain available.
- Startup/Open frame all content. Present and Play plan frame the whole plan; Exit restores the editing viewport.
- Browser assertions reading autosave must await #app[data-saving=false], since writes are serialized asynchronously. Test actual stale tabs, failed recovery, quota fallback, Escape, single-click navigation after typing, and closed-tab draft restoration.

## Track repositioning and magnets
- Select (V) drags an entire line or selected set. Turnouts remain grouped; moving selected tracks does not move unselected tracks/equipment. Validate the complete result before committing; overlaps/crossings roll back and Undo restores a move.
- Keep Track (L) as the drawing mode for rapid repeated lines. Whole-line dragging is only in Select; endpoints still resize. Clicking a selected piece keeps the multi-selection intact; Shift toggles groups.
- trackSnap prefers endpoints before rail interiors before grid. straightEnd considers raw pointer proximity before grid rounding and never changes the chosen horizontal/vertical axis. translateTracks chooses one endpoint connection and translates the selection rigidly.
- Magnetic reach is 12 screen pixels converted through getScreenCTM, including zoom. A green ring previews a connection. Alt/Snap off bypasses magnets and grid. Clear trackPreview on cancel, pointercancel and commit.
- Clearly off-track movement destinations use rigid selection translation: a short perpendicular connector at the route end must never extrapolate cars into a vertical tail. Preserve spacing and orientation throughout the animation.
- Near-rail placements (within 6 drawing units) follow the route per car. Motion.railPath separates rail geometry from exact authored path endpoints; playback blends small positional/orientation corrections so the start snapshot and anchor destination stay exact. Prefer the car heading when nearby turnout rails compete, and permit tangent continuation only at free track ends. Keep older motions unchanged on import; explicitly rebuild to use the new behavior.
- A connected route requiring reversal must report the existing next-slide instruction, not silently become a direct shortcut through the yard. Disconnected/freeform moves remain available. Validate optional railPath on import and test editor plus downloaded HTML at a mid-turnout frame.
- PDF PNG pages must use jsPDF compression (FAST); uncompressed full-resolution RGB pages can turn a modest 18-step plan into a 165 MiB file. Verify output size with a realistic plan.
- Clear equipment double-click history after a drag and when clicking outside the canvas. A fast Next step followed by dragging the same car must select the cut, not silently select only one car.

## Fast revision and fitted exports
- Rebuild remaining steps is explicit and atomic: rebuild a copied deck in order, retain each destination and all notes/annotations, then replace slides only if all steps succeed. Missing equipment reports its step without partial writes. Paths are suggested again; individual review stays available. The editor change transaction must suppress downstream reflagging for this operation; one Undo restores all original snapshots/review flags.
- drawingBounds(deck, true) returns padded content bounds for static exports. Keep the default framing for editor/HTML/video. Static SVG diagram height follows those bounds, including instructions below it. Raster exports cap both dimensions at 4800; PowerPoint fits the image proportionally inside its available area.

## Tool credit and notice
- notice.ts owns the author credit and disclaimer. Credit the tool, not the user's plan: "Tool by Orgo Nag". Keep the app notice outside the canvas and the live save-status region; its accessible dialog contains the full disclaimer.
- Static SVG/PNG/PDF/ZIP and video share slideSvg's compact footer. PPTX adds a small editable footer and full notice in notes; HTML has a footer with expandable full notice. Editable downloads add tool metadata without mutating the working deck or autosave/recovery originals. Keep legal/credit text out of railway geometry and animation bounds.

## Production checks and import/export boundaries
- Use Node 24 from .nvmrc. npm run check is the sequential release gate, including the browser suite against both dev and minified production at the Pages subpath; npm audit --audit-level=moderate also runs in CI. Pull requests must run browser tests as well as unit tests. Main deploys only after checks pass.
- Unit setup always rebuilds the legacy player so a stale ignored bundle cannot mask a source regression. Happy DOM no longer executes scripts by default and does not reliably model globals across classic script tags; test exported HTML execution in Chromium, not by enabling emulator script evaluation.
- The storyboard offline runtime is src/storyboard/standalone-player.js, included with ?raw and checked through tsconfig.player.json. Keep it dependency-free and never stringify minified functions. Escape < in the separate JSON script element.
- Imports validate unknown values, optional movement dictionaries and identifier uniqueness. Snapshot unit IDs repeat across steps by design; shared/local annotation IDs must not collide within one rendered slide. Preserve needsReview recovery documents whose prior equipment was removed. Imported IDs such as constructor and __proto__ are data: use own-property lookup and null-prototype dictionaries.
- Cache static export bounds per dialog snapshot. Gate every download after asynchronous work on the abort signal, and clean capture tracks even when MediaRecorder construction throws. Older failed saves must not clear a newer pending save's status.
