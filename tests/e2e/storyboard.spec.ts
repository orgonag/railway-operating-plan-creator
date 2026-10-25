import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function at(page: Page, x: number, y: number) {
  return page.locator(".drawing svg").evaluate(
    (svg, p) => {
      const pt = (svg as SVGSVGElement).createSVGPoint();
      pt.x = p.x;
      pt.y = p.y;
      const q = pt.matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return { x: q.x, y: q.y };
    },
    { x, y },
  );
}
async function drag(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}
async function drop(page: Page, tool: string, x: number, y: number) {
  const b = await page.locator(`[data-tool="${tool}"]`).boundingBox();
  await drag(
    page,
    { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 },
    await at(page, x, y),
  );
}
async function setup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await page.getByRole("button", { name: "Track", exact: true }).click();
  await drag(page, await at(page, 80, 350), await at(page, 1100, 350));
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await drop(page, "loaded", 180, 350);
}
test("draw, drop ten cars, select five, animate, reload and present offline", async ({
  page,
}) => {
  await setup(page);
  for (let i = 1; i < 10; i++)
    await page.getByRole("button", { name: "+", exact: true }).click();
  await expect(page.locator(".drawing [data-unit]")).toHaveCount(10);
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await drag(page, await at(page, 150, 325), await at(page, 380, 375));
  await expect(page.locator(".drawing .chosen")).toHaveCount(5);
  await drag(page, await at(page, 180, 350), await at(page, 620, 350));
  await expect(page.locator(".drawing .motion-path")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "▶ Preview step" }),
  ).toBeEnabled();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
  );
  expect(saved.slides[2].motion.ids).toHaveLength(5);
  expect(saved.slides[2].units.slice(5)).toEqual(
    saved.slides[1].units.slice(5),
  );
  await page.reload();
  await page.locator(".slide-card").nth(2).click();
  await expect(page.locator(".drawing .motion-path")).toHaveCount(1);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Animated HTML/ }).click(),
  ]);
  const html = readFileSync((await download.path())!, "utf8");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(html);
  await page.locator("#next").click();
  await page.locator("#next").click();
  await expect(page.locator("svg [data-unit]")).toHaveCount(10);
  await expect(page.locator("#caption")).toContainText("3 / 3");
  expect(errors).toEqual([]);
});
test("multiple cuts, locomotive, individual selection, flip and undo", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "+", exact: true }).click();
  await drop(page, "empty", 500, 350);
  await drop(page, "loco", 100, 350);
  await expect(page.locator(".drawing [data-unit]")).toHaveCount(4);
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  let data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
  );
  expect(data.slides[1].units[3].flipped).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await page.locator(".drawing [data-unit]").first().dblclick();
  await expect(page.locator(".drawing .chosen")).toHaveCount(1);
});

