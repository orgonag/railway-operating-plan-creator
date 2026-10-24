/** Toolbar icons: small line drawings, one per tool, as inline SVG. */

const SVG_NS = "http://www.w3.org/2000/svg";

const PATHS: Record<string, string> = {
  new: "M6 2h8l4 4v16H6z M14 2v4h4 M9 13h6 M12 10v6",
  open: "M3 7h6l2 2h10v11H3z M3 7V5h5",
  download: "M12 3v12 M7 10l5 5 5-5 M4 20h16",
  export: "M12 15V3 M7 8l5-5 5 5 M4 15v5h16v-5",
  share: "M18 5a2 2 0 1 0 0 .1 M6 12a2 2 0 1 0 0 .1 M18 19a2 2 0 1 0 0 .1 M8 11l8-5 M8 13l8 5",
  undo: "M8 7H4v4 M4 11l4-4a7 7 0 1 1 1 10",
  redo: "M16 7h4v4 M20 11l-4-4a7 7 0 1 0-1 10",
  turnout: "M2 18h20 M8 18l10-10h4",
  "track-end": "M2 12h14 M16 6v12 M19 8v8",
  facility: "M3 20V9l9-5 9 5v11 M8 20v-6h8v6",
  "add-cars": "M3 10h12v6H3z M15 13h4l2 3H15z M6 19a1.5 1.5 0 1 0 0 .1 M18 19a1.5 1.5 0 1 0 0 .1 M19 4v6 M16 7h6",
  "place-cars": "M3 10h12v6H3z M6 19a1.5 1.5 0 1 0 0 .1 M12 19a1.5 1.5 0 1 0 0 .1 M18 3v9 M15 9l3 3 3-3",
  "zoom-in": "M10 4a6 6 0 1 0 0 12a6 6 0 1 0 0-12 M14.5 14.5L20 20 M10 7v6 M7 10h6",
  "zoom-out": "M10 4a6 6 0 1 0 0 12a6 6 0 1 0 0-12 M14.5 14.5L20 20 M7 10h6",
  fit: "M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 12h10",
  play: "M7 4l12 8-12 8z",
  stop: "M6 6h12v12H6z",
  note: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",
  runaround: "M4 12h16 M8 8l-4 4 4 4 M16 8l4 4-4 4"
};

export function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", PATHS[name] ?? "M4 4h16v16H4z");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}
