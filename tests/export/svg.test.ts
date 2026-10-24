// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { materialize } from "../../src/core/engine/materialize";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { ROUTE_NOT_ESTABLISHED_TEXT } from "../../src/render/render";
import { downloadAllSvgs, downloadSvg, svgForStep, svgFileName } from "../../src/export/svg";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("svgForStep", () => {
  test("svgForStep 1 of the demo contains 6 g.unit elements and a title with the shove caption", () => {
    const svg = svgForStep(demo, 1);
    expect(svg.startsWith("<svg")).toBe(true);
    const doc = parse(svg);
    expect(doc.querySelectorAll("g.unit")).toHaveLength(6);
    expect(doc.querySelector("title")!.textContent).toBe(demo.work[0]!.text);
    const root = doc.querySelector("svg")!;
    expect(Number(root.getAttribute("width"))).toBe(1200);
    expect(Number(root.getAttribute("height"))).toBeGreaterThan(100);
    expect(root.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
  });

  test("an SVG for a route_not_established step carries the label", () => {
    const plan = materialize({
      schemaVersion: "1",
      title: "Unreachable",
      arrival: { direction: "eastbound", enters: "left", on: "MAIN", locos: "rear", text: "" },
      tracks: [
        { id: "MAIN", role: "main", end: "continues" },
        { id: "SPUR1", role: "spur", lengthFt: 800, end: "buffer_stop" },
        { id: "SPUR2", role: "spur", lengthFt: 500, end: "buffer_stop" }
      ],
      switches: [
        { id: "S1", on: "MAIN", to: "SPUR1", side: "left", approach: "facing", order: 1 },
        { id: "S2", on: "MAIN", to: "SPUR2", side: "right", approach: "trailing", order: 2 }
      ],
      facilities: [],
      consist: { locos: { count: 1 }, cuts: [{ id: "LOADS", cars: 2, state: "loaded", list: [{ id: "C1" }, { id: "C2" }] }] },
      work: [{ id: "W1", actor: "railroad", do: "shove", cars: ["LOADS"], to: "SPUR2", text: "Shove where no route leads", stop: { track: "SPUR2", ft: 400, end: "lead" } }],
      departure: { direction: "eastbound", text: "" }
    }).plan;
    const svg = svgForStep(plan, 1);
    expect(svg).toContain(ROUTE_NOT_ESTABLISHED_TEXT);
    expect(parse(svg).querySelectorAll("g.unit.route-unclear")).toHaveLength(3);
  });

  test("file names: demo -> how-a-train-services-a-customer-step-2.svg", () => {
    expect(svgFileName(demo, 1)).toBe("how-a-train-services-a-customer-step-2.svg");
  });

  test("downloadSvg clicks one link; downloadAllSvgs clicks one per step in order", async () => {
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    downloadSvg(demo, 1);
    expect(names).toEqual(["how-a-train-services-a-customer-step-2.svg"]);
    names.length = 0;
    await downloadAllSvgs(demo, document, 0);
    expect(names).toHaveLength(9);
    expect(names[0]).toBe("how-a-train-services-a-customer-step-1.svg");
    expect(names[8]).toBe("how-a-train-services-a-customer-step-9.svg");
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
