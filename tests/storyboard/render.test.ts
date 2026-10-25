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
  expect(html.match(/<\/script>/g)).toHaveLength(1);
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
  expect(scene(d, 0)).toContain('width="4800" height="2800"');
  expect(standalone(d)).toContain('viewBox="0 0 4800 2800"');
  expect(slideSvg(d, 0).svg).toContain('viewBox="0 0 4800 2800"');
  expect(slideSvg(d, 0).svg).toContain('x2="4600"');
});
