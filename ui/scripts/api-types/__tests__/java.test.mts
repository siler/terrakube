// Tests for the entity parser: root-level and enum detection on a small fixture tree.
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseJava } from "../lib/java.mts";

const WIDGET = `package example;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.validation.constraints.NotNull;
import com.yahoo.elide.annotation.Include;

@Include(rootLevel = false)
@Entity(name = "widget")
public class Widget extends Base {
    @Id
    private String id;

    @NotNull
    private String name;

    @Enumerated(EnumType.STRING)
    private WidgetStatus status;

    @OneToMany
    private java.util.List<Part> parts;
}
`;

const WIDGET_STATUS = `package example;

public enum WidgetStatus {
    pending,
    failed
}
`;

test("parseJava records the type name, root flag, enum flag and fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "api-types-java-"));
  try {
    writeFileSync(join(dir, "Widget.java"), WIDGET);
    writeFileSync(join(dir, "WidgetStatus.java"), WIDGET_STATUS);
    const classes = parseJava(dir);
    const widget = classes.get("Widget");
    assert.ok(widget);
    assert.equal(widget.typeName, "widget");
    assert.equal(widget.root, false);
    assert.equal(widget.isEnum, false);
    assert.equal(widget.superClass, "Base");
    assert.equal(widget.fields.get("name")?.notNull, true);
    assert.equal(widget.fields.get("status")?.javaType, "WidgetStatus");
    assert.equal(widget.fields.get("parts")?.relation, "OneToMany");
    const status = classes.get("WidgetStatus");
    assert.ok(status);
    assert.equal(status.isEnum, true);
    assert.equal(status.typeName, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("classes without rootLevel=false are root", () => {
  const dir = mkdtempSync(join(tmpdir(), "api-types-java-"));
  try {
    writeFileSync(
      join(dir, "Gadget.java"),
      `package example;\n\n@Entity\npublic class Gadget {\n    private String name;\n}\n`,
    );
    const classes = parseJava(dir);
    assert.equal(classes.get("Gadget")?.root, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
