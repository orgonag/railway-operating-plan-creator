import { test, expect, type Page } from "@playwright/test";
import {
  blank,
  nextSlide,
  moveSlide,
  copy,
  drawingBounds,
  type Deck,
} from "../../src/storyboard/model";
const KEY = "railway-storyboard-v1";
function plan(): Deck {
  const d = blank();
  d.tracks = [{ id: "t", a: { x: 0, y: 200 }, b: { x: 1100, y: 200 } }];
  nextSlide(d).units = [
    {
      id: "l",
      cut: "a",
      kind: "loco",
      x: 100,
      y: 200,
      angle: 0,
      flipped: false,
    },
  ];
  nextSlide(d);
  moveSlide(
    d,
    2,
    ["l"],
    [
      { x: 100, y: 200 },
      { x: 300, y: 200 },
    ],
  );
  nextSlide(d);
  moveSlide(
    d,
    3,
    ["l"],
    [
      { x: 300, y: 200 },
      { x: 600, y: 200 },
    ],
  );
  d.slides[2]!.text = "Preserve service instructions";
  d.slides[3]!.annotations = [
    {
      id: "note",
      kind: "text",
      a: { x: 600, y: 100 },
      b: { x: 600, y: 100 },
      text: "Keep this note",
    },
  ];
  return d;
}
async function seed(page: Page, d: Deck | string) {
  await page.addInitScript(
    ({ raw, key }) => {
      if (!localStorage.getItem("seeded")) {
        localStorage.setItem(key, raw);
        localStorage.setItem("seeded", "1");
      }
      localStorage.setItem("railway-welcome-v1", "1");
    },
    { raw: typeof d === "string" ? d : JSON.stringify(d), key: KEY },
  );
  await page.goto("/");
}
async function data(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
}
async function at(page: Page, x: number, y: number) {
  return page.locator(".drawing svg").evaluate(
    (el, p) => {
      const svg = el as SVGSVGElement,
        q = svg.createSVGPoint();
      q.x = p.x;
      q.y = p.y;
      const t = q.matrixTransform(svg.getScreenCTM()!);
      return { x: t.x, y: t.y };
    },
    { x, y },
  );
}
async function drag(page: Page, x: number, to: number) {
  const a = await at(page, x, 200),
    b = await at(page, to, 200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
test("typing survives Escape, immediate reload, and a single click to another step", async ({
  page,
}) => {
  await seed(page, plan());
  for (const [label, value] of [
    ["Plan title", "Saved title"],
    ["Step title", "Saved layout title"],
    ["Step instructions", "Instructions preserved on Escape"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value!);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel(label!, { exact: true })).toHaveValue(value!);
  }
  await expect
    .poll(async () => (await data(page)).slides[0].text)
    .toBe("Instructions preserved on Escape");
  await page
    .getByRole("button", { name: "2 Starting snapshot", exact: true })
    .click();
  await expect(page.getByLabel("Step title", { exact: true })).toHaveValue(
    "Starting snapshot",
  );
  await page.reload();
  await expect(page.getByLabel("Plan title", { exact: true })).toHaveValue(
    "Saved title",
  );
  await expect(
    page.getByLabel("Step instructions", { exact: true }),
  ).toHaveValue("Instructions preserved on Escape");
});
test("unreadable saved plans remain recoverable after editing and reloading", async ({
  page,
}) => {
  const raw = "{broken original";
  await seed(page, raw);
  await expect(
    page.getByRole("button", { name: "Download recovery copy" }),
  ).toBeVisible();
  await page.getByLabel("Plan title", { exact: true }).fill("Replacement");
  await expect.poll(async () => (await data(page)).title).toBe("Replacement");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("railway-storyboard-v1:recovery"),
    ),
  ).toBe(raw);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Download recovery copy" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("railway-storyboard-v1:recovery"),
    ),
  ).toBe(raw);
});
test("stale tabs cannot overwrite newer work and unsaved drafts survive reload and further editing", async ({
  page,
  context,
}) => {
  await seed(page, plan());
  const other = await context.newPage();
  await other.goto("/");
  await page.getByLabel("Plan title", { exact: true }).fill("New work in A");
  await expect.poll(async () => (await data(page)).title).toBe("New work in A");
  await other
    .getByLabel("Plan title", { exact: true })
    .fill("Conflicting work in B");
  await expect(other.locator(".save-notice")).toContainText("Another tab");
  await expect
    .poll(() =>
      other.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("railway-storyboard-v1:tab-draft:"))
          .map((k) => localStorage.getItem(k))
          .join("\n"),
      ),
    )
    .toContain("Conflicting work in B");
  expect((await data(page)).title).toBe("New work in A");
  other.on("dialog", (d) => d.accept());
  await other.reload();
  await expect(
    other.getByRole("button", { name: "Download unsaved draft" }),
  ).toBeVisible();
  await other
    .getByLabel("Plan title", { exact: true })
    .fill("Later deliberate edit");
  await expect
    .poll(async () => (await data(other)).title)
    .toBe("Later deliberate edit");
  await other.reload();
  expect(
    await other.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("railway-storyboard-v1:tab-draft:"))
        .map((k) => localStorage.getItem(k))
        .join("\n"),
    ),
  ).toContain("Conflicting work in B");
  await other.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await reopened.getByRole("button", { name: "Restore unsaved draft" }).click();
  await expect(reopened.getByLabel("Plan title", { exact: true })).toHaveValue(
    "Conflicting work in B",
  );
  await expect
    .poll(async () => (await data(reopened)).title)
    .toBe("Conflicting work in B");
  await reopened.close();
});
test("startup, Open and presentation frame content and restore editing zoom", async ({
  page,
}) => {
  const d = blank();
  d.tracks = [
    { id: "far", a: { x: -200000, y: -150000 }, b: { x: -198000, y: -150000 } },
  ];
  await seed(page, d);
  const b = drawingBounds(d),
    frame = `${b.x} ${b.y} ${b.width} ${b.height}`;
  await expect(page.locator(".drawing svg")).toHaveAttribute("viewBox", frame);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const edited = await page.locator(".drawing svg").getAttribute("viewBox");
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.locator(".drawing svg")).toHaveAttribute("viewBox", frame);
  await page
    .getByRole("button", { name: "Exit presentation", exact: true })
    .click();
  await expect(page.locator(".drawing svg")).toHaveAttribute(
    "viewBox",
    edited!,
  );
  const incoming = blank();
  incoming.tracks = [
    { id: "new", a: { x: 200000, y: 300000 }, b: { x: 201000, y: 300000 } },
  ];
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "new.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(incoming)),
  });
  const b2 = drawingBounds(incoming);
  await expect(page.locator(".drawing svg")).toHaveAttribute(
    "viewBox",
    `${b2.x} ${b2.y} ${b2.width} ${b2.height}`,
  );
});
test("early corrections preserve downstream work and require ordered review", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, plan());
  await page
    .getByRole("button", { name: "2 Starting snapshot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revise this step", exact: true })
    .click();
  await drag(page, 100, 160);
  await expect
    .poll(async () => (await data(page)).slides[1].units[0].x)
    .toBeCloseTo(160, 1);
  let saved = await data(page);
  expect(saved.slides[2].needsReview).toBe(true);
  expect(saved.slides[3].needsReview).toBe(true);
  expect(saved.slides[2].units[0].x).toBe(300);
  expect(saved.slides[2].text).toBe("Preserve service instructions");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export plan" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /^4 .*Review needed/ }).click();
  await expect(
    page.getByRole("button", { name: "Rebuild this movement" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^3 .*Review needed/ }).click();
  await page.getByRole("button", { name: "Rebuild this movement" }).click();
  await page
    .getByRole("button", { name: "▶ Preview step", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: /^4 .*Review needed/ }).click();
  await page.getByRole("button", { name: "Rebuild this movement" }).click();
  await expect
    .poll(async () => (await data(page)).slides.some((s: any) => s.needsReview))
    .toBe(false);
  saved = await data(page);
  expect(saved.slides[3].annotations[0].text).toBe("Keep this note");
  // Remove the starting locomotive, then interact with its stale representation.
  await page
    .getByRole("button", { name: "2 Starting snapshot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revise this step", exact: true })
    .click();
  const p = await at(page, 160, 200);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: /^3 .*Review needed/ }).click();
  await drag(page, 300, 350);
  await expect(page.getByRole("status")).toContainText(
    "Some equipment was removed",
  );
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Use previous snapshot" }).click();
  await expect
    .poll(async () => (await data(page)).slides[2].units.length)
    .toBe(0);
  await page.reload();
  expect((await data(page)).slides[3].needsReview).toBe(true);
});
test("50-step 100-car plan opens, edits, previews and exports without long UI stalls", async ({
  page,
}) => {
  const d = blank();
  d.tracks = [{ id: "long", a: { x: 0, y: 200 }, b: { x: 20000, y: 200 } }];
  nextSlide(d).units = Array.from({ length: 100 }, (_, i) => ({
    id: `u${i}`,
    cut: "cut",
    kind: i === 0 ? "loco" : "loaded",
    x: 100 + i * 46,
    y: 200,
    angle: 0,
    flipped: false,
  }));
  for (let n = 2; n < 50; n++) {
    const prev = d.slides[n - 1]!.units[0]!;
    nextSlide(d);
    moveSlide(
      d,
      n,
      d.slides[n]!.units.map((u) => u.id),
      [
        { x: prev.x, y: 200 },
        { x: prev.x + 100, y: 200 },
      ],
    );
  }
  const start = Date.now();
  await seed(page, d);
  await expect(page.getByRole("button", { name: /^50 / })).toBeVisible();
  const opened = Date.now() - start;
  const edit = Date.now();
  await page
    .getByLabel("Plan title", { exact: true })
    .fill("Large acceptance plan");
  await expect
    .poll(async () => (await data(page)).title)
    .toBe("Large acceptance plan");
  const edited = Date.now() - edit;
  await page.getByRole("button", { name: /^50 / }).click();
  const preview = Date.now();
  await page
    .getByRole("button", { name: "▶ Preview step", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  const previewStarted = Date.now() - preview;
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Animated HTML/ }).click(),
  ]);
  expect(await download.path()).toBeTruthy();
  console.log(
    JSON.stringify({ largePlanTimingsMs: { opened, edited, previewStarted } }),
  );
  expect(edited).toBeLessThan(3000);
  expect(previewStarted).toBeLessThan(3000);
});

test("quota failures expose session recovery and never replace an unreadable original", async ({
  page,
}) => {
  const original = "broken original";
  const draft = plan();
  draft.title = "Session fallback work";
  await page.addInitScript(
    ({ raw }) => {
      sessionStorage.setItem("railway-storyboard-v1:tab-draft", raw);
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (
          this === localStorage &&
          k !== "railway-storyboard-v1" &&
          k !== "seeded" &&
          k !== "railway-welcome-v1"
        )
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        return set.call(this, k, v);
      };
    },
    { raw: JSON.stringify(draft) },
  );
  await seed(page, original);
  await expect(
    page.getByRole("button", { name: "Download unreadable original" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download unsaved draft" }),
  ).toBeVisible();
  await page
    .getByLabel("Plan title", { exact: true })
    .fill("New temporary work");
  expect(
    await page.evaluate(() => localStorage.getItem("railway-storyboard-v1")),
  ).toBe(original);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("railway-storyboard-v1:tab-draft"),
    ),
  ).toContain("Session fallback work");
  await expect(page.locator(".save-notice")).toContainText("protected");
});
