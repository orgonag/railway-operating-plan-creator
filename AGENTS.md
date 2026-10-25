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
- Run the unit suite and production build sequentially: build:player clears app/generated while rebuilding, and concurrent tests can briefly lose player.iife.js.
