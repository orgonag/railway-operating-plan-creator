# Architecture and maintenance

The application is a static browser app. GitHub Pages serves files; there is no
application server, account system, or database. Documents and recovery drafts
stay in browser storage until the user downloads an export.

## Two document models, intentionally separate

`app/main.ts` opens the snapshot editor in `src/storyboard` by default. A document
contains shared tracks and labels, followed by independently owned step snapshots.
Geometry suggests movement paths; it does not simulate operating rules.

`?legacy=1` and old `#plan=` links open the previous editor in `src/editor`.
`src/core` validates and simulates that older schema, while `src/player`,
`src/render`, and `src/export` support its presentation and sharing features.
These modules remain supported because existing saved files and links use them.
Do not merge the two document models or remove the legacy entry point as cleanup.

## Storyboard responsibilities

| Module | Responsibility |
| --- | --- |
| `model.ts` | Document types, validated imports, geometry, routing, snapshots, animation and framing |
| `editor.ts` | DOM and pointer interactions, selection, undo/redo, revisions and save-status UI |
| `storage.ts` | Serialized cross-tab compare-and-save and protection of unreadable originals |
| `render.ts` | Escaped SVG scenes and standalone presentation document generation |
| `standalone-player.js` | Dependency-free offline playback, embedded verbatim and checked with TypeScript |
| `exports.ts` | Export dialog, rasterization, format adapters and recording lifecycle |
| `tutorial.ts`, `notice.ts` | Onboarding and shared tool attribution/disclaimer |

The editor remains the largest module. Extract cohesive features when changing
them, with interaction tests in place; splitting every closure into a class would
add shared-state plumbing without necessarily improving correctness.

## Boundaries to preserve

- Import JSON as untrusted data. Validate before changing the working document;
  reject ambiguous identifiers rather than silently dropping objects. Retain
  snapshots marked for review when earlier equipment has been removed.
- Authored text is escaped before entering SVG or HTML. Embedded JSON escapes
  `<` so text cannot terminate its script element. Playback code must not come
  from document contents or from stringifying minified functions.
- Save through `PlanStore`. A stale tab must keep a recoverable draft rather than
  overwrite another tab. A failed save is never a successful save notification.
- An earlier geometry change preserves later notes and snapshots and marks
  affected movements for explicit review. Exporting a draft JSON remains possible.
- Compute one shared drawing frame per export operation. Avoid whole-plan bounds
  calculations inside a frame loop or separately for every page.
- Every asynchronous download checks cancellation after encoding finishes. Capture
  streams must be stopped even if recorder construction, drawing or encoding fails.

## Checks and release

Use Node 24 (`nvm use`), `npm ci`, and `npx playwright install chromium`.
`npm run check` runs unit tests, type checks, schema examples, browser tests and
production builds and the same browser suite against the built app in sequence. Do not run these concurrently: the player build
regenerates the bundle consumed by both test environments.

The browser suite covers default and legacy authoring, recovery, revisions,
selection, navigation, playback and actual downloaded export files. Offline
classic-script execution is tested in Chromium, not a DOM emulator. Type checks
include storyboard tests and the standalone JavaScript player.

Pull requests run the same checks and an npm advisory audit. Main-branch pushes
deploy only after they pass. Build the legacy standalone player before the
frontend; `npm run build` handles this ordering. A successful build does not by
itself verify a deployed site: load the published app after deployment.
