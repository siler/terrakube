#!/usr/bin/env node
// Regenerates the UI's JSON:API resource types from the model the API's ResourceModelExportTest exports.
//   node scripts/api-types/generate.mts [--model <file>] [--out <file>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { ModelJson } from "./lib/modelJson.mts";
import { renderResources } from "./lib/renderResources.mts";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    model: { type: "string" },
    out: { type: "string" },
  },
});
const model = values.model ?? resolve(here, "../../src/domain/generated/resource-model.json");
const out = values.out ?? resolve(here, "../../src/domain/generated/apiResources.ts");

const json = JSON.parse(readFileSync(model, "utf8")) as ModelJson;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await renderResources(json));
console.error(`wrote ${out}`);
for (const problem of json.problems) {
  console.error(`warning: ${problem}`);
}
