// The pure emitter: spec + entity map + not-null facts in, generated module source out. No I/O, so tests can
// assert on the prettier-free source directly.
import { byTypeName, fieldsWithInherited } from "./java.mts";
import type { JavaClass, JavaField, Schema, Spec } from "./java.mts";

/** Which fields of which resource are never null: Java rules plus the changelog's NOT NULL columns and join columns. */
export type NotNullFacts = { isNotNull(typeName: string, field: string): boolean };

const PRIMITIVES = new Set(["boolean", "int", "long", "short", "byte", "double", "float", "char"]);

const DATE_TYPES = new Set(["Date", "LocalDateTime", "OffsetDateTime", "Instant", "ZonedDateTime", "LocalDate"]);

const tsType = (schema: Schema, java: JavaField | undefined, problems: string[], where: string): string => {
  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  switch (schema.type) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "integer":
    case "number":
      return "number";
    case "array": {
      const element = java?.javaType.match(/^(?:List|Set|Collection)<(\w+)>$/)?.[1];
      if (element === "String") {
        return "string[]";
      }
      return `${tsType(schema.items ?? {}, undefined, problems, where)}[]`;
    }
    case "object":
      if (java && DATE_TYPES.has(java.javaType)) {
        return "string";
      }
      if (java && /^Map</.test(java.javaType)) {
        return "Record<string, string>";
      }
      problems.push(`${where}: OpenAPI type object with Java type ${java?.javaType ?? "unknown"}, emitted as unknown`);
      return "unknown";
    default:
      problems.push(`${where}: no OpenAPI type, emitted as unknown`);
      return "unknown";
  }
};

const nullable = (java: JavaField | undefined): boolean =>
  !java || (!PRIMITIVES.has(java.javaType) && !java.initialized && !java.notNull);

/** The Java enum an attribute is typed by, when the OpenAPI document lists its values. */
const enumNameOf = (
  attr: Schema,
  java: JavaField | undefined,
  classes: Map<string, JavaClass>,
): string | undefined =>
  attr.enum && java && classes.get(java.javaType)?.isEnum ? java.javaType : undefined;

const isIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

const enumConst = (name: string, values: string[]): string => {
  const members = values.map((value) => `  ${isIdentifier(value) ? value : JSON.stringify(value)}: ${JSON.stringify(value)},`);
  return [
    `/** The values the API serialises for the \`${name}\` Java enum. */`,
    `export const ${name} = {`,
    ...members,
    "} as const;",
    "",
    `export type ${name} = (typeof ${name})[keyof typeof ${name}];`,
  ].join("\n");
};

export const generate = (
  spec: Spec,
  classes: Map<string, JavaClass>,
  notNull: NotNullFacts,
): { source: string; problems: string[] } => {
  const byType = byTypeName(classes);
  const problems: string[] = [];
  const attributeMapEntries: string[] = [];
  const schemaEntries: string[] = [];
  const enums = new Map<string, string[]>();
  for (const [typeName, schema] of Object.entries(spec.components.schemas).sort(([a], [b]) => a.localeCompare(b))) {
    const cls = byType.get(typeName);
    if (!cls) {
      problems.push(
        `${typeName}: no Java entity declares this JSON:API type; attributes emitted nullable, relationships to-many`,
      );
    }
    const javaFields = cls ? fieldsWithInherited(classes, cls) : new Map<string, JavaField>();
    const attributes = Object.entries(schema.properties?.attributes?.properties ?? {});
    const relationships = Object.entries(schema.properties?.relationships?.properties ?? {});

    const attributeMapLines: string[] = [];
    for (const [name, attr] of attributes) {
      const java = javaFields.get(name);
      if (cls && !java) {
        problems.push(`${typeName}.${name}: not a field on ${cls.className} or its superclasses (computed?)`);
      }
      const enumName = enumNameOf(attr, java, classes);
      if (enumName) {
        const values = attr.enum ?? [];
        const seen = enums.get(enumName);
        if (!seen) {
          enums.set(enumName, values);
        } else if (JSON.stringify(seen) !== JSON.stringify(values)) {
          problems.push(`${typeName}.${name}: Java enum ${enumName} already emitted with different values`);
        }
      }
      const openApiType = tsType(attr, java, problems, `${typeName}.${name}`);
      // Elide leaves out an attribute the caller may not read, so only those can be missing from a response.
      const optional = !java || java.readRestricted ? "?" : "";
      const suffix = nullable(java) && !notNull.isNotNull(typeName, name) ? " | null" : "";
      // The attribute map names the enum instead of repeating its values.
      attributeMapLines.push(`    ${name}${optional}: ${enumName ?? openApiType}${suffix};`);
    }

    const schemaRelationshipLines: string[] = [];
    for (const [name, rel] of relationships) {
      const target = rel.properties?.data?.items?.properties?.type?.enum?.[0];
      if (!target) {
        problems.push(`${typeName}.${name}: no target type in the spec`);
      }
      const relation = javaFields.get(name)?.relation;
      if (cls && !relation) {
        problems.push(`${typeName}.${name}: no JPA relationship annotation found; emitted as to-many`);
      }
      const toOne = relation === "ManyToOne" || relation === "OneToOne";
      schemaRelationshipLines.push(
        `      ${name}: { type: ${JSON.stringify(target ?? "string")}, many: ${toOne ? "false" : "true"}, required: ${notNull.isNotNull(typeName, name)} },`,
      );
    }

    attributeMapEntries.push([`  ${JSON.stringify(typeName)}: {`, ...attributeMapLines, "  };"].join("\n"));

    schemaEntries.push(
      [
        `  ${JSON.stringify(typeName)}: {`,
        `    root: ${cls?.root ?? true},`,
        `    attributes: [${attributes.map(([name]) => JSON.stringify(name)).join(", ")}],`,
        "    relationships: {",
        ...schemaRelationshipLines,
        "    },",
        "  },",
      ].join("\n")
    );
  }

  const enumDecls = [...enums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => enumConst(name, values))
    .join("\n\n");

  const source = [
    "// Generated by ui/scripts/api-types/generate.mts from the API's /doc, its JPA entities and its Liquibase changelogs. Do not edit.",
    "// Nullability is inferred: Java primitives, initialised fields and @NotNull/@NotBlank/nullable=false are non-null,",
    "// as are columns the changelogs declare NOT NULL (to-one relationships via their join column).",
    "// Attributes with their own @ReadPermission, and computed ones, are optional: Elide omits what the caller can't read.",
    "",
    ...(enumDecls ? [enumDecls, ""] : []),
    "/** Attribute values by JSON:API type name, for reading a resource's attributes with their real types. */",
    "export interface ApiAttributes {",
    ...attributeMapEntries,
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
  return { source, problems };
};
