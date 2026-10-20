# Canvas, animation and document ingestion

Compiled 2026-10-20 from web research. "Verified" means checked on a primary page (model card, official docs, licence page). "Secondary" means seen only on blogs, aggregators or price trackers. Prices change often; treat every price as a snapshot.

## Recommendation

- **Canvas:** plain SVG with small geometry helpers, rendered from React state. The portfolio demo already works this way (`getPointAtLength` along a path), it keeps SVG export free, and it avoids fighting a library built for boxes and wires. React Flow (MIT) stays an option for editor chrome later. tldraw is ruled out by its production licence. Konva and PixiJS lack native SVG export.
- **PDF:** pdf.js in the browser for page images, text with positions, and vector paths through its operator list. PyMuPDF is very capable but AGPL, and the browser app should not need Python.
- **PPTX:** read the slide XML directly (a PPTX is a zip). Shapes, lines, connectors and text boxes come with exact positions; group transforms must be flattened.
- **Video:** MediaRecorder for WebM first; GIF or MP4 later through a wasm encoder.

## Document ingestion

| Tool | Use | License |
|---|---|---|
| pdf.js (Mozilla) | Render PDF pages to canvas/PNG in browser; text layer | Apache 2.0 (from memory; widely known) |
| PyMuPDF / MuPDF | Fast PDF render to PNG, text with coordinates, vector paths (`get_drawings`) which can recover track lines from CAD-exported PDFs without any model | AGPL or commercial from Artifex (verified, PyPI). AGPL matters for a hosted service |
| pypdfium2 | PDF render in Python | Apache 2.0 / BSD-3 (from memory, not verified) |
| python-pptx | Read slides, shapes, text, connectors, coordinates directly from PPTX XML; no render | MIT (from memory) |
| LibreOffice headless | `soffice --headless --convert-to pdf` for PPTX, then render PDF pages to images | MPL 2.0 (from memory) |
| Docling (IBM) | PDF/PPTX/DOCX to structured doc; can use Granite-Docling | Code MIT; model Apache 2.0 (verified, secondary README mirror) |

Notes: for PPTX drawn with native shapes and connectors, python-pptx can extract the geometry directly (lines, connectors, text boxes) and may beat a VLM. For vector PDFs, PyMuPDF `get_drawings()` gives line segments. Use the VLM mainly for raster images and scanned plans, and for interpreting labels and steps text. Browser-side PPTX rendering is weak; convert server-side.

Sources: https://pypi.org/project/PyMuPDF/1.19.6/ , https://github.com/eusip/docling (mirror of docling README), https://www.dbta.com/Editorial/News-Flashes/IBM-Releases-New-Granite-Docling-Model-to-Deliver-End-to-End-Document-Understanding-171525.aspx

## Canvas and diagram libraries

| Library | License | Fit for track editor | Path-following animation | Export |
|---|---|---|---|---|
| Plain SVG + D3 | ISC (D3, from memory) | Full control; you write snapping/hit-testing | Native: `path.getPointAtLength()` + rAF, or SMIL `animateMotion` | SVG native, PNG via canvas, JSON trivial |
| React Flow (xyflow) | MIT core (verified npm); Pro is paid examples/support (third party says from 129 EUR/mo, unverified) | Node/edge model maps to switches/segments; custom edges for curved track; built-in snap grid | Custom edge components can animate SVG along edge path | JSON via `toObject()`; PNG via html-to-image recipe |
| Konva / react-konva | MIT (Konva verified via FAQ; react-konva assumed MIT, unverified) | Canvas shapes, drag, transformer, snapping by hand | Tween + manual path sampling | PNG/JSON (`toJSON`), no native SVG |
| Fabric.js | MIT (secondary) | Object model with drag/rotate; snapping manual | Manual | SVG + PNG + JSON |
| JointJS | Core MPL 2.0 (verified vendor llms.txt); JointJS+ commercial | Ports, links with routers, snapping; strong for schematics | Link path sampling available | SVG, JSON; PNG/PDF export in JointJS+ |
| tldraw SDK | Custom tldraw SDK License (verified): free in dev; production needs a key. Trial 100 days, commercial annual (price via sales), hobby non-commercial keeps watermark. Without a key in production the editor stops rendering after 5 s | Great whiteboard UX, custom shapes | Possible, not core | JSON, SVG, PNG |
| Excalidraw | MIT (from memory) | Hand-drawn look; not built for precise topology | Not built in | SVG, PNG, JSON |
| Cytoscape.js | MIT (from memory) | Graph analysis (shortest path for routing moves) more than drawing | Node animations; edge-following needs work | PNG, JPG, JSON (SVG via plugin) |
| Paper.js | MIT (from memory) | Strong vector path math (curves, offsets, nearest point), good for snapping to track | `getPointAt(offset)` on paths | SVG import/export, PNG |
| PixiJS | MIT (from memory) | WebGL, fast for many sprites; editor UI manual | Manual along sampled paths | PNG via extract |

Recording animation: browser `MediaRecorder` on a canvas stream gives WebM; MP4/GIF via ffmpeg.wasm or gif encoders (not researched in depth). SVG-based scenes need rasterizing to canvas first.

Practical fit: React Flow (editor chrome, selection, panels) plus a custom SVG edge layer that holds the track geometry and does train animation with `getPointAtLength`, or plain SVG + D3 if you want full control. Avoid tldraw unless a commercial license is acceptable. Avoid Konva/Pixi if SVG export matters.

Sources:
- https://www.npmjs.com/package/@xyflow/react
- https://dev.to/plazarev/collection-of-diagrams-to-use-in-your-react-app-for-effective-data-visualization-4o7n
- https://www.jointjs.com/llms.txt
- https://tldraw.dev/sdk-features/license-key (read 2026-10-20)
- https://tldraw.dev/legal/tldraw-license
- https://konvajs.org/docs/faq.html
- https://alternativeto.net/software/paper-js/?p=2 (Fabric.js license listing)
