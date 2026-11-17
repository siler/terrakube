// Parses the API's JPA entity sources into the class, field, root-level and enum facts the generator needs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The parts of an OpenAPI schema object Elide's document uses. */
export type Schema = {
  type?: string;
  enum?: string[];
  items?: Schema;
  properties?: Record<string, Schema>;
};

export type Spec = { components: { schemas: Record<string, Schema> } };

export type JavaField = {
  javaType: string;
  initialized: boolean;
  relation?: string;
  // The DB column behind the field: @Column/@JoinColumn's name, absent when Hibernate names it implicitly.
  columnName?: string;
  // Set for @ComputedAttribute getters, which have no backing column.
  computed?: boolean;
  notNull: boolean;
  readRestricted: boolean;
};

export type JavaClass = {
  className: string;
  typeName?: string;
  // The table Hibernate maps the entity to: @Table(name), else snake_case of the entity name.
  table?: string;
  // Elide only serves root-level reads for types not annotated @Include(rootLevel = false).
  root: boolean;
  isEnum: boolean;
  superClass?: string;
  fields: Map<string, JavaField>;
};

/** Spring's physical naming strategy: camelCase becomes lowercase snake_case. */
export const snakeCase = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** The table Hibernate maps an entity to: @Table(name), else snake_case of the entity name. */
const tableName = (annotations: string, className: string): string => {
  const explicit = annotations.match(/@Table\(\s*name\s*=\s*"([^"]+)"/)?.[1];
  if (explicit) {
    return explicit;
  }
  const entityName = annotations.match(/@Entity(?:\s*\(\s*name\s*=\s*"([^"]+)")?/)?.[1];
  return snakeCase(entityName ?? className);
};

const RELATION = /@(ManyToOne|OneToOne|OneToMany|ManyToMany)\b/;
const CLASS_HEADER = /((?:@[\s\S]*?\n)*?)public\s+(?:abstract\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+(\w+))?/;
const ENUM_HEADER = /((?:@[\s\S]*?\n)*?)public\s+enum\s+(\w+)\b/;
const FIELD =
  /^(?:(?:private|protected|public)\s+)?(?!static\b|return\b)(?:final\s+)?((?:[a-z]\w*\.)*[A-Z][\w.<>, ?[\]]*|boolean|int|long|short|byte|double|float|char)\s+(\w+)\s*(=[^;]*)?;$/;

const COMPUTED_GETTER = /^public\s+([\w.<>, ?[\]]+?)\s+get(\w+)\s*\(/;

const javaFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return javaFiles(path);
    }
    return name.endsWith(".java") ? [path] : [];
  });

const elideTypeName = (annotations: string, className: string): string | undefined =>
  annotations.match(/@Include\([^)]*name\s*=\s*"([^"]+)"/)?.[1] ??
  annotations.match(/@Entity\([^)]*name\s*=\s*"([^"]+)"/)?.[1] ??
  (/@Include\b/.test(annotations) ? className[0].toLowerCase() + className.slice(1) : undefined);

/** What a field and a computed getter both declare: the type without spacing or package, and read restriction. */
const declared = (javaType: string, annotationText: string): Pick<JavaField, "javaType" | "readRestricted"> => ({
  javaType: javaType.replace(/\s+/g, "").replace(/\b[a-z]\w*\./g, ""),
  readRestricted: /@ReadPermission\b/.test(annotationText),
});

/** Class-level fields of one Java class with the annotations above each. */
const parseFields = (classBody: string): Map<string, JavaField> => {
  const fields = new Map<string, JavaField>();
  // Annotations (possibly spanning lines) seen since the last class-level declaration.
  let pending: string[] = [];
  // Brace depth relative to the class body, so method bodies and nested classes are skipped.
  let depth = 0;
  for (const raw of classBody.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    const atClassLevel = depth === 0;
    depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    if (!atClassLevel || line === "" || line.startsWith("*") || line.startsWith("/*")) {
      continue;
    }
    const field = line.match(FIELD);
    if (field) {
      const annotationText = pending.join(" ");
      fields.set(field[2], {
        ...declared(field[1], annotationText),
        initialized: Boolean(field[3]),
        relation: annotationText.match(RELATION)?.[1],
        columnName: annotationText.match(/@(?:Column|JoinColumn)\([^)]*?name\s*=\s*"([^"]+)"/)?.[1],
        notNull: /@NotNull\b|@NotBlank\b|nullable\s*=\s*false|optional\s*=\s*false/.test(annotationText),
      });
      pending = [];
    } else if (/@ComputedAttribute\b/.test(pending.join(" ")) && COMPUTED_GETTER.test(line)) {
      // Elide serialises a computed attribute from its getter, so it behaves like a field of the getter's type.
      const [, javaType, name] = line.match(COMPUTED_GETTER) ?? [];
      fields.set(name[0].toLowerCase() + name.slice(1), {
        ...declared(javaType, pending.join(" ")),
        initialized: false,
        computed: true,
        notNull: false,
      });
      pending = [];
    } else if (line.startsWith("@") || pending.length > 0) {
      pending.push(line);
      // A method or constructor ends the annotations that belonged to it.
      if (/[;{}]$/.test(line) && !line.startsWith("@")) {
        pending = [];
      }
    }
  }
  return fields;
};

export const parseJava = (dir: string): Map<string, JavaClass> => {
  const classes = new Map<string, JavaClass>();
  for (const file of javaFiles(dir)) {
    const source = readFileSync(file, "utf8");
    const classHeader = source.match(CLASS_HEADER);
    // Enum files declare no resource, but attribute fields can be typed by them.
    const enumHeader = classHeader ? undefined : source.match(ENUM_HEADER);
    const header = classHeader ?? enumHeader;
    if (!header || header.index === undefined) {
      continue;
    }
    const [, annotations, className, superClass] = header;
    const rest = source.slice(header.index + header[0].length);
    classes.set(className, {
      className,
      typeName: enumHeader ? undefined : elideTypeName(annotations, className),
      table: tableName(annotations, className),
      root: !/@Include\([^)]*rootLevel\s*=\s*false/.test(annotations),
      isEnum: Boolean(enumHeader),
      superClass,
      fields: enumHeader ? new Map<string, JavaField>() : parseFields(rest.slice(rest.indexOf("{") + 1)),
    });
  }
  return classes;
};

/** The resource classes by the JSON:API type name they serve. */
export const byTypeName = (classes: Map<string, JavaClass>): Map<string, JavaClass> =>
  new Map([...classes.values()].flatMap((cls) => (cls.typeName ? [[cls.typeName, cls] as const] : [])));

/** The fields of a class plus those of every superclass, nearest definition wins. */
export const fieldsWithInherited = (classes: Map<string, JavaClass>, cls: JavaClass): Map<string, JavaField> => {
  const merged = new Map<string, JavaField>();
  for (let current: JavaClass | undefined = cls; current; current = classes.get(current.superClass ?? "")) {
    for (const [name, field] of current.fields) {
      if (!merged.has(name)) {
        merged.set(name, field);
      }
    }
  }
  return merged;
};
