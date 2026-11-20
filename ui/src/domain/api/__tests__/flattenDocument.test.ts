import { flattenItem, flattenList } from "../flattenDocument";
import { fields } from "../../generated/apiPaths";
import { ids } from "../fieldSelection";

const resource = (
  type: string,
  id: string,
  attributes: Record<string, unknown> = {},
  relationships: Record<string, { data?: { id: string } | { id: string }[] | null }> = {}
) => ({ type, id, attributes, relationships });

describe("flattenItem and flattenList", () => {
  it("lifts attributes and drops the JSON:API type, keeping an attribute named type", () => {
    const document = {
      data: resource("action", "a1", { name: "plan", type: "apply", active: true }),
    };

    expect(flattenItem("action", fields.action("name", "type").selection, document)).toStrictEqual({
      id: "a1",
      name: "plan",
      type: "apply",
    });
  });

  it("joins nested includes along the selection", () => {
    const document = {
      data: resource("workspace", "w1", { name: "infra" }, { vcs: { data: { id: "v1" } } }),
      included: [resource("vcs", "v1", { vcsType: "GITHUB" })],
    };

    expect(flattenItem("workspace", fields.workspace("name", { vcs: ["vcsType"] }).selection, document)).toStrictEqual({
      id: "w1",
      name: "infra",
      vcs: { id: "v1", vcsType: "GITHUB" },
    });
  });

  it("flattens every resource of a list document", () => {
    const document = {
      data: [resource("action", "a1", { name: "plan" }), resource("action", "a2", { name: "apply" })],
    };

    expect(flattenList("action", fields.action("name").selection, document)).toStrictEqual([
      { id: "a1", name: "plan" },
      { id: "a2", name: "apply" },
    ]);
  });

  it("flattens to-one linkage data null to null", () => {
    const document = {
      data: resource("workspace", "w1", { name: "infra" }, { vcs: { data: null } }),
    };

    expect(flattenItem("workspace", fields.workspace("name", { vcs: ["name"] }).selection, document)).toStrictEqual({
      id: "w1",
      name: "infra",
      vcs: null,
    });
  });

  it("flattens linkage to a resource missing from included to null for to-one", () => {
    const document = {
      data: resource("workspace", "w1", { name: "infra" }, { vcs: { data: { id: "v9" } } }),
      included: [],
    };

    expect(flattenItem("workspace", fields.workspace("name", { vcs: ["name"] }).selection, document)).toStrictEqual({
      id: "w1",
      name: "infra",
      vcs: null,
    });
  });

  it("omits to-many entries whose resource is missing from included", () => {
    const document = {
      data: resource("organization", "o1", { name: "acme" }, { workspace: { data: [{ id: "w1" }, { id: "w9" }] } }),
      included: [resource("workspace", "w1", { name: "infra" })],
    };

    expect(
      flattenItem("organization", fields.organization("name", { workspace: ["name"] }).selection, document)
    ).toStrictEqual({
      id: "o1",
      name: "acme",
      workspace: [{ id: "w1", name: "infra" }],
    });
  });

  it("keeps a to-many property as [] when every referenced resource is missing from included", () => {
    const document = {
      data: resource("organization", "o1", { name: "acme" }, { workspace: { data: [{ id: "w9" }] } }),
      included: [],
    };

    expect(
      flattenItem("organization", fields.organization("name", { workspace: ["name"] }).selection, document)
    ).toStrictEqual({
      id: "o1",
      name: "acme",
      workspace: [],
    });
  });

  it("defaults a to-many to [] and nulls a to-one when the document has no linkage at all", () => {
    const document = {
      data: resource("workspace", "w1", { name: "infra" }),
    };

    expect(
      flattenItem("workspace", fields.workspace("name", { vcs: ["name"], job: ["status"] }).selection, document)
    ).toStrictEqual({
      id: "w1",
      name: "infra",
      vcs: null,
      job: [],
    });
    expect(flattenItem("workspace", fields.workspace({ vcs: ids, job: ids }).selection, document)).toStrictEqual({
      id: "w1",
      vcs: null,
      job: [],
    });
  });

  it("returns [] for data [], null for data null, and flattens without an included key", () => {
    const selection = fields.workspace("name").selection;

    expect(flattenList("workspace", selection, { data: [] })).toStrictEqual([]);
    expect(flattenItem("workspace", selection, { data: null })).toBeNull();
    expect(flattenItem("workspace", selection, { data: resource("workspace", "w1", { name: "infra" }) })).toStrictEqual(
      {
        id: "w1",
        name: "infra",
      }
    );
  });

  it("ids relationships flatten to bare { id }", () => {
    const document = {
      data: resource(
        "workspace",
        "w1",
        {},
        { vcs: { data: { id: "v1" } }, job: { data: [{ id: "j1" }, { id: "j2" }] } }
      ),
    };

    expect(flattenItem("workspace", fields.workspace({ vcs: ids, job: ids }).selection, document)).toStrictEqual({
      id: "w1",
      vcs: { id: "v1" },
      job: [{ id: "j1" }, { id: "j2" }],
    });
  });

  it("does not copy attributes the selection did not ask for", () => {
    const document = {
      data: resource("workspace", "w1", { name: "infra", description: "secret", locked: true }),
    };

    expect(flattenItem("workspace", fields.workspace("name").selection, document)).toStrictEqual({
      id: "w1",
      name: "infra",
    });
  });

  it("leaves a read-restricted attribute the document omits absent, not null", () => {
    const document = {
      data: resource("variable", "v1", { key: "tfvars" }),
    };

    expect(flattenItem("variable", fields.variable("key", "value").selection, document)).toStrictEqual({
      id: "v1",
      key: "tfvars",
    });
  });

  it("types an item read as one row or null and a list read as rows", () => {
    const selection = fields.workspace("name").selection;
    const item = flattenItem("workspace", selection, { data: resource("workspace", "w1", { name: "infra" }) });
    const list = flattenList("workspace", selection, { data: [resource("workspace", "w1", { name: "infra" })] });
    const one: { id: string; name: string } | null = item;
    const many: { id: string; name: string }[] = list;

    expect(one).not.toBeNull();
    expect(many).toHaveLength(1);
  });
});
