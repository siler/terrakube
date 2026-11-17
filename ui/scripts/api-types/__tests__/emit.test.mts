// Tests for the pure emitter: fixture spec + entity map in, prettier-free source out.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { generate, type NotNullFacts } from "../lib/emit.mts";
import type { JavaClass, JavaField, Spec } from "../lib/java.mts";

const field = (javaType: string, extra: Partial<JavaField> = {}): JavaField => ({
  javaType,
  initialized: false,
  notNull: false,
  readRestricted: false,
  ...extra,
});

const classes = (): Map<string, JavaClass> => {
  const map = new Map<string, JavaClass>();
  map.set("Widget", {
    className: "Widget",
    typeName: "widget",
    root: true,
    isEnum: false,
    fields: new Map<string, JavaField>([
      ["name", field("String")],
      ["status", field("WidgetStatus", { notNull: true })],
      ["secret", field("String", { readRestricted: true })],
      ["parts", field("Part", { relation: "OneToMany" })],
    ]),
  });
  map.set("WidgetStatus", { className: "WidgetStatus", root: true, isEnum: true, fields: new Map<string, JavaField>() });
  map.set("Part", {
    className: "Part",
    typeName: "part",
    root: false,
    isEnum: false,
    fields: new Map<string, JavaField>([
      ["size", field("int", { notNull: true })],
      ["owner", field("Widget", { relation: "ManyToOne" })],
    ]),
  });
  return map;
};

const spec = (): Spec => ({
  components: {
    schemas: {
      widget: {
        properties: {
          attributes: {
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["pending", "failed"] },
              secret: { type: "string" },
            },
          },
          relationships: {
            properties: {
              parts: { properties: { data: { items: { properties: { type: { enum: ["part"] } } } } } },
            },
          },
        },
      },
      part: {
        properties: {
          attributes: { properties: { size: { type: "integer" } } },
          relationships: {
            properties: {
              owner: { properties: { data: { items: { properties: { type: { enum: ["widget"] } } } } } },
            },
          },
        },
      },
    },
  },
});

const notNever: NotNullFacts = { isNotNull: () => false };

test("emits API_SCHEMA with relationship type and many", () => {
  const { source } = generate(spec(), classes(), notNever);
  assert.match(source, /parts: \{ type: "part", many: true, required: false \}/);
  assert.match(source, /owner: \{ type: "widget", many: false, required: false \}/);
});

test("marks rootLevel=false classes root:false", () => {
  const { source } = generate(spec(), classes(), notNever);
  assert.match(source, /"widget": \{\n    root: true,/);
  assert.match(source, /"part": \{\n    root: false,/);
});

test("emits an enum const and types the attribute with it", () => {
  const { source } = generate(spec(), classes(), notNever);
  assert.match(source, /export const WidgetStatus = \{\n  pending: "pending",\n  failed: "failed",\n\} as const;/);
  assert.match(source, /export type WidgetStatus = \(typeof WidgetStatus\)\[keyof typeof WidgetStatus\];/);
  assert.match(source, /status: WidgetStatus;/);
  assert.doesNotMatch(source, /"pending" \| "failed"/);
});

test("emits only the attribute map, schema and enums: no JSON:API resource shapes or field lists", () => {
  const { source } = generate(spec(), classes(), notNever);
  assert.doesNotMatch(source, /export type Api(?!TypeName)\w+ =/);
  const consts = [...source.matchAll(/^export const (\w+)/gm)].map(([, name]) => name);
  assert.deepEqual(consts, ["WidgetStatus", "API_SCHEMA"]);
  assert.doesNotMatch(source, /^import /m);
});

test("ApiAttributes keeps @ReadPermission attributes optional", () => {
  const { source } = generate(spec(), classes(), notNever);
  const attributes = source.slice(source.indexOf("export interface ApiAttributes"));
  assert.match(attributes, /secret\?: string \| null;/);
  assert.match(attributes, /size: number;/);
});

test("required comes from the not-null facts", () => {
  const { source } = generate(spec(), classes(), {
    isNotNull: (typeName, fieldName) => typeName === "widget" && fieldName === "parts",
  });
  assert.match(source, /parts: \{ type: "part", many: true, required: true \}/);
  assert.match(source, /owner: \{ type: "widget", many: false, required: false \}/);
});

test("one Java enum shared by two attributes emits one const", () => {
  const shared = spec();
  shared.components.schemas.gadget = {
    properties: {
      attributes: { properties: { status: { type: "string", enum: ["pending", "failed"] } } },
      relationships: {},
    },
  };
  const map = classes();
  map.set("Gadget", {
    className: "Gadget",
    typeName: "gadget",
    root: true,
    isEnum: false,
    fields: new Map<string, JavaField>([["status", field("WidgetStatus", { notNull: true })]]),
  });
  const { source, problems } = generate(shared, map, notNever);
  assert.equal(problems.length, 0);
  assert.equal(source.split("export const WidgetStatus = {").length - 1, 1);
});

test("the same enum name with different value sets is a problem", () => {
  const conflicting = spec();
  conflicting.components.schemas.gadget = {
    properties: {
      attributes: { properties: { status: { type: "string", enum: ["queued"] } } },
      relationships: {},
    },
  };
  const map = classes();
  map.set("Gadget", {
    className: "Gadget",
    typeName: "gadget",
    root: true,
    isEnum: false,
    fields: new Map<string, JavaField>([["status", field("WidgetStatus", { notNull: true })]]),
  });
  const { source, problems } = generate(conflicting, map, notNever);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /WidgetStatus/);
  assert.match(problems[0], /status/);
  assert.equal(source.split("export const WidgetStatus = {").length - 1, 1);
});
