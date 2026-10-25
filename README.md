# Railway Operating Plan Creator

Draw a railway site, arrange the arriving train, and explain the service one animated step at a time. A slide canvas for the person writing the plan: no switching simulation, prescribed scale, or templates.

**[Open the live editor](https://orgonag.github.io/railway-operating-plan-creator/)**

## Your first plan

### Step 1 — Draw the track layout

Start from the blank page. Choose **Track**, then either click the start and click the end, or drag between them. A preview follows the pointer. With **Snap: on**, a line stays horizontal or vertical and snaps to the drawing grid and aligned connections. Press Escape to cancel an unfinished line. Hold Alt, or turn snapping off, for free-angle track.

Choose **Turnout** to reveal four small diagrams: **Right up**, **Right down**, **Left up**, and **Left down**. The dot is the connection point; the branch shows exactly where the turnout will go. Select a direction, then click an existing track or drag the Turnout tool onto it. A dashed preview follows the pointer: gold means clear, red means it cannot be placed there. The branch and its short exit are one selectable turnout.

The editor rejects stacked/overlapping rails and crossings through the middle of two pieces. Connections at a track end, including an end touching the middle of another track, are allowed. These are drawing aids, not railway operating rules. To join two tracks, make their endpoints touch the intended connection.

To change or remove a piece:

- Choose **Select**, then click a track or turnout, or drag a box around several pieces. Selected pieces turn gold. Shift-click adds/removes pieces; Ctrl/⌘+A selects all track pieces.
- Click **Delete selected track** in the toolbar or inspector, or press Delete/Backspace. A turnout deletes as one piece; its supporting track remains.
- For a selected turnout, choose a different direction in the inspector. Changes that overlap another piece are rejected.
- For a selected ordinary line, drag either endpoint to resize it. Connected ordinary endpoints move together. An endpoint attached to a turnout is protected; change/delete the turnout first.
- **Undo** and **Redo** recover edits. Older saved turnouts without grouping remain individually selectable track sections.

Add **End of track** markers at track ends, **Text** labels, and **Arrow** annotations. New annotations are selected automatically. Click an existing text label, arrow or end marker to select it; use **Delete annotation** or Delete/Backspace to remove that exact item. Double-click text or choose **Edit text** to change its wording. Drag selected annotations to reposition them; selected arrows have round handles to adjust either end. Undo/Redo restores annotation changes.

Finish the site before choosing **+ Next step**. The layout is shared by the whole plan and locks once the next step exists.

### Step 2 — Arrange the starting snapshot

Drag **Locomotive**, **Loaded car**, or **Empty car** onto a track. Each drop creates an independent cut, so you can put equipment on several tracks.

Click a cut and use **+ / −** in the inspector to change its car count. **Flip** changes which way it faces. **Loaded** and **Empty** change the selected cars. Select equipment and drag to reposition it; **Delete selected** removes it. Locomotives can be placed independently of cars.

This is the initial situation: for example, loaded cars arriving with a locomotive while empties wait on a customer track. Choose **+ Next step** when it looks right.

### Step 3 onward — One animation per step

The new slide copies the preceding equipment positions. Select the equipment that moves:

| Action | Selection |
| --- | --- |
| Click a car | Its cut |
| Double-click a car | That individual car |
| Drag a box | The individual cars inside it |
| Hold Shift while selecting | Add to the existing selection, including a locomotive |

For example, box-select five cars from a cut of ten, add the locomotive with Shift, and drag the selection to its destination. The editor suggests a path along connected tracks. Selected equipment moves together; unselected equipment stays put. Cars and locomotives may extend beyond track ends or move off track. Their actual positions and spacing carry into the next step. Track geometry suggests a route but never blocks a movement; when track-following would distort the selection, it moves intact along the path.

Use **Preview step** to watch the movement. If the suggested route is wrong, choose **Edit path**, click waypoints on or off track along the route, and choose **Finish path**. **Reset path** restores the suggestion. **Clear movement** returns to the prior snapshot so you can start again.

Each slide contains one continuous movement in one direction. **A reversal belongs on the next slide.** Add a title, instructions, arrows, or text to explain what happens. Continue adding steps until the service is complete.

Earlier snapshots stay protected until you choose **Revise this step**. Correct tracks or equipment without deleting later slides: their end snapshots, instructions and annotations remain intact. Affected movements show **Review needed**.

Work through those marked steps in order. **Rebuild this movement** suggests a fresh path from the corrected previous snapshot to the saved destination. **Use previous snapshot** clears the old movement while keeping the step and notes, so you can draw it again. If equipment was removed, use that second option. Preview each repaired step as you go. Export, Present and Play plan wait until the review is complete; **Download** always saves your editable draft, including review markers. Undo restores the earlier document.

Text and annotations remain editable without unlocking geometry. Shared labels belong to Step 1.

## Zoom, pan and scale

Choose **Expand canvas** to hide the step list, notes and timing controls while drawing. Selection controls remain below the canvas so they do not cover your work. **Restore panels** brings the normal editor back. The normal editor also uses tighter spacing to leave more room for the drawing.

**The drawing canvas has no fixed edges.** Keep drawing left, right, up or down—even if you started near the old page boundary. Existing drawings keep their coordinates. There is no drawing-size setting to manage.

Use the mouse wheel or two-finger scroll to pan. **Shift-wheel** scrolls sideways; **Ctrl/⌘ + wheel** zooms around the pointer. You can also hold Space and drag, use Pan, or use the zoom buttons. **Fit** frames the current step; **Whole plan** frames all tracks, annotations and equipment across every step. New plans start at a comfortable 100% view.

Exports automatically frame the whole plan with padding, including negative coordinates and movement paths. Every exported step uses the same frame so the yard stays still during playback. Raster images are capped at 4800 pixels wide; SVG retains vector detail.

Zoom and pan only change the view; authored positions stay unchanged. The author decides the scale; the app does not simulate physical lengths or speeds.

## Pauses and presentation

Set **Pause before next step (seconds)** to control how long the completed slide stays visible. **Apply pause to all steps** copies that value throughout the plan. The default is three seconds; zero advances immediately after movement finishes. You can enter up to 3600 seconds.

Movement duration is automatic. There is no movement-duration setting.

**Play plan** starts at Step 1 and advances automatically, honoring each pause. **Present** provides a larger canvas with manual Previous/Next controls. **Preview step** plays only the current movement and then waits. Stop playback at any time.

## Save and export

The editor automatically saves in the current browser and shows when saving finishes. Text is kept as you type, including if you press Escape. Undo keeps up to 50 recent editing snapshots.

Two open tabs cannot silently overwrite each other: a stale tab shows a notice and keeps its working copy. Download that copy, or load the latest saved plan. Conflicting drafts remain recoverable after closing the tab. Recovery copies are retained so another active tab’s newer work cannot be deleted by restoring an older copy. If browser storage is full, the editor offers downloads and keeps a session fallback where possible; download before closing when saving fails.

Unreadable saved data is protected with an original recovery download. If the backup cannot be stored, the original is not overwritten. Browsers without Web Locks use explicit downloads rather than unsafe cross-tab autosaving.

Opening a plan automatically frames its content. Present and Play plan frame the whole drawing; exiting presentation restores your editing view.

 **Download** saves an editable `.slides.json` backup; use **Open** to resume it on another browser or computer. Before **New**, download anything you want to keep as a separate plan.

**Export** creates files on your device:

| Format | Best for | What is included |
| --- | --- | --- |
| Editable JSON | Backups and continued editing | Layout, snapshots, paths, text and pauses |
| Animated HTML | Sharing an offline presentation | Self-contained playback, manual controls and autoplay with pauses |
| Video | Watching without the editor | MP4 where supported, otherwise WebM; animations and pauses |
| PDF | Printing and review | One page per step |
| PowerPoint | Putting the plan in a presentation | Static diagram images with editable titles and instructions |
| PNG / SVG | Using a diagram elsewhere | Current step, or all steps in a ZIP archive |

Video records in real time. Keep the tab visible while recording; closing the export dialog cancels it. PowerPoint export does not contain native railway shapes or native animations. Animated HTML and video preserve movement. Hosted sharing links are not part of the slide editor.

## A short guide when you need it

An arrow-guided introduction appears on the first visit and after **New**. It points out the drawing tools, the first two setup steps, later movement slides, pause settings, zoom, and Export. Skip it at any time; **Help** reopens it. Once dismissed, it stays dismissed on normal refreshes in that browser.

## Older plans

**Older plans** opens the previous editor at `?legacy=1`. Existing `#plan=` share links also open there. The slide editor uses a separate storage key and file format so it does not overwrite legacy plans. Automatic conversion is not included.

The historical [research spec](docs/spec.md), [architecture review](docs/research/architecture-review.md), and [demo expected states](docs/reference/demo-expected-states.md) describe that earlier simulation-based editor; they are not the current authoring workflow.

## Development

```sh
npm ci
npm run dev
```

The app is TypeScript and Vite. `src/storyboard/` contains the default slide editor; the legacy engine/editor remain separate. Read [AGENTS.md](AGENTS.md) and the [slide-authoring maintenance guide](docs/skills/slide-authoring/SKILL.md) before changes.

```sh
npm test
npm run typecheck
npx playwright install chromium # once per machine
npm run test:e2e
npm run build
```

On Node 25+ use `NODE_OPTIONS=--no-experimental-webstorage npm test` so happy-dom supplies isolated browser storage. Run tests and builds sequentially: the player build regenerates files used by tests.

There is no server build. `npm run build` first builds the standalone player through `prebuild`, then typechecks and builds the frontend into `app/dist`. GitHub Actions deploys `main` to GitHub Pages through `.github/workflows/pages.yml`. Browser tests start or reuse a dev server on port 5181.

All example plans are synthetic. Licensed under [Apache 2.0](LICENSE).
