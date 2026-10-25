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
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export animation" }).click(),
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
