# Editor reliability acceptance — October 24, 2026

A fresh Astra/high review identified six concrete gaps. This release addresses all six and retains the simple drawing/snapshot workflow; it adds no railway simulation rules.

| Finding | Resolution | Verification |
| --- | --- | --- |
| Escape discards typed text | Update text on input; ignore canvas Escape while typing; no DOM rebuild on blur | Type, Escape, first-click navigation and reload browser regression |
| Failed recovery overwrites the original | Preserve unreadable bytes separately; block replacement if a backup cannot be stored | Corrupt-data and quota-failure browser tests |
| Stale tabs overwrite newer work | Serialized Web Lock plus compare-before-write; visible conflict; durable per-page draft | Concurrent-write unit tests; two-tab/browser-close restoration test |
| Authored plans exceed importer limits | Remove inconsistent object-count caps while retaining structural/finite-value validation | Round trip 2001 tracks, 2001 units, 1001 slides |
| Earlier corrections discard later work | Explicit Revise this step; preserve later snapshots/notes; ordered review/rebuild | Revision, removed-equipment, review persistence, preview/export guard tests |
| Reopen/presentation can look blank | Frame loaded/opened/presented content; restore editing view on exit | Negative/distant-coordinate import and presentation browser regression |

Recovery drafts are not automatically deleted from another page: that page might have written newer edits since the recovery list was loaded. Local-storage failure retains separately discoverable session drafts where possible, shows the saving problem, and warns before leaving unsaved/session-only work. Download remains available. Clearing browser data can still remove browser-local documents; downloaded JSON is the portable backup.

The reviewer rechecked the final source and reported no concrete remaining blocker. This is source-review clearance, not exhaustive certification for every browser, device or document size.

## Performance exercise

A 50-step plan with 100 cars was loaded, edited, previewed and exported as animated HTML. On the development machine, observed timings including browser automation overhead were approximately 0.4 seconds to open, 0.26 seconds to edit/save, and 0.38 seconds to start preview. Whole-plan bounds are not recalculated inside animation frames or per thumbnail. Undo history is capped at 50 document snapshots.

## Release checks

Run the entire unit suite, Chromium browser suite, typecheck and production build sequentially. Browser coverage includes existing drawing, turnouts, selections, movement, annotations, pause settings, tutorial, zoom/navigation and actual PDF/PPTX/PNG/SVG/ZIP/HTML/video output checks, in addition to the reliability cases above. Confirm GitHub Pages deployment and load the published app before reporting completion.
