// The drift test: the committed generated file is exactly what the committed model renders to, so neither side can
// change without the other.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { ModelJson } from "../lib/modelJson.mts";
import { renderResources } from "../lib/renderResources.mts";

const here = dirname(fileURLToPath(import.meta.url));
const generatedPath = resolve(here, "../../../src/domain/generated/apiResources.ts");
const modelPath = resolve(here, "../../../src/domain/generated/resource-model.json");

const render = async (): Promise<string> => renderResources(JSON.parse(readFileSync(modelPath, "utf8")) as ModelJson);

test("committed apiResources.ts equals a render of the committed model", async () => {
  assert.equal(await render(), readFileSync(generatedPath, "utf8"));
});

test("rendering is deterministic", async () => {
  assert.deepEqual(await render(), await render());
});
