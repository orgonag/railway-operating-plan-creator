// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";

import demoJson from "../../docs/schema/examples/customer-service-demo.reading.json";
import { materialize } from "../../src/core/engine/materialize";
import type { PlanReading } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";
import {
  downloadStandalone,
  standaloneFileName,
  standaloneHtml,
  STANDALONE_TITLE_SUFFIX,
} from "../../src/export/standalone";

const demo: PlanReading = materialize(validateFile(demoJson).plan!).plan;

describe("standaloneHtml", () => {
  test("standaloneHtml escapes </script> inside the plan and contains no http(s) URLs", () => {
    const plan: PlanReading = {
      ...demo,
      title: "A <b>bold</b> title & more",
      description:
        "Has </script><script>alert(1)</script> and <!-- a comment --> inside",
    };
    const html = standaloneHtml(plan, "/* player */");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(
      "<title>A &lt;b&gt;bold&lt;/b&gt; title &amp; more" +
        STANDALONE_TITLE_SUFFIX +
        "</title>",
    );
    const planScript = html.slice(
      html.indexOf('<script type="application/json" id="plan">'),
      html.indexOf("</script>", html.indexOf('id="plan"')),
    );
    expect(planScript).toContain("\\u003c/script>");
    expect(planScript).not.toContain("</script>");
    expect(planScript).not.toContain("<!--");
    const json = planScript.slice(planScript.indexOf(">") + 1);
    expect(JSON.parse(json).description).toBe(plan.description);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("ui-monospace");
    expect(html).toContain("/* player */");
  });

  test("file names: demo -> how-a-train-services-a-customer.html", () => {
    expect(standaloneFileName(demo)).toBe(
      "how-a-train-services-a-customer.html",
    );
    const names: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => undefined,
    });
    downloadStandalone(demo, "/* player */");
    expect(names).toEqual(["how-a-train-services-a-customer.html"]);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
