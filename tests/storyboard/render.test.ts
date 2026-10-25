import { FULL_NOTICE, exportedPlan } from "../../src/storyboard/notice";
import { drawingBounds, drawingViewBox } from "../../src/storyboard/model";
import { slideSvg } from "../../src/storyboard/exports";
import { expect, it } from "vitest";
import { blank } from "../../src/storyboard/model";
import { scene, standalone } from "../../src/storyboard/render";
it("escapes authored labels and script terminators in offline presentations", () => {
  const d = blank();
  d.title = "<script>alert(1)</script>";
  d.slides[0]!.text = "</script><script>alert(2)</script>";
  d.labels.push({
    id: "label",
    kind: "text",
    a: { x: 1, y: 1 },
    b: { x: 1, y: 1 },
    text: "<img src=x onerror=alert(3)>",
  });
  expect(scene(d, 0)).not.toContain("<img");
  const html = standalone(d);
  expect(html.match(/<script>/g)).toHaveLength(1);
  expect(html.match(/<\/script>/g)).toHaveLength(2);
  expect(html).not.toContain("<script>alert");
});

it("uses the entire large yard in presentation and exported slide images", () => {
  const d = blank();
  d.canvasWidth = 4800;
  d.tracks.push({
    id: "far",
    a: { x: 3000, y: 2000 },
    b: { x: 4600, y: 2000 },
  });
  expect(scene(d, 0)).toContain(
    `width="${drawingBounds(d).width}" height="${drawingBounds(d).height}"`,
  );
  expect(standalone(d)).toContain(`viewBox="${drawingViewBox(d)}"`);
  const b = drawingBounds(d, true);
  expect(slideSvg(d, 0).svg).toContain(
    `viewBox="${b.x} ${b.y} ${b.width} ${b.height}"`,
  );
  expect(slideSvg(d, 0, 1, false).height).toBeLessThan(200);
  expect(slideSvg(d, 0).svg).toContain('x2="4600"');
});

it("fits tall and wide exports without clipping labels or instructions", () => {
  const d = blank();
  d.tracks = [{ id: "long", a: { x: -4000, y: 100 }, b: { x: 4000, y: 100 } }];
  d.slides[0]!.text = "First instruction\nSecond instruction";
  const wide = slideSvg(d, 0);
  expect(wide.height).toBeLessThan(250);
  expect(wide.svg).toContain("Second instruction");
  const bounds = drawingBounds(d, true);
  expect(bounds.x).toBeLessThan(-4000);
  expect(bounds.x + bounds.width).toBeGreaterThan(4000);
  d.tracks[0]!.b = { x: -4000, y: 8100 };
  expect(slideSvg(d, 0).height).toBeGreaterThan(700);
});

it("adds a discreet tool credit and visual-use notice without changing the plan", () => {
  const d = blank();
  const original = JSON.stringify(d);
  expect(slideSvg(d, 0).svg).toContain("Tool by Orgo Nag");
  expect(slideSvg(d, 0).svg).toContain("not engineering advice");
  expect(standalone(d)).toContain(FULL_NOTICE);
  const file = JSON.parse(exportedPlan(d));
  expect(file.tool.author).toBe("Orgo Nag");
  expect(file.tool.disclaimer).toBe(FULL_NOTICE);
  expect(JSON.stringify(d)).toBe(original);
});
