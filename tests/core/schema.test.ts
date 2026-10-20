import { describe, expect, test } from "vitest";

import demo from "../../docs/schema/examples/customer-service-demo.reading.json";
import dupFixture from "../fixtures/duplicate-ids.json";
import missingRefFixture from "../fixtures/missing-ref.json";
import v02Fixture from "../fixtures/v02-plan.json";
import v03OffstageFixture from "../fixtures/v03-offstage-left.json";
import { cloneJson } from "../../src/core/schema/clone";
import { migrate } from "../../src/core/schema/migrate";
import { SCHEMA_VERSION } from "../../src/core/schema/types";
import { validateFile } from "../../src/core/schema/validateFile";

describe("validateFile", () => {
  test("demo example validates with no problems", () => {
    const { plan, problems } = validateFile(demo);
    expect(problems).toEqual([]);
    expect(plan?.schemaVersion).toBe("1");
    expect(plan?.work.every((w) => typeof w.id === "string")).toBe(true);
    expect(plan?.work.map((w) => w.id)).toEqual(["W1", "W2", "W3", "W4", "W5", "W6", "W7"]);
  });

  test("0.2 plan migrates: unsure becomes assumed provenance, enters defaults to left", () => {
    const { plan, problems } = validateFile(v02Fixture);
    expect(plan?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(plan?.arrival.enters).toBe("left");
    expect(plan?.provenance?.["tracks.SPUR1.lengthFt"]).toEqual({ status: "assumed" });
    expect(plan?.provenance?.["facilities.RACKS.lengthFt"]).toEqual({ status: "assumed" });
    expect(problems.some((p) => p.repaired)).toBe(true);
    expect(problems.every((p) => p.repaired)).toBe(true);
  });

  test("0.2 car type that is not a known silhouette becomes generic", () => {
    const { plan, problems } = validateFile(v02Fixture);
    expect(plan?.consist.cuts[0]?.carType).toBe("generic");
    expect(problems.map((p) => p.path)).toContain("consist.cuts[0].carType");
  });

  test("0.3 steps get ids S1..Sn that avoid the switch named S1", () => {
    const { plan } = validateFile(v03OffstageFixture);
    expect(plan?.work.map((w) => w.id)).toEqual(["S2", "S3", "S4"]);
  });

  test("0.3 offstage left on a left-entering plan becomes arrival_end", () => {
    const { plan, problems } = validateFile(v03OffstageFixture);
    expect(plan?.work[2]).toHaveProperty("stop", { offstage: "arrival_end" });
    expect(problems.every((p) => p.repaired)).toBe(true);
  });

  test("0.3 offstage left on a right-entering plan becomes far_end", () => {
    const mirrored = cloneJson(v03OffstageFixture);
    mirrored.arrival.enters = "right";
    const { plan } = validateFile(mirrored);
    expect(plan?.work[2]).toHaveProperty("stop", { offstage: "far_end" });
  });

  test("duplicate ids: problem at the second, first kept", () => {
    const { plan, problems } = validateFile(dupFixture);
    expect(problems[0]?.path).toBe("tracks[1].id");
    expect(problems[0]?.repaired).toBe(true);
    expect(plan?.tracks.filter((t) => t.id === "MAIN")).toHaveLength(1);
    expect(plan?.tracks[0]?.name).toBe("Main line");
  });

  test("a reference to a missing track is reported and the plan still opens", () => {
    const { plan, problems } = validateFile(missingRefFixture);
    expect(plan).not.toBeNull();
    expect(problems.map((p) => p.path)).toContain("switches[0].to");
    expect(problems.find((p) => p.path === "switches[0].to")?.repaired).toBe(false);
  });

  test("a via switch that does not exist is reported", () => {
    const doc = cloneJson(missingRefFixture);
    doc.work[0] = {
      id: "W1",
      actor: "railroad",
      do: "run_light",
      to: "MAIN",
      via: ["S7"],
      text: "Run through a switch that is not in the file."
    } as (typeof doc.work)[number];
    const { plan, problems } = validateFile(doc);
    expect(plan).not.toBeNull();
    expect(problems.map((p) => p.path)).toContain("work[0].via[0]");
  });

  test("an arrival on a spur and a switch leading back to its own track are reported", () => {
    const doc = cloneJson(missingRefFixture);
    doc.tracks.push({ id: "SPUR9", role: "spur", end: "buffer_stop" } as (typeof doc.tracks)[number]);
    doc.arrival.on = "SPUR9";
    doc.switches[0]!.to = "MAIN";
    const { plan, problems } = validateFile(doc);
    expect(plan).not.toBeNull();
    expect(problems.map((p) => p.path)).toEqual(expect.arrayContaining(["arrival.on", "switches[0].to"]));
  });

  test("a spur reached by two switches is reported", () => {
    const doc = cloneJson(dupFixture);
    doc.tracks.splice(1, 1);
    doc.switches.push({ id: "S2", on: "MAIN", to: "SPUR1", side: "left", approach: "trailing" });
    const { problems } = validateFile(doc);
    expect(problems.map((p) => p.path)).toContain("tracks[1]");
  });

  test("garbage input returns a null plan and one problem", () => {
    const r = validateFile("not json");
    expect(r.plan).toBeNull();
    expect(r.problems).toHaveLength(1);
  });

  test("a schema-invalid plan returns a null plan with a problem per error", () => {
    const doc = cloneJson(dupFixture) as Record<string, unknown>;
    delete doc.departure;
    const r = validateFile(doc);
    expect(r.plan).toBeNull();
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.problems.every((p) => !p.repaired)).toBe(true);
  });

  test("an unknown schema version returns a null plan and one problem", () => {
    const r = validateFile({ ...dupFixture, schemaVersion: "7" });
    expect(r.plan).toBeNull();
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]?.path).toBe("schemaVersion");
  });
});

describe("migrate", () => {
  test("a v1 document passes through untouched", () => {
    const { doc, problems } = migrate(dupFixture);
    expect(doc).toEqual(dupFixture);
    expect(problems).toEqual([]);
  });

  test("does not change the document it was given", () => {
    const input = cloneJson(v02Fixture);
    migrate(input);
    expect(input).toEqual(v02Fixture);
  });
});
