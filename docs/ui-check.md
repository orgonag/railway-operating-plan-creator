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
