/**
 * Browser smoke tests for the editor: the spec 13 editor actions, driven
 * with a real pointer in Chromium. Each test starts from the Single spur
 * template; coordinates come from the mounted editor's clientPoint, so the
 * tests follow the drawing wherever it is on the page.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface Pt {
  xFt: number;
  lane: number;
}

interface Xy {
  x: number;
  y: number;
}

interface PlanView {
  switches: { approach: string }[];
  tracks: { id: string; lengthFt?: number }[];
  work: { text?: string }[];
  title: string;
}

async function openTemplate(page: Page, label: "Single spur" | "Customer service demo"): Promise<void> {
  await page.goto("/?legacy=1");
  await page.locator('button.tool[data-tool="new"]').click();
  await page.locator("dialog.new-plan button.choice", { hasText: label }).click();
  await expect(page.locator("svg.plan g.sprites g.unit").first()).toBeVisible();
  // Fit once the page has its real size, so the whole drawing sits inside the canvas.
  await page.locator('button.tool[data-tool="fit"]').click();
}

async function client(page: Page, p: Pt): Promise<Xy> {
  return page.evaluate((pt) => {
    const c = window.ropcEditor!.clientPoint(pt);
    return { x: c.clientX, y: c.clientY };
  }, p);
}

async function plan(page: Page): Promise<PlanView> {
  return page.evaluate(() => {
    const p = window.ropcEditor!.history.plan;
    return { switches: p.switches, tracks: p.tracks, work: p.work as { text?: string }[], title: p.title };
  });
}

async function dragTo(page: Page, from: Xy, through: Xy[]): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const p of through) await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
}

async function centre(page: Page, selector: string): Promise<Xy> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`nothing at ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function spurLane(page: Page): Promise<number> {
  return page.evaluate(() => {
    const t = window.ropcEditor!.state().computed.drawing.tracks.find((x) => x.id === "SPUR1")!;
    return t.points[t.points.length - 1]!.lane;
  });
}

async function switchAt(page: Page, id: string): Promise<number> {
  return page.evaluate((sid) => window.ropcEditor!.state().computed.g.switches.get(sid)!.atFt, id);
}

async function selectWholeTrain(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const units = page.locator("svg.plan g.sprites g.unit");
  const n = await units.count();
  for (let i = 0; i < n; i++) await units.nth(i).click({ modifiers: ["Shift"], force: true });
}

test("place a turnout, flip it, stretch the track", async ({ page }) => {
  await openTemplate(page, "Single spur");
  const s1 = await switchAt(page, "S1");
  const dropX = s1 + 800;
  // Drag Turnout from the toolbar and come at the main from above and from the far side, so the guess is a trailing switch.
  const approach = await client(page, { xFt: dropX + 60, lane: 0.3 });
  const drop = await client(page, { xFt: dropX, lane: 0.1 });
  await dragTo(page, await centre(page, 'button.tool[data-tool="turnout"]'), [approach, drop]);
  let p = await plan(page);
  expect(p.switches).toHaveLength(2);
  await expect(page.locator('.properties button.flip[data-flip="left_right"]')).toBeVisible();
  const before = p.switches[1]!.approach;
  await page.locator('.properties button.flip[data-flip="left_right"]').click();
  p = await plan(page);
  expect(p.switches[1]!.approach).not.toBe(before);
  // Stretch SPUR1 by its end handle: 150 px toward the switch shortens it.
  const handle = await centre(page, 'g.overlay circle.track-end-handle[data-track="SPUR1"]');
  const left = await client(page, { xFt: 0, lane: await spurLane(page) });
  const towardSwitch = left.x < handle.x ? -150 : 150;
  await dragTo(page, handle, [{ x: handle.x + towardSwitch, y: handle.y }]);
  p = await plan(page);
  expect(p.tracks.find((t) => t.id === "SPUR1")!.lengthFt).toBeLessThan(600);
  await expect(page.locator(".step-strip li.step")).toHaveCount(2);
  for (let i = 0; i < 3; i++) await page.locator('button.tool[data-tool="undo"]').click();
  p = await plan(page);
  expect(p.switches).toHaveLength(1);
  expect(p.tracks.find((t) => t.id === "SPUR1")!.lengthFt).toBe(600);
  await expect(page.locator('button.tool[data-tool="undo"]')).toBeDisabled();
});

test("place cars and make a step by dragging", async ({ page }) => {
  await openTemplate(page, "Single spur");
  await page.locator('button.tool[data-tool="add-cars"]').click();
  const dialog = page.locator("dialog.add-cars");
  await dialog.locator('[name="count"]').fill("5");
  await dialog.locator('[name="state"]').selectOption("loaded");
  await dialog.locator("button.ok").click();
  await expect(page.locator("svg.plan g.sprites g.unit")).toHaveCount(6);
  await selectWholeTrain(page);
  const lane = await spurLane(page);
  const s1 = await switchAt(page, "S1");
  const inSpur = await client(page, { xFt: s1 + 240 + 290 + 300, lane });
  await dragTo(page, await centre(page, 'svg.plan g.sprites g.unit[data-id="L1"]'), [inSpur]);
  const p = await plan(page);
  expect(p.work).toHaveLength(1);
  expect(p.work[0]!.text!.startsWith("Shove")).toBe(true);
  await expect(page.locator(".step-strip li.step")).toHaveCount(3);
  await expect(page.locator(".step-strip li.step.current .step-verb")).toHaveText("Shove");
});

test("undo restores the drawing", async ({ page }) => {
  await openTemplate(page, "Single spur");
  await page.locator('button.tool[data-tool="add-cars"]').click();
  await page.locator("dialog.add-cars button.ok").click();
  const transforms = async (): Promise<string[]> =>
    page.locator("svg.plan g.sprites g.unit").evaluateAll((els) => els.map((e) => e.getAttribute("transform") ?? ""));
  const before = await transforms();
  expect(before).toHaveLength(6);
  await selectWholeTrain(page);
  const away = await client(page, { xFt: (await switchAt(page, "S1")) + 500, lane: 0 });
  await dragTo(page, await centre(page, 'svg.plan g.sprites g.unit[data-id="L1"]'), [away]);
  expect((await plan(page)).work).toHaveLength(1);
  expect(await transforms()).not.toEqual(before);
  await page.locator('button.tool[data-tool="undo"]').click();
  expect((await plan(page)).work).toHaveLength(0);
  // The strip stays on the step that was on show, which is now the departure; the arrival's drawing is back as it was.
  await page.locator(".step-strip li.step").first().click();
  expect(await transforms()).toEqual(before);
});

test("share link opens as a copy", async ({ page, context }) => {
  await openTemplate(page, "Single spur");
  const title = page.locator('.properties input[name="title"]');
  await title.fill("Shared spur");
  await title.press("Tab");
  await page.locator('button.tool[data-tool="share"]').click();
  const link = await page.locator("dialog.share input.share-link").inputValue();
  expect(link).toContain("#plan=v1.");
  await expect(page.locator("dialog.share .link-length")).toHaveText(`${link.length} characters`);
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator(".status .message")).toHaveText("Opened from a link as a copy");
  expect((await plan(other)).title).toBe("Copy of Shared spur");
  expect(other.url()).not.toContain("#plan=");
  // The first page's saved plan is still there, untouched, next to the copy.
  await page.reload();
  await page.locator('button.tool[data-tool="new"]').click();
  const saved = page.locator("dialog.new-plan button.choice.saved");
  await expect(saved.filter({ hasText: "Copy of Shared spur" })).toHaveCount(1);
  await expect(saved.filter({ hasText: /^Shared spur$/ })).toHaveCount(1);
});

test("standalone export downloads an html file that plays", async ({ page }) => {
  await openTemplate(page, "Customer service demo");
  await page.locator('button.tool[data-tool="export"]').click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('.export-menu button[data-action="standalone"]').click()]);
  expect(download.suggestedFilename()).toBe("how-a-train-services-a-customer.html");
  const html = readFileSync((await download.path())!, "utf8");
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.setContent(html);
  await expect(page.locator(".player .dot")).toHaveCount(9);
  await expect(page.locator("svg.plan g.unit")).toHaveCount(6);
  await page.locator(".player button.next").click();
  await expect(page.locator(".player .step-count")).toHaveText("Step 2 / 9");
  expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
});
