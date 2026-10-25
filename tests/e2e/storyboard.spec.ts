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
