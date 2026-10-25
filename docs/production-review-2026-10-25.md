# Production review — October 25, 2026

Reviewed baseline: `889a317` on `main`. Scope: the default storyboard editor,
legacy compatibility boundaries, persistence, imports, rendering, exports,
dependencies, type checking, automated tests, build/release configuration and
public maintenance documentation.

## Assessment

The project has a credible foundation: strict TypeScript, a separate pure geometry
model, explicit recovery and revision behavior, escaped output, and meaningful
browser tests exercising real authoring and downloaded files. It is not an
untested UI prototype. The principal weaknesses were outdated development tooling,
incomplete release gates, permissive import edges, export lifecycle handling and
hard-to-review embedded playback code.

## Findings addressed

| Priority | Finding | Change and evidence |
| --- | --- | --- |
| High | Seven dependency packages reported advisories, including critical findings in development/test tools | Updated Vite, Vitest, Happy DOM and Ajv with a refreshed lockfile; final npm audit reports zero advisories. These findings concern tooling, not evidence of a compromised published app. |
| High | Pages deployed without browser regression tests; no pull-request checks | One sequential check command runs unit, type, schema, development browser, production build and production browser checks. Deployment depends on that job; pull requests cannot deploy. |
| Medium | Imports accepted false/null movement data and wrong dictionary shapes; duplicate IDs made selection ambiguous | Validate unknown data and identifier scopes before use. Regression tests cover malformed roots/entries, duplicate IDs, optional dictionaries, and preservation of reviewable snapshots. |
| Medium | Equipment IDs matching Object prototype names broke animation dictionary reads/writes | Own-property lookups and null-prototype construction; regression tests cover constructor, __proto__, and toString. |
| Medium | Closing an export while encoding could still trigger a download | One cancellation-aware download boundary for static exports, plus a post-encoder cancellation check for video. Browser test delays PNG completion until after cancellation. |
| Medium | MediaRecorder constructor failures leaked capture tracks | Recorder creation is inside stream cleanup protection. Browser test forces construction failure and verifies every track is ended. |
| Medium | Static page/image exports repeatedly sampled the entire plan's animation bounds | Reuse a single cached frame for the immutable export snapshot across pages and formats. |
| Medium | Failed older saves could clear the newer save's pending indicator | Apply the same save-sequence guard to failures as to successful saves. The existing multi-tab, quota and recovery browser cases remain in the release gate. |
| Maintenance | Offline playback lived in one long JavaScript string | Readable dependency-free runtime file, separate escaped JSON data, explicit typecheck, and actual exported HTML browser execution. |
| Maintenance | Unit tests could reuse an obsolete ignored player bundle; storyboard tests were absent from explicit typecheck inputs | Rebuild the player during test setup and include storyboard tests and the offline runtime in type checks. |

## Verification

The release gate exercises both editors, old share links, undo/redo, revisions,
recovery, cross-tab conflicts, cut selection, routing, off-track movement,
annotations, zoom/pan, onboarding, playback and all existing export formats.
It also exercises the minified production app at the GitHub Pages subpath.
Local release gate: 420 unit tests passed; all 27 Chromium scenarios passed against the development app and again against the minified production build. Type checks, all three schema examples, and both player/frontend builds passed. npm audit reported zero known advisories. These local checks used Node 26.8.1 with the documented web-storage flag; CI uses Node 24. See the PR/check output for CI results.

The existing legacy standalone-player DOM-emulator test was moved into the
existing Chromium export test, retaining title, rendered-unit, step-count and
problem-list assertions. Current Happy DOM no longer reproduces classic-script
globals across separate script tags reliably; enabling script evaluation did not
make it an appropriate substitute for the browser.

## Remaining limits and follow-up priorities

- `editor.ts` is still about 2,100 lines and owns substantial interaction state.
  Extract cohesive interaction features incrementally as they change. A wholesale
  rewrite during a reliability review would require much broader regression work.
- Automated browser coverage is Chromium. Safari/Firefox, touch-only use, assistive
  technology and low-memory devices have not been certified by this review.
- Large plans still incur snapshot-history, geometry-routing and frame-generation
  costs. The 50-step/100-car exercise is useful evidence, not an unlimited-size
  performance guarantee. Extreme numeric inputs and adversarial resource exhaustion
  warrant a separate bounded-resource design if untrusted-document sharing grows.
- Browser-local storage can be cleared by the browser/user. Recovery drafts and
  downloaded JSON mitigate this; they are not a remote backup service.
- PDF/PPTX exporters remain sizeable lazy-loaded dependencies. PowerPoint diagrams
  are images with editable text, and video still records in real time.
- Local/CI production checks do not prove a later deployment is healthy. Confirm
  the published app after merging and deploying. This review branch does not
  authorize or perform a main-branch deployment.

No authoring workflow, supported export format, or legacy entry point was removed.
The public introduction remains personal and short; architecture and verification
details live in the maintenance documentation rather than promotional claims.
