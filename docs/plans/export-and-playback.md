# Export, snapping and playback — implemented

Status: implemented in the slide editor. Hosted sharing remains a future option.

## Finish flow

Use one Export button. Open a preview with format choices and a short description of what each format preserves. Before exporting, offer Preview entire plan and Download editable plan. Show the total runtime for animated formats. Do not require operational validation.

## Playback

Each service slide continues to contain one continuous movement in one direction.

- Movement uses a fixed automatic 2.2-second animation. There is no movement-duration field.
- Pause after movement: editable seconds, initially 3 seconds.
- Step 1 and Step 2 are still scenes and have only a display duration for autoplay.
- Present manually: movement plays, then waits for Next regardless of the automatic pause setting.
- Autoplay: movement plays, holds for the chosen pause, then advances.
- Apply pause to all steps is an explicit convenience action.
- Stop on the last slide; looping is optional and off by default.
- Editor preview, standalone HTML and video export must consume the same timing settings.

## Drawing and snapping

- Default new track lines to horizontal or vertical, with a faint alignment guide.
- Preserve turnout diagonal geometry and four orientations.
- Endpoints snap to other endpoints and track connection points.
- Equipment stays on its track when dragged; cars in a cut retain order and spacing.
- Align text and annotation objects to the grid and nearby objects.
- Provide one visible Snap toggle; holding Alt temporarily bypasses alignment snapping.
- No mandatory lengths, physical speed, collision checks or coupling logic.

## Export choices

| Format | Purpose | Scope |
| --- | --- | --- |
| Editable plan JSON | Reopen and continue editing | Existing; retain as the complete source |
| Animated HTML | Offline, interactive presentation | Existing; add shared pause settings |
| MP4 video | Send, embed in PowerPoint, or play anywhere supported | Preferred video target; verify browser encoding approach before choosing implementation |
| WebM video | Browser-friendly fallback where MP4 export is unavailable | Show availability accurately |
| PowerPoint PPTX | Include the plan in a larger slide deck | First pass: one diagram image plus editable title/instructions per slide; clearly label as static |
| PDF | Print or distribute a briefing | One numbered step per page, include instructions |
| PNG | Paste a single step into another document | Current step or all steps in a ZIP |
| SVG | Scalable diagram for further editing | Current step or all steps in a ZIP |
| Share link | Let another person view the animation | Separate hosting/storage design; do not imply that downloading HTML creates a hosted link |

Native editable railway shapes and native PowerPoint animations are later enhancements, not implied by the first PPTX export. Users can insert the exported video into PowerPoint when motion is needed.

## Suggested implementation order

1. Straight-line snapping and pause settings, including HTML playback.
2. PDF, PNG, SVG and static PowerPoint using a shared slide renderer.
3. Video encoding with output verified in a real player; hosted sharing only if needed.

## Acceptance checks

- A four-step plan exports with matching titles, annotations, car positions and numbering.
- An automatic 2.2-second movement followed by a 6-second hold lasts 8.2 seconds before autoplay advances.
- Manual mode waits for Next; Step 1/2 never create an artificial train movement.
- Turnout diagonals survive snapping; ordinary track drawing stays straight.
- Exported video follows the same path and timings as editor playback.
- Export controls distinguish static, animated, editable and hosted outputs accurately.
