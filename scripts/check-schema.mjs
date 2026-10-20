// Checks every example plan against the PlanReading JSON Schema.
// Usage: npm run check-schema

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const schemaPath = join(root, "docs", "schema", "plan-reading.schema.json");
const examplesDir = join(root, "docs", "schema", "examples");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

let failed = 0;
for (const name of readdirSync(examplesDir).filter((n) => n.endsWith(".json")).sort()) {
  const doc = JSON.parse(readFileSync(join(examplesDir, name), "utf8"));
  if (validate(doc)) {
    console.log(`valid    ${name} (schemaVersion ${doc.schemaVersion})`);
    continue;
  }
  failed += 1;
  console.log(`invalid  ${name}`);
  for (const error of validate.errors ?? []) {
    console.log(`         ${error.instancePath || "/"}: ${error.message}`);
  }
}

if (failed > 0) {
  console.log(`${failed} example(s) failed the schema check.`);
  process.exit(1);
}
