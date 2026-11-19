// The exported model's JSON shape, mirroring the Java records in api/src/test/java/io/terrakube/api/schema/.
// The exporter omits nulls, so a null record component is an absent property here.
import type { AttributeModel, RelationshipModel, ResourceModel, TypeModel } from "./resourceModel.mts";

/** One wire date format, in language-neutral terms a parser can pick a decoder from. */
export type DateFormatJson = {
  standard: string;
  precision: string;
  offset: string;
  example: string;
  description: string;
};

/** One attribute's value type; `kind` first so a consumer can switch before reading anything else. */
export type TypeDescriptorJson =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "unknown" }
  | { kind: "enum"; name?: string; values: string[] } // name absent → an inline union of the values
  | { kind: "array"; items: TypeDescriptorJson }
  | { kind: "map"; values: TypeDescriptorJson }
  | { kind: "datetime"; format: string };

/** The whole exported model: date formats by id, the resource types, and anything the exporter could not resolve. */
export type ModelJson = {
  formats: Record<string, DateFormatJson>;
  types: {
    name: string;
    root: boolean;
    attributes: { name: string; type: TypeDescriptorJson; nullable: boolean; optional: boolean }[];
    relationships: { name: string; target?: string; many: boolean; required: boolean }[];
  }[];
  problems: string[];
};

/** The TypeScript type one descriptor's values carry; "unknown" when the export could not type them. */
export const tsTypeOf = (descriptor: TypeDescriptorJson): string => {
  switch (descriptor.kind) {
    case "string":
    case "datetime":
      return "string";
    case "number":
    case "boolean":
    case "unknown":
      return descriptor.kind;
    case "enum":
      return descriptor.values.map((value) => JSON.stringify(value)).join(" | ");
    case "array":
      return `${tsTypeOf(descriptor.items)}[]`;
    case "map":
      return `Record<string, ${tsTypeOf(descriptor.values)}>`;
    default: {
      // the JSON is parsed unchecked, so a kind newer than this reader still reaches here at runtime
      const unhandled: never = descriptor;
      const { kind }: { kind: unknown } = unhandled;
      throw new Error(`unsupported type descriptor kind: ${String(kind)}`);
    }
  }
};

/** Reads the exported JSON into the emitter's model, preserving the export's order and flags untouched. */
export const readModel = (json: ModelJson): ResourceModel => ({
  types: json.types.map((type): TypeModel => ({
    ...type,
    attributes: type.attributes.map(({ name, type, nullable, optional }): AttributeModel => ({
      name,
      tsType: tsTypeOf(type),
      nullable,
      optional,
      ...(type.kind === "enum" && type.name ? { enumName: type.name, enumValues: type.values } : {}),
    })),
    relationships: type.relationships.map(({ name, target, many, required }): RelationshipModel => ({
      name,
      target,
      many,
      required,
    })),
  })),
});
