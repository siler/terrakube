// Tests for the paths emitter, plus a check that the committed apiPaths.ts matches API_SCHEMA.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { generatePaths, type SchemaType } from "../lib/emitPaths.mts";

const schema: Record<string, SchemaType> = {
  widget: {
    root: true,
    attributes: ["name"],
    relationships: {
      parts: { type: "part", many: true, required: false },
      owner: { type: "federated_claim", many: false, required: true },
      maker: { type: "part", many: false, required: false },
    },
  },
  part: { root: false, attributes: ["size"], relationships: {} },
  federated_claim: { root: false, attributes: [], relationships: {} },
};

test("picks the path builder from cardinality and requiredness", () => {
  const source = generatePaths(schema);
  assert.match(source, /parts: toMany\(partNode, `\$\{path\}\/parts`\),/);
  assert.match(source, /owner: requiredOne\(federatedClaimNode, `\$\{path\}\/owner`\),/);
  assert.match(source, /maker: optionalOne\(partNode, `\$\{path\}\/maker`\),/);
});

test("exposes only root types on api, and every type on fields", () => {
  const source = generatePaths(schema);
  const api = source.slice(source.indexOf("export const api"), source.indexOf("export const fields"));
  assert.match(api, /widget: toMany\(widgetNode, "widget"\)/);
  assert.doesNotMatch(api, /part:/);
  assert.match(source, /part: fragmentBuilder\("part", \["size"\]\),/);
  assert.match(source, /federated_claim: fragmentBuilder\("federated_claim", \[\]\),/);
  assert.match(source, /widget: fragmentBuilder\("widget", \["name", \{ parts: ids, owner: ids, maker: ids \}\]\),/);
});

test("filters a relationship on its target's attributes and id, rooted at the owning type", () => {
  const source = generatePaths(schema);
  assert.match(
    source,
    /parts: \{ \.\.\.partAttributes\("widget", "parts\."\), id: comparisons\("widget", "parts\.id"\) \},/
  );
});

test("the committed apiPaths.ts is what API_SCHEMA generates", async () => {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../src/domain/generated/apiPaths.ts");
  const { API_SCHEMA } = await import("../../../src/domain/generated/apiResources.ts");
  const options = (await prettier.resolveConfig(out)) ?? {};
  const expected = await prettier.format(generatePaths(API_SCHEMA), { ...options, filepath: out });
  assert.equal(readFileSync(out, "utf8"), expected, "run `yarn api-types:paths`");
});
