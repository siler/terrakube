// Tests for the JSON reader: the exported model's JSON shape in, the emitter's model out, descriptors mapped to TS types.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readModel, tsTypeOf, type ModelJson, type TypeDescriptorJson } from "../lib/modelJson.mts";

const json = (types: ModelJson["types"]): ModelJson => ({
  formats: {},
  types,
  problems: [],
});

test("scalar kinds and datetime map to their TS names", () => {
  assert.equal(tsTypeOf({ kind: "string" }), "string");
  assert.equal(tsTypeOf({ kind: "number" }), "number");
  assert.equal(tsTypeOf({ kind: "boolean" }), "boolean");
  assert.equal(tsTypeOf({ kind: "unknown" }), "unknown");
  assert.equal(tsTypeOf({ kind: "datetime", format: "rfc3339-seconds-utc" }), "string");
});

test("named enum keeps its name and values", () => {
  const type: TypeDescriptorJson = { kind: "enum", name: "Category", values: ["TERRAFORM", "ENV"] };
  assert.equal(tsTypeOf(type), '"TERRAFORM" | "ENV"');
  const [attribute] =
    readModel(
      json([
        {
          name: "workspace",
          root: true,
          attributes: [{ name: "category", type, nullable: false, optional: false }],
          relationships: [],
        },
      ])
    ).types[0]?.attributes ?? [];
  assert.equal(attribute?.enumName, "Category");
  assert.deepEqual(attribute?.enumValues, ["TERRAFORM", "ENV"]);
  assert.equal(attribute?.tsType, '"TERRAFORM" | "ENV"');
});

test("unnamed enum is an inline union", () => {
  const type: TypeDescriptorJson = { kind: "enum", values: ["pending", "failed"] };
  assert.equal(tsTypeOf(type), '"pending" | "failed"');
  const [attribute] =
    readModel(
      json([
        {
          name: "job",
          root: true,
          attributes: [{ name: "status", type, nullable: true, optional: true }],
          relationships: [],
        },
      ])
    ).types[0]?.attributes ?? [];
  assert.equal(attribute?.enumName, undefined);
  assert.equal(attribute?.enumValues, undefined);
  assert.equal(attribute?.tsType, '"pending" | "failed"');
});

test("nested array and map", () => {
  assert.equal(tsTypeOf({ kind: "array", items: { kind: "number" } }), "number[]");
  assert.equal(tsTypeOf({ kind: "map", values: { kind: "boolean" } }), "Record<string, boolean>");
  assert.equal(
    tsTypeOf({ kind: "map", values: { kind: "array", items: { kind: "enum", values: ["x"] } } }),
    'Record<string, "x"[]>'
  );
  assert.equal(
    tsTypeOf({ kind: "array", items: { kind: "map", values: { kind: "string" } } }),
    "Record<string, string>[]"
  );
});

test("an unsupported kind throws and names it", () => {
  const descriptor: TypeDescriptorJson = JSON.parse('{"kind":"tuple"}');
  assert.throws(() => tsTypeOf(descriptor), /unsupported type descriptor kind: tuple/);
});

test("readModel keeps order and flags", () => {
  const model = readModel(
    json([
      {
        name: "zebra",
        root: false,
        attributes: [
          { name: "zeta", type: { kind: "string" }, nullable: true, optional: true },
          { name: "alpha", type: { kind: "number" }, nullable: false, optional: false },
        ],
        relationships: [
          { name: "ownee", target: "alpha", many: true, required: false },
          { name: "owner", many: false, required: true },
        ],
      },
      {
        name: "alpha",
        root: true,
        attributes: [
          { name: "when", type: { kind: "datetime", format: "rfc3339-seconds-utc" }, nullable: false, optional: true },
        ],
        relationships: [],
      },
    ])
  );
  assert.deepEqual(
    model.types.map((type) => type.name),
    ["zebra", "alpha"]
  );
  const zebra = model.types[0];
  assert.deepEqual(
    zebra?.attributes.map((attribute) => attribute.name),
    ["zeta", "alpha"]
  );
  assert.equal(zebra?.attributes[0]?.nullable, true);
  assert.equal(zebra?.attributes[0]?.optional, true);
  assert.equal(zebra?.attributes[1]?.nullable, false);
  assert.equal(zebra?.attributes[1]?.optional, false);
  assert.equal(zebra?.root, false);
  assert.deepEqual(zebra?.relationships, [
    { name: "ownee", target: "alpha", many: true, required: false },
    { name: "owner", target: undefined, many: false, required: true },
  ]);
  assert.equal(model.types[1]?.root, true);
  assert.equal(model.types[1]?.attributes[0]?.tsType, "string");
});
