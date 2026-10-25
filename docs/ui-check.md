# Slide editor UI regression check

Checked in Chromium, including a 760px-wide viewport for annotation controls. The repeatable checks live in `tests/e2e/storyboard.spec.ts`; legacy checks remain in `tests/e2e/editor.spec.ts`.

| Area | Checked interactions |
| --- | --- |
| Tracks | Drag and click-click straight drawing, overlap rejection, selection, endpoint resize and continuation |
| Turnouts | Four direction controls, rotation, grouped selection/deletion, Undo |
| Text | Creation on a track, click selection, Edit text and double-click, zoomed drag, exact deletion, Undo/Redo |
| Arrows | Drag creation, enlarged selection target, endpoint resize, deletion, narrow-screen controls |
| End markers | Placement, selection, exact deletion |
| Earlier slides | Edit/delete shared labels from Step 1 without unlocking geometry; later slides preserve ownership of shared labels |
| Equipment | Independent cuts, locomotive placement, car count +/−, loaded/empty, flip, selection, deletion and Undo |
| Track selection | Enclosure box, Shift-click, Select All, bulk Delete and Undo |
| Movement | Off-track/overhanging cuts, next-slide movement and reversal, HTML animation; Five of ten cars, suggested route, manual path, reset path, preview/stop, clear movement |
| Navigation | Add/remove steps, reload, presentation, autoplay |
| View | Zoom, pan, Fit and Whole plan recovery; narrow selection panel does not cover canvas; expanded canvas increases drawing width and height |
| Large yards | Unbounded drawing, negative coordinates, wheel navigation, content-framed SVG/HTML/PNG, reload |
| Documents | Plan/step titles, instructions, Download, New confirmation, Open and saved annotation round-trip |
| Timing | Pause persistence, apply to all, autoplay |
| Exports | Actual PDF/PPTX/PNG/SVG/ZIP/HTML/video downloads, HTML playback and video decoding |
| Onboarding | First-visit guide, dismissal, refresh persistence, New replay |

## Issues corrected in this pass

- Annotation dragging existed without an actual selection state or exact-item delete action.
- Thin arrows were difficult to hit; track click targets could cover text and markers.
- Shared layout labels could be mistaken for local annotations when dragged on later slides.
- Text double-click handling could consume a subsequent drag.
- Earlier-slide annotation edits were unnecessarily coupled to geometry locks.
- The narrow-screen selection inspector could cover the object being edited.

Annotations now use editor-only hit targets and selection outlines. Exported diagrams do not include those controls. Delete/Backspace is suppressed while typing or using dialogs. Geometry remains locked after later snapshots exist; annotation changes do not alter equipment or movement paths.

This is browser regression coverage, not a claim of exhaustive screen-reader, touch-device or cross-browser certification.

## Reliability acceptance checks

- Escape while typing and reload preserve plan/step titles and instructions. Clicking a step directly from an input works on the first click.
- Unreadable original data remains downloadable after subsequent edits and reload. Quota failure preserves the original and session fallback.
- Stale-tab edits cannot replace newer saves; conflicted drafts survive reload, further editing and tab closure.
- Earlier revisions preserve downstream notes/snapshots and persist review markers. Rebuild in order, preview repaired steps, handle removed equipment, and block final exports until reviews finish.
- Startup/Open/Present/Play frame content; leaving presentation restores editing zoom.
- A 50-step/100-car fixture opens, saves an edit, previews and exports animated HTML. Recorded local timings before final build: about 0.4s open, 0.26s edit/save, 0.38s preview start (includes automation overhead; not a cross-device performance guarantee).
- Unit round trips cover 2001 tracks, 2001 cars and 1001 slides, plus far/negative coordinates.

## Track movement and snap acceptance

Select/V moves whole lines and rigid multi-selections, including grouped turnouts. Endpoint magnets take priority over grid rounding and use screen-scaled reach. Green rings indicate connections; invalid overlapping/crossing moves preview red and leave geometry untouched on release. Browser regression covers exact endpoint connection, multi-selection movement, rejection rollback, Undo, zoom and reload. Track/L remains repeat drawing mode.

Live yard review (2026-10-25, Astra/high): authored 18 track segments, seven labels, 14 units and 16 movements (18 slides). Revised an early snapshot, rebuilt all later movements, reloaded, edited/reset a manual path, played the plan, and exported HTML, PDF, PPTX, PNG, SVG ZIP and MP4. Titles/instructions survived; PPTX contained all 18 slide notes. MP4 decoded successfully (37.03 seconds, 1200×900). No page errors observed. Evidence: /tmp/railway-live-review-20261025.

Emailed screenshot regression: a middle-car drag to 35 units off a straight lead appended a perpendicular path tail and rotated four units vertically. Off-track destinations now use rigid group translation. Automated checks cover ten cars, unchanged spacing/orientation throughout animation, the next move back onto track and reload. Existing authored snapshots are preserved; rebuild an affected movement from its correct preceding snapshot.

The realistic PDF was 173,221,733 bytes before PNG compression; jsPDF FAST compression is required. Very panoramic yard PDFs still use the common plan frame and may have substantial vertical whitespace; diagrams are rasterized. Do not claim selectable PDF diagram text or perfect page fitting.

2026-10-25 usability follow-up: explicit atomic Rebuild remaining steps repairs all flagged movements in order, preserves notes/destinations/annotations, and supports one Undo. Unit coverage checks a missing unit in a later step leaves the entire plan unchanged; browser coverage checks Undo and reload after autosave completion. Static exports now fit content proportions; the same Astra 18-slide yard produced an 18-page PDF (1,315,974 bytes, inspected page 900×308 points), 2160×740 PNG, and 18-slide PPTX (1,916,282 bytes). Inspected PDF page retains all geometry, title and instructions without the former vertical whitespace. Video export displays expected recording seconds and offers animated HTML as the quick option.
