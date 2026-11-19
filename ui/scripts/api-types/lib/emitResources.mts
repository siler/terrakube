// The pure emitter: a refined ResourceModel and the header lines in, generated module source out. No I/O, so tests can
// assert on the prettier-free source directly.
import type { ResourceModel } from "./resourceModel.mts";

const isIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

const enumConst = (name: string, values: readonly string[]): string => {
  const members = values.map(
    (value) => `  ${isIdentifier(value) ? value : JSON.stringify(value)}: ${JSON.stringify(value)},`
  );
  return [
    `/** The values the API serialises for the \`${name}\` Java enum. */`,
    `export const ${name} = {`,
    ...members,
    "} as const;",
    "",
    `export type ${name} = (typeof ${name})[keyof typeof ${name}];`,
  ].join("\n");
};

/** Renders the generated module below the caller's header: enum consts, the attribute map, API_SCHEMA and ApiTypeName. */
export const emitResources = (model: ResourceModel, header: readonly string[]): string => {
  const byName = [...model.types].sort((a, b) => a.name.localeCompare(b.name));
  const enums = new Map<string, readonly string[]>();
  const attributeEntries: string[] = [];
  const schemaEntries: string[] = [];
  for (const resource of byName) {
    const attributeLines = resource.attributes.map(
      (attribute) =>
        `    ${attribute.name}${attribute.optional ? "?" : ""}: ${attribute.enumName ?? attribute.tsType}${attribute.nullable ? " | null" : ""};`
    );
    attributeEntries.push([`  ${JSON.stringify(resource.name)}: {`, ...attributeLines, "  };"].join("\n"));

    const relationshipLines = resource.relationships.map(
      (relationship) =>
        `      ${relationship.name}: { type: ${JSON.stringify(relationship.target ?? "string")}, many: ${relationship.many}, required: ${relationship.required} },`
    );
    schemaEntries.push(
      [
        `  ${JSON.stringify(resource.name)}: {`,
        `    root: ${resource.root},`,
        `    attributes: [${resource.attributes.map((attribute) => JSON.stringify(attribute.name)).join(", ")}],`,
        "    relationships: {",
        ...relationshipLines,
        "    },",
        "  },",
      ].join("\n")
    );

    for (const attribute of resource.attributes) {
      if (attribute.enumName && !enums.has(attribute.enumName)) {
        enums.set(attribute.enumName, attribute.enumValues ?? []);
      }
    }
  }

  const enumDecls = [...enums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => enumConst(name, values))
    .join("\n\n");

  return [
    ...header,
    "",
    ...(enumDecls ? [enumDecls, ""] : []),
    "/** Attribute values by JSON:API type name, for reading a resource's attributes with their real types. */",
    "export interface ApiAttributes {",
    ...attributeEntries,
    "};",
    "",
    "/** The runtime facts the query layer reads: root level, attribute names, and per-relationship target, cardinality and requiredness. */",
    "export const API_SCHEMA = {",
    ...schemaEntries,
    "} as const;",
    "",
    "/** A JSON:API resource type name the API serves. */",
    "export type ApiTypeName = keyof typeof API_SCHEMA;",
    "",
  ].join("\n");
};
