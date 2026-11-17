// Tests for the Liquibase changelog parser and the not-null facts it feeds the generator.
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parseChangelog, notNullFacts } from "../lib/liquibase.mts";
import type { JavaClass, JavaField } from "../lib/java.mts";

// Include paths are classpath-rooted (/db/changelog/...), so the fixture tree mimics
// api/src/main/resources with changelog.xml three directories below the root.
const withChangelogs = (files: Record<string, string>, run: (root: string, problems: string[]) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), "api-types-liquibase-"));
  try {
    for (const [name, xml] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, xml);
    }
    const problems: string[] = [];
    run(join(dir, "db/changelog/changelog.xml"), problems);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const changelog = (includes: string[], changes = ""): string => `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
${includes.map((file) => `  <include file="${file}"/>`).join("\n")}
${changes}
</databaseChangeLog>
`;

const field = (extra: Partial<JavaField> = {}): JavaField => ({
  javaType: "String",
  initialized: false,
  notNull: false,
  readRestricted: false,
  ...extra,
});

const entity = (typeName: string, table: string, fields: Record<string, JavaField>): Map<string, JavaClass> => {
  const cls: JavaClass = {
    className: "Widget",
    typeName,
    root: false,
    isEnum: false,
    table,
    fields: new Map(Object.entries(fields)),
  };
  return new Map([["Widget", cls]]);
};

test("follows includes in order", () => {
  withChangelogs(
    {
      "db/changelog/changelog.xml": changelog(["/db/changelog/local/a.xml", "/db/changelog/local/b.xml"]),
      "db/changelog/local/a.xml": `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="1" author="t">
    <createTable tableName="widget">
      <column name="id" type="varchar(36)">
        <constraints primaryKey="true"/>
      </column>
      <column name="name" type="varchar(32)">
        <constraints nullable="false"/>
      </column>
      <column name="note" type="varchar(32)">
        <constraints nullable="true"/>
      </column>
    </createTable>
  </changeSet>
</databaseChangeLog>
`,
      "db/changelog/local/b.xml": `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="2" author="t">
    <addColumn tableName="widget">
      <column name="color" type="varchar(32)">
        <constraints nullable="false"/>
      </column>
    </addColumn>
  </changeSet>
  <changeSet id="3" author="t">
    <dropNotNullConstraint tableName="widget" columnName="name" columnDataType="varchar(32)"/>
  </changeSet>
</databaseChangeLog>
`,
    },
    (root, problems) => {
      const tables = parseChangelog(root, problems);
      assert.deepEqual([...problems], []);
      assert.deepEqual([...tables.get("widget")?.entries() ?? []], [
        ["id", true],
        ["name", false],
        ["note", false],
        ["color", true],
      ]);
    },
  );
});

test("addNotNullConstraint then dropNotNullConstraint leaves nullable", () => {
  withChangelogs(
    {
      "db/changelog/changelog.xml": changelog(
        [],
        `  <changeSet id="1" author="t">
    <createTable tableName="widget">
      <column name="note" type="varchar(32)"/>
    </createTable>
  </changeSet>
  <changeSet id="2" author="t">
    <addNotNullConstraint tableName="widget" columnName="note" columnDataType="varchar(32)"/>
  </changeSet>
  <changeSet id="3" author="t">
    <dropNotNullConstraint tableName="widget" columnName="note" columnDataType="varchar(32)"/>
  </changeSet>
`,
      ),
    },
    (root, problems) => {
      const tables = parseChangelog(root, problems);
      assert.deepEqual([...problems], []);
      assert.equal(tables.get("widget")?.get("note"), false);
    },
  );
});

test("renameColumn carries the constraint", () => {
  withChangelogs(
    {
      "db/changelog/changelog.xml": changelog(
        [],
        `  <changeSet id="1" author="t">
    <createTable tableName="widget">
      <column name="old_name" type="varchar(32)">
        <constraints nullable="false"/>
      </column>
    </createTable>
  </changeSet>
  <changeSet id="2" author="t">
    <renameColumn tableName="widget" oldColumnName="old_name" newColumnName="new_name" columnDataType="varchar(32)"/>
  </changeSet>
`,
      ),
    },
    (root, problems) => {
      const tables = parseChangelog(root, problems);
      assert.deepEqual([...problems], []);
      const widget = tables.get("widget");
      assert.equal(widget?.get("new_name"), true);
      assert.equal(widget?.has("old_name"), false);
    },
  );
});

test("ignores demo-data", () => {
  withChangelogs(
    {
      "db/changelog/changelog.xml": changelog(["/db/changelog/local/a.xml"]),
      "db/changelog/local/a.xml": `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="1" author="t">
    <createTable tableName="widget">
      <column name="name" type="varchar(32)">
        <constraints nullable="false"/>
      </column>
    </createTable>
  </changeSet>
</databaseChangeLog>
`,
      "db/changelog/changelog-demo.xml": changelog(["/db/changelog/demo-data/demo.xml"]),
      "db/changelog/demo-data/demo.xml": `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <changeSet id="2" author="t">
    <createTable tableName="demo_widget">
      <column name="name" type="varchar(32)">
        <constraints nullable="false"/>
      </column>
    </createTable>
  </changeSet>
</databaseChangeLog>
`,
    },
    (root, problems) => {
      const tables = parseChangelog(root, problems);
      assert.deepEqual([...problems], []);
      assert.ok(tables.has("widget"));
      assert.equal(tables.has("demo_widget"), false);
    },
  );
});

test("maps @Column(name) and snake_case fields", () => {
  const classes = entity("widget", "widget", {
    name: field({ columnName: "widget_name" }),
    note: field(),
    lastJobStatus: field(),
  });
  const changelogs = new Map([
    ["widget", new Map([["widget_name", true], ["last_job_status", true]])],
  ]);
  const facts = notNullFacts(classes, changelogs);
  assert.equal(facts.isNotNull("widget", "name"), true);
  assert.equal(facts.isNotNull("widget", "note"), false);
  assert.equal(facts.isNotNull("widget", "lastJobStatus"), true);
  assert.equal(facts.isNotNull("unknown", "name"), false);
});

test("to-one with NOT NULL join column is required", () => {
  const classes = entity("workspace", "workspace", {
    organization: field({ javaType: "Organization", relation: "ManyToOne" }),
    project: field({ javaType: "Project", relation: "OneToOne", columnName: "project_id" }),
    vcs: field({ javaType: "Vcs", relation: "ManyToOne", notNull: true }),
    variable: field({ javaType: "List", relation: "OneToMany" }),
  });
  const changelogs = new Map([
    ["workspace", new Map([["organization_id", true], ["project_id", false]])],
  ]);
  const facts = notNullFacts(classes, changelogs);
  assert.equal(facts.isNotNull("workspace", "organization"), true);
  assert.equal(facts.isNotNull("workspace", "project"), false);
  assert.equal(facts.isNotNull("workspace", "vcs"), true);
  // To-many relationships are never required, even when a same-named column is NOT NULL.
  assert.equal(facts.isNotNull("workspace", "variable"), false);
});
