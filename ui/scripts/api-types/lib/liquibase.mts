// Reads the Liquibase changelogs into per-table column nullability, and turns those facts plus the entity
// annotations into the NotNullFacts the generator consumes. Table and column names are compared lower-cased,
// matching how databases fold unquoted identifiers.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { byTypeName, fieldsWithInherited, snakeCase } from "./java.mts";
import type { JavaClass, JavaField } from "./java.mts";
import type { NotNullFacts } from "./emit.mts";

/** Every table's columns, true when the column is NOT NULL after all changesets. */
export type Changelog = Map<string, Map<string, boolean>>;

// Change types that can never affect column nullability, so recognising them keeps the problems list
// meaningful instead of flooding it with every index and data change.
const NULLABILITY_NEUTRAL = new Set([
  "createIndex",
  "dropIndex",
  "addPrimaryKey",
  "dropPrimaryKey",
  "addForeignKeyConstraint",
  "dropForeignKeyConstraint",
  "addUniqueConstraint",
  "dropUniqueConstraint",
  "addDefaultValue",
  "dropDefaultValue",
  "modifyDataType",
  "sql",
  "sqlFile",
  "customChange",
  "insert",
  "update",
  "delete",
  "rename",
  "tagDatabase",
  "empty",
  "output",
]);

// Children of a changeSet that are metadata (conditions, rollback bodies) rather than changes to apply.
const CHANGESET_NON_CHANGES = new Set(["preConditions", "rollback", "validCheckSum", "modification", "output", "comment"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "changeSet" || name === "column" || name === "include",
});

const one = <T,>(value: T | T[]): T | undefined => (Array.isArray(value) ? value[0] : value);

const attrs = (node: unknown): Record<string, string> => {
  if (typeof node !== "object" || node === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(([key]) => key.startsWith("@_"))
      .map(([key, value]) => [key.slice(2), String(value)]),
  ) as Record<string, string>;
};

/** Whether a createTable/addColumn column ends up NOT NULL; a primary key column never is. */
const columnNotNull = (column: unknown): boolean => {
  const constraints = attrs(one((column as Record<string, unknown>)?.constraints));
  if (constraints.primaryKey === "true") {
    return true;
  }
  return constraints.nullable === "false";
};

const columnsOf = (change: Record<string, unknown>): Map<string, boolean> => {
  const columns = new Map<string, boolean>();
  for (const column of (change.column as unknown[]) ?? []) {
    const name = attrs(column).name;
    if (name) {
      columns.set(name.toLowerCase(), columnNotNull(column));
    }
  }
  return columns;
};

export const parseChangelog = (rootFile: string, problems: string[] = []): Changelog => {
  // Include paths are classpath-rooted, i.e. relative to the directory three levels above db/changelog/.
  const classpathRoot = dirname(dirname(dirname(rootFile)));
  const tables: Changelog = new Map();
  const seen = new Set<string>();
  const columnsFor = (table: string): Map<string, boolean> => {
    const columns = tables.get(table) ?? new Map<string, boolean>();
    tables.set(table, columns);
    return columns;
  };

  const apply = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    const doc = parser.parse(readFileSync(file, "utf8")) as {
      databaseChangeLog?: Record<string, unknown>;
    };
    const log = doc.databaseChangeLog;
    if (!log) {
      problems.push(`${file}: no databaseChangeLog element`);
      return;
    }
    const elements = (node: unknown): unknown[] => (Array.isArray(node) ? node : node ? [node] : []);
    for (const include of elements(log.include)) {
      const path = attrs(include).file;
      if (!path) {
        continue;
      }
      // Liquibase resolves bare paths against the classpath too (changelog.xml has both forms), so try
      // the including file's directory first for relative paths, then the classpath root.
      const candidates = path.startsWith("/")
        ? [join(classpathRoot, path)]
        : [join(dirname(file), path), join(classpathRoot, path)];
      const target = candidates.find((candidate) => existsSync(candidate));
      if (target) {
        apply(target);
      } else {
        problems.push(`${file}: include ${path} not found`);
      }
    }
    for (const changeSet of elements(log.changeSet)) {
      const source = attrs(changeSet);
      for (const [type, body] of Object.entries(changeSet as Record<string, unknown>)) {
        if (type.startsWith("@_") || CHANGESET_NON_CHANGES.has(type)) {
          continue;
        }
        for (const change of elements(body)) {
          const where = attrs(change);
          const table = where.tableName?.toLowerCase();
          switch (type) {
            case "createTable":
            case "addColumn":
              if (table) {
                const columns = columnsFor(table);
                for (const [name, notNull] of columnsOf(change as Record<string, unknown>)) {
                  columns.set(name, notNull);
                }
              }
              break;
            case "addNotNullConstraint":
            case "dropNotNullConstraint": {
              const column = where.columnName?.toLowerCase();
              if (table && column) {
                columnsFor(table).set(column, type === "addNotNullConstraint");
              }
              break;
            }
            case "renameColumn": {
              const from = where.oldColumnName?.toLowerCase();
              const to = where.newColumnName?.toLowerCase();
              if (table && from && to) {
                const columns = columnsFor(table);
                if (columns.has(from)) {
                  columns.set(to, columns.get(from) as boolean);
                  columns.delete(from);
                }
              }
              break;
            }
            case "renameTable": {
              const from = where.oldTableName?.toLowerCase();
              const to = where.newTableName?.toLowerCase();
              if (from && to && tables.has(from)) {
                tables.set(to, tables.get(from) as Map<string, boolean>);
                tables.delete(from);
              }
              break;
            }
            case "dropColumn": {
              const columns = table ? tables.get(table) : undefined;
              if (columns) {
                for (const name of (change as Record<string, unknown>).column
                  ? [...columnsOf(change as Record<string, unknown>).keys()]
                  : [where.columnName?.toLowerCase()]) {
                  if (name) {
                    columns.delete(name);
                  }
                }
              }
              break;
            }
            case "dropTable":
              if (table) {
                tables.delete(table);
              }
              break;
            default:
              if (!NULLABILITY_NEUTRAL.has(type)) {
                problems.push(`${file}: unrecognised change type ${type} (${source.id ?? "?"})`);
              }
          }
        }
      }
    }
  };

  apply(rootFile);
  return tables;
};

/** The join column of a to-one relationship: its explicit name, else the field's snake_case plus _id. */
const joinColumnOf = (fieldName: string, field: JavaField): string => field.columnName ?? `${snakeCase(fieldName)}_id`;

const columnOf = (fieldName: string, field: JavaField): string => field.columnName ?? snakeCase(fieldName);

export const notNullFacts = (classes: Map<string, JavaClass>, changelog: Changelog): NotNullFacts => {
  const byType = byTypeName(classes);
  return {
    isNotNull(typeName, fieldName) {
      const cls = byType.get(typeName);
      const java = cls ? fieldsWithInherited(classes, cls).get(fieldName) : undefined;
      if (!cls || !java || java.computed) {
        return false;
      }
      // Elide omits an attribute the caller may not read, so readRestricted fields can still be null.
      if (java.readRestricted) {
        return false;
      }
      // A to-one's requiredness comes from its join column; a to-many owns no column and is never required.
      const isToOne = java.relation === "ManyToOne" || java.relation === "OneToOne";
      if (isToOne) {
        return java.notNull || (changelog.get(cls.table ?? "")?.get(joinColumnOf(fieldName, java)) ?? false);
      }
      if (java.relation) {
        return false;
      }
      return changelog.get(cls.table ?? "")?.get(columnOf(fieldName, java)) ?? false;
    },
  };
};

