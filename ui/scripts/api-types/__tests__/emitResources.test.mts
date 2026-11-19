// Tests for the model-driven emitter: a hand-built ResourceModel in, prettier-free source out.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { emitResources } from "../lib/emitResources.mts";
import type { AttributeModel, RelationshipModel, ResourceModel, TypeModel } from "../lib/resourceModel.mts";

const attr = (name: string, extra: Partial<AttributeModel> = {}): AttributeModel => ({
  name,
  tsType: "string",
  nullable: true,
  optional: true,
  ...extra,
});

const rel = (name: string, extra: Partial<RelationshipModel> = {}): RelationshipModel => ({
  name,
  many: true,
  required: false,
  ...extra,
});

const type = (name: string, extra: Partial<TypeModel> = {}): TypeModel => ({
  name,
  root: true,
  attributes: [],
  relationships: [],
  ...extra,
});

const model = (types: TypeModel[]): ResourceModel => ({ types });

test("renders a loosest-default attribute as optional and nullable", () => {
  const source = emitResources(model([type("widget", { attributes: [attr("name")] })]), []);
  assert.match(source, /    name\?: string \| null;/);
});

test("renders tightened facts", () => {
  const source = emitResources(
    model([type("widget", { attributes: [attr("size", { tsType: "number", nullable: false, optional: false })] })]),
    []
  );
  assert.match(source, /    size: number;/);
});

test("names an enum const and types the attribute with it", () => {
  const source = emitResources(
    model([
      type("widget", { attributes: [attr("status", { enumName: "WidgetStatus", enumValues: ["pending", "failed"] })] }),
    ]),
    []
  );
  assert.match(source, /export const WidgetStatus = \{/);
  assert.match(source, /  pending: "pending",/);
  assert.match(source, /export type WidgetStatus = \(typeof WidgetStatus\)\[keyof typeof WidgetStatus\];/);
  assert.match(source, /    status\?: WidgetStatus \| null;/);
});

test("one enum name used twice emits one const", () => {
  const status = attr("status", { enumName: "WidgetStatus", enumValues: ["pending", "failed"] });
  const source = emitResources(
    model([type("widget", { attributes: [status] }), type("gadget", { attributes: [status] })]),
    []
  );
  assert.equal(source.split("export const WidgetStatus").length, 2);
});

test("API_SCHEMA carries root, attribute names and relationship facts", () => {
  const source = emitResources(
    model([
      type("part", {
        root: false,
        attributes: [attr("size", { tsType: "number" })],
        relationships: [rel("owner", { target: "widget", many: false, required: true })],
      }),
    ]),
    []
  );
  assert.match(source, /    root: false,/);
  assert.match(source, /    attributes: \["size"\],/);
  assert.match(source, /      owner: \{ type: "widget", many: false, required: true \},/);
});

test("a relationship without a target is typed string", () => {
  const source = emitResources(model([type("part", { relationships: [rel("owner")] })]), []);
  assert.match(source, /type: "string"/);
});

test("header lines lead the file", () => {
  const source = emitResources(model([type("widget")]), ["// a", "// b"]);
  assert.equal(source.startsWith("// a\n// b\n\n"), true);
});