test("straight drawing, pause persistence, autoplay and actual export files", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await page.getByRole("button", { name: "Track", exact: true }).click();
  await drag(page, await at(page, 100, 300), await at(page, 1050, 325));
  let d = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
  );
  expect(d.tracks[0].a.y).toBe(d.tracks[0].b.y);
  await page.getByLabel("Pause before next step (seconds)").fill("0.5");
  await page.getByLabel("Pause before next step (seconds)").press("Tab");
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await drop(page, "loco", 200, 300);
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await drag(page, await at(page, 200, 300), await at(page, 600, 300));
  await page
    .getByLabel("Step instructions")
    .fill("Export check: loaded cars and empties.");
  await page.getByLabel("Step instructions").press("Tab");
  await page.getByRole("button", { name: "Apply pause to all steps" }).click();
  await page.reload();
  await page.locator(".slide-card").nth(2).click();
  await expect(page.getByLabel("Pause before next step (seconds)")).toHaveValue(
    "0.5",
  );
  await page.getByRole("button", { name: "▶ Play plan" }).click();
  await expect(page.locator(".phase")).toContainText("STEP 3 / 3", {
    timeout: 5000,
  });
  await expect(page.getByRole("button", { name: "▶ Play plan" })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Exit presentation" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const files: Record<string, Buffer> = {};
  for (const label of [
    /^PDF —/,
    /^PowerPoint/,
    /^PNG — current/,
    /^SVG — current/,
    /^SVG — all/,
    /^PNG — all/,
    /^Animated HTML/,
    /^Video \(/,
  ]) {
    const b = page.getByRole("button", { name: label });
    if (label.source.startsWith("^Video") && (await b.count()) === 0) continue;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      b.click(),
    ]);
    files[download.suggestedFilename()] = readFileSync(
      (await download.path())!,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Export ready" }),
    ).toBeVisible();
  }
  expect(files["operating-plan.pdf"]!.subarray(0, 4).toString()).toBe("%PDF");
  expect(files["operating-plan.pptx"]!.subarray(0, 2).toString()).toBe("PK");
  expect(files["step-3.png"]![0]).toBe(137);
  expect(files["step-3.svg"]!.toString()).toContain("Export check");
  const { unzipSync, strFromU8 } = await import("fflate");
  const ppt = unzipSync(files["operating-plan.pptx"]!);
  expect(strFromU8(ppt["ppt/slides/slide3.xml"]!)).toContain("Export check");
  expect(Object.keys(unzipSync(files["operating-plan-svg.zip"]!))).toHaveLength(
    3,
  );
  const video = Object.keys(files).find((n) => /\.(mp4|webm)$/.test(n));
  expect(video).toBeTruthy();
  expect(files[video!]!.length).toBeGreaterThan(1000);
  const mime = video!.endsWith("mp4") ? "video/mp4" : "video/webm";
  await page.setContent(
    `<video controls src="data:${mime};base64,${files[video!]!.toString("base64")}"></video>`,
  );
  await expect
    .poll(() =>
      page.locator("video").evaluate((v) => (v as HTMLVideoElement).readyState),
    )
    .toBeGreaterThan(0);
  expect(
    await page
      .locator("video")
      .evaluate((v) => (v as HTMLVideoElement).videoWidth),
  ).toBe(1200);
  await page.setContent(files["operating-plan.html"]!.toString());
  await page.locator("#autoplay").click();
  await expect(page.locator("#caption")).toContainText("3 / 3", {
    timeout: 5000,
  });
  await expect(page.locator("#autoplay")).toHaveText("Autoplay");
});

test("welcome, click-to-draw, grouped turnouts, deletion and zoom", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Quick start guide" }),
  ).toBeVisible();
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Next tip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Export when you are done" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start drawing", exact: true })
    .click();
  await page.getByRole("button", { name: "Track", exact: true }).click();
  let p = await at(page, 100, 300);
  await page.mouse.click(p.x, p.y);
  p = await at(page, 1000, 320);
  await page.mouse.click(p.x, p.y);
  const data = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
    );
  expect((await data()).tracks).toHaveLength(1);
  expect((await data()).tracks[0].b.y).toBe(300);
  await drag(page, await at(page, 200, 300), await at(page, 700, 300));
  await expect(page.getByRole("status")).toContainText("overlaps");
  expect((await data()).tracks).toHaveLength(1);
  await page.getByRole("button", { name: "Turnout", exact: true }).click();
  await page.getByRole("button", { name: "Right up", exact: true }).click();
  p = await at(page, 400, 300);
  await page.mouse.click(p.x, p.y);
  expect((await data()).tracks).toHaveLength(3);
  await page.getByRole("button", { name: "Left down", exact: true }).click();
  expect((await data()).tracks[2].b.x).toBeCloseTo(200, 2);
  expect((await data()).tracks[2].b.y).toBeCloseTo(360, 2);
  await page.keyboard.press("Delete");
  expect((await data()).tracks).toHaveLength(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await data()).tracks).toHaveLength(3);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".view-controls")).toContainText("125%");
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const before = await page.locator(".drawing svg").getAttribute("viewBox");
  await drag(page, await at(page, 600, 400), await at(page, 650, 400));
  expect(await page.locator(".drawing svg").getAttribute("viewBox")).not.toBe(
    before,
  );
  await page.getByRole("button", { name: "Select", exact: true }).click();
  p = await at(page, 300, 360);
  await page.mouse.click(p.x, p.y);
  await page
    .locator(".story-tools")
    .getByRole("button", { name: "Delete selected track", exact: true })
    .click();
  expect((await data()).tracks).toHaveLength(1);
  await page.getByRole("button", { name: "Track", exact: true }).click();
  await drag(page, await at(page, 200, 450), await at(page, 800, 470));
  expect((await data()).tracks[1].a.y).toBe((await data()).tracks[1].b.y);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await expect(page.locator(".drawing svg")).toHaveAttribute(
    "viewBox",
    "0 0 9600 5600",
  );
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Quick start guide" }),
  ).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Quick start guide" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  expect((await data()).tracks).toHaveLength(0);
});

