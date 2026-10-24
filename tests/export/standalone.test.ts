// @vitest-environment happy-dom
import { Window } from "happy-dom";
import { describe, expect, test, vi } from "vitest";

import playerScript from "../../app/generated/player.iife.js?raw";
import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { materialize } from "../../src/core/engine/materialize";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import { downloadStandalone, standaloneFileName, standaloneHtml, STANDALONE_TITLE_SUFFIX } from "../../src/export/standalone";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

describe("standaloneHtml", () => {
  test("standaloneHtml escapes </script> inside the plan and contains no http(s) URLs", () => {
    const plan: PlanReading = { ...demo, title: "A <b>bold</b> title & more", description: "Has </script><script>alert(1)</script> and <!-- a comment --> inside" };
    const html = standaloneHtml(plan, "/* player */");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>A &lt;b&gt;bold&lt;/b&gt; title &amp; more" + STANDALONE_TITLE_SUFFIX + "</title>");
    const planScript = html.slice(html.indexOf('<script type="application/json" id="plan">'), html.indexOf("</script>", html.indexOf('id="plan"')));
    expect(planScript).toContain("\\u003c/script>");
    expect(planScript).not.toContain("</script>");
    expect(planScript).not.toContain("<!--");
    const json = planScript.slice(planScript.indexOf(">") + 1);
    expect(JSON.parse(json).description).toBe(plan.description);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("ui-monospace");
    expect(html).toContain("/* player */");
  });

  test("standaloneHtml opened in a happy-dom Window mounts the player with 9 dots", async () => {
    const html = standaloneHtml(demo, playerScript);
    const win = new Window({ url: "file:///plan.html" });
    win.document.write(html);
    await win.happyDOM.waitUntilComplete();
    expect(win.document.title).toBe(demo.title + STANDALONE_TITLE_SUFFIX);
    expect(win.document.querySelectorAll(".player .dot")).toHaveLength(9);
    expect(win.document.querySelectorAll("svg.plan g.unit")).toHaveLength(6);
    expect(win.document.querySelector(".problems")!.children).toHaveLength(0);
    await win.happyDOM.close();
  });

  test("file names: demo -> how-a-train-services-a-customer.html", () => {
    expect(standaloneFileName(demo)).toBe("how-a-train-services-a-customer.html");
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    downloadStandalone(demo, "/* player */");
    expect(names).toEqual(["how-a-train-services-a-customer.html"]);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
