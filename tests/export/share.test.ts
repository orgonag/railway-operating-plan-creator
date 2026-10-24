// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { materialize } from "../../src/core/engine/materialize";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { openShareHash } from "../../src/editor/store/openShare";
import { lastOpenedId, listPlans, loadPlan, savePlan } from "../../src/editor/store/storage";
import { decodeShare, encodeShare, isShareHash, SHARE_PREFIX } from "../../src/export/share";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

beforeEach(() => localStorage.clear());

describe("share links", () => {
  test("encode then decode round-trips the demo", async () => {
    const link = await encodeShare(demo, "https://example.test/app/");
    expect(link.startsWith("https://example.test/app/" + SHARE_PREFIX)).toBe(true);
    expect(isShareHash(link.slice(link.indexOf("#")))).toBe(true);
    expect(isShareHash("#other")).toBe(false);
    const back = await decodeShare(link.slice(link.indexOf("#")));
    expect(back.problems).toEqual([]);
    expect(back.plan).toEqual(demo);
  });

  test("the demo link is under 2000 characters", async () => {
    const link = await encodeShare(demo);
    expect(link.length).toBeLessThan(2000);
    expect(link).toMatch(/^#plan=v1\.[A-Za-z0-9_-]+$/);
  });

  test("a wrong prefix, bad base64 and a newer schemaVersion each give a null plan and one problem", async () => {
    const wrong = await decodeShare("#plan=v9.abc");
    expect(wrong.plan).toBeNull();
    expect(wrong.problems).toHaveLength(1);
    const bad = await decodeShare(SHARE_PREFIX + "!!!not-base64***");
    expect(bad.plan).toBeNull();
    expect(bad.problems).toHaveLength(1);
    const newer = await encodeShare({ ...demo, schemaVersion: "2" } as unknown as PlanReading);
    const r = await decodeShare(newer);
    expect(r.plan).toBeNull();
    expect(r.problems).toHaveLength(1);
  });

  test("opening a share link adds a copy and keeps the saved plan", async () => {
    const a: PlanReading = { ...demo, title: "Plan A" };
    savePlan("a", a);
    const link = await encodeShare(demo);
    const opened = await openShareHash(link, localStorage);
    expect(opened).not.toBeNull();
    expect(opened!.plan.title).toBe("Copy of " + demo.title);
    expect(listPlans()).toHaveLength(2);
    expect(loadPlan("a")).toEqual(a);
    expect(lastOpenedId()).toBe(opened!.localId);
    expect(loadPlan(opened!.localId)!.title).toBe("Copy of " + demo.title);
    // A title already starting with "Copy of" is not doubled; a bad link opens nothing and saves nothing.
    const again = await openShareHash(await encodeShare(opened!.plan), localStorage);
    expect(again!.plan.title).toBe("Copy of " + demo.title);
    expect(await openShareHash("#plan=v1.garbage", localStorage)).toBeNull();
    expect(listPlans()).toHaveLength(3);
  });
});