test("annotations select, edit, drag, resize, delete, undo and reopen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await page.getByRole("button", { name: "Track", exact: true }).click();
  await drag(page, await at(page, 100, 300), await at(page, 1000, 300));
  const data = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
    );
  const text = async (value: string, x: number, y: number) => {
    await page.getByRole("button", { name: "Text", exact: true }).click();
    page.once("dialog", (d) => d.accept(value));
    const p = await at(page, x, y);
    await page.mouse.click(p.x, p.y);
  };
  await text("Customer track", 400, 300);
  await expect(page.locator(".annotation-chosen")).toHaveCount(1);
  page.once("dialog", (d) => d.accept("Loading track"));
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  expect((await data()).labels[0].text).toBe("Loading track");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.locator("[data-annotation-hit]").click();
  await expect(
    page.getByRole("button", { name: "Edit text", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept("Final label"));
  await page.locator("[data-annotation-hit]").dblclick();
  expect((await data()).labels[0].text).toBe("Final label");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await drag(page, await at(page, 430, 295), await at(page, 530, 395));
  expect((await data()).labels[0].a.y).toBeGreaterThan(350);
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await drag(page, await at(page, 300, 450), await at(page, 600, 450));
  await drag(page, await at(page, 600, 450), await at(page, 700, 500));
  expect((await data()).labels[1].b.x).toBeCloseTo(700, 1);
  await page.setViewportSize({ width: 760, height: 900 });
  await expect(
    page
      .locator(".story-tools")
      .getByRole("button", { name: "Delete annotation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".story-inspector")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("annotations-narrow.png"),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  // A click a few pixels from the thin line still selects the arrow.
  let p = await at(page, 500, 479);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".annotation-chosen")).toHaveCount(1);
  await page.keyboard.press("Delete");
  expect((await data()).labels).toHaveLength(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await data()).labels).toHaveLength(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await data()).labels).toHaveLength(1);
  await page.getByRole("button", { name: "End of track", exact: true }).click();
  p = await at(page, 1000, 300);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".annotation-chosen")).toHaveCount(1);
  await page
    .locator(".story-tools")
    .getByRole("button", { name: "Delete annotation", exact: true })
    .click();
  expect((await data()).labels).toHaveLength(1);
  await page.getByLabel("Plan title", { exact: true }).fill("UI check");
  await page.getByLabel("Plan title", { exact: true }).press("Tab");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const savedPath = (await download.path())!;
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Open", exact: true }).click(),
  ]);
  await chooser.setFiles(savedPath);
  await expect(page.getByLabel("Plan title", { exact: true })).toHaveValue(
    "UI check",
  );
  expect((await data()).labels[0].text).toBe("Final label");
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await drop(page, "loco", 200, 300);
  await text("Arrival", 400, 180);
  await page.getByLabel("Step title", { exact: true }).fill("Arrival snapshot");
  await page.getByLabel("Step title", { exact: true }).press("Backspace");
  expect((await data()).slides[1].annotations).toHaveLength(1);
  await page.getByLabel("Step title", { exact: true }).press("Tab");
  await page
    .locator(".story-tools")
    .getByRole("button", { name: "Delete annotation", exact: true })
    .click();
  expect((await data()).slides[1].annotations).toHaveLength(0);
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await text("Drop loaded cars", 400, 180);
  await page.keyboard.press("Delete");
  expect((await data()).slides[2].annotations).toHaveLength(0);
  await page.locator(".slide-card").first().click();
  await page.locator("[data-annotation-hit]").click();
  await page
    .locator(".story-tools")
    .getByRole("button", { name: "Delete annotation", exact: true })
    .click();
  expect((await data()).labels).toHaveLength(0);
  expect((await data()).tracks).toHaveLength(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".slide-card").nth(2).click();
  // Fixed layout labels on later steps must not be edited as local annotations.
  await drag(page, await at(page, 530, 395), await at(page, 600, 420));
  expect((await data()).labels).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("equipment controls, route editing, clearing movement and track endpoints", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "+", exact: true }).click();
  await page.getByRole("button", { name: "−", exact: true }).click();
  await expect(page.locator(".drawing [data-unit]")).toHaveCount(1);
  await page.getByRole("button", { name: "Empty", exact: true }).click();
  const data = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
    );
  expect((await data()).slides[1].units[0].kind).toBe("empty");
  await page.getByRole("button", { name: "Loaded", exact: true }).click();
  expect((await data()).slides[1].units[0].kind).toBe("loaded");
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(page.locator(".drawing [data-unit]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "+ Next step", exact: true }).click();
  await drag(page, await at(page, 180, 350), await at(page, 600, 350));
  await page.getByRole("button", { name: "Edit path", exact: true }).click();
  const p = await at(page, 400, 350);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Finish path", exact: true }).click();
  expect((await data()).slides[2].motion.path.length).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Reset path", exact: true }).click();
  await page
    .getByRole("button", { name: "▶ Preview step", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear movement", exact: true })
    .click();
  expect((await data()).slides[2].motion).toBeUndefined();
  expect((await data()).slides[2].units).toEqual(
    (await data()).slides[1].units,
  );
  await page
    .getByRole("button", { name: "Remove last step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove last step", exact: true })
    .click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const trackY = (await data()).tracks[0].b.y;
  const q = await at(page, 500, trackY);
  await page.mouse.click(q.x, q.y);
  await drag(page, await at(page, 1100, trackY), await at(page, 1000, trackY));
  expect((await data()).tracks[0].b.x).toBeCloseTo(1000, 1);
  await page.getByRole("button", { name: "Track", exact: true }).click();
  await drag(page, await at(page, 1000, trackY), await at(page, 1000, 550));
  expect((await data()).tracks).toHaveLength(2);
  expect((await data()).tracks[0].b.y).toBe(trackY);
});

test("expanded canvas and large yards preserve remote tracks in exports", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  const canvas = page.locator(".drawing");
  const normal = (await canvas.boundingBox())!;
  await page
    .getByRole("button", { name: "Expand canvas", exact: true })
    .click();
  const expanded = (await canvas.boundingBox())!;
  expect(expanded.width).toBeGreaterThan(normal.width + 200);
  expect(expanded.height).toBeGreaterThan(normal.height);
  await expect(page.getByLabel("Drawing size", { exact: true })).toHaveValue(
    "9600",
  );
  await expect(page.locator(".drawing svg")).toHaveAttribute(
    "viewBox",
    "0 0 1200 700",
  );
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await expect(page.locator(".drawing svg")).toHaveAttribute(
    "viewBox",
    "0 0 9600 5600",
  );
  await page.getByRole("button", { name: "Track", exact: true }).click();
  await drag(page, await at(page, 7000, 4600), await at(page, 9000, 4600));
  let data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("railway-storyboard-v1")!),
  );
  expect(data.tracks[0].b.x).toBeCloseTo(9000, 1);
  await page
    .getByRole("button", { name: "Restore panels", exact: true })
    .click();
  await expect(page.locator(".story-steps")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Drawing size", { exact: true })).toHaveValue(
    "9600",
  );
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [svg] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^SVG — current/ }).click(),
  ]);
  expect(readFileSync((await svg.path())!, "utf8")).toContain(
    'viewBox="0 0 9600 5600"',
  );
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^PNG — current/ }).click(),
  ]);
  expect(readFileSync((await png.path())!).readUInt32BE(16)).toBe(4800);
  const [html] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Animated HTML/ }).click(),
  ]);
  await page.setContent(readFileSync((await html.path())!, "utf8"));
  await expect(page.locator("svg")).toHaveAttribute("viewBox", "0 0 9600 5600");
  const inside = await page.locator("[data-track]").evaluate((line) => {
    const svg = (line as SVGLineElement).ownerSVGElement!,
      p = svg.createSVGPoint();
    p.x = 9000;
    p.y = 4600;
    const q = p.matrixTransform(svg.getScreenCTM()!),
      r = svg.getBoundingClientRect();
    return q.x >= r.left && q.x <= r.right && q.y >= r.top && q.y <= r.bottom;
  });
  expect(inside).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("large-yard-export.png"),
  });
});
