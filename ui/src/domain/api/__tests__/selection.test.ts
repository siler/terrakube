import { API_SCHEMA } from "../../generated/apiResources";
import { fields } from "../../generated/apiPaths";
import { buildQuery, ids, Row, Selection, toQueryString } from "../selection";

describe("buildQuery and toQueryString", () => {
  it("builds the airbyte workspace query", () => {
    const fragment = fields.workspace("name", "branch", {
      vcs: ["vcsType"],
      job: ["status", "createdDate"],
      organization: fields.organization("name"),
    });

    expect(toQueryString(buildQuery("workspace", fragment.selection))).toBe(
      "include=vcs,job,organization&fields[workspace]=name,branch,vcs,job,organization&fields[vcs]=vcsType" +
        "&fields[job]=status,createdDate&fields[organization]=name"
    );
  });

  it("nests include paths depth first in selection order", () => {
    const { selection } = fields.job("status", { step: ["status"], workspace: ["name", { vcs: ["name"] }] });

    expect(toQueryString(buildQuery("job", selection))).toBe(
      "include=step,workspace,workspace.vcs&fields[job]=status,step,workspace&fields[step]=status" +
        "&fields[workspace]=name,vcs&fields[vcs]=name"
    );
  });

  it("returns include paths and per-type field lists", () => {
    const { selection } = fields.job("status", { workspace: ["name"] });

    expect(buildQuery("job", selection)).toEqual({
      include: ["workspace"],
      fields: new Map([
        ["job", ["status", "workspace"]],
        ["workspace", ["name"]],
      ]),
    });
  });

  it("ids adds linkage without include", () => {
    const { selection } = fields.workspace("name", { vcs: ids, organization: ["name"] });

    expect(toQueryString(buildQuery("workspace", selection))).toBe(
      "include=organization&fields[workspace]=name,vcs,organization&fields[organization]=name"
    );
  });

  it("is just the fieldset when nothing is included", () => {
    expect(toQueryString(buildQuery("workspace", fields.workspace("name").selection))).toBe("fields[workspace]=name");
  });

  it("filters the primary type, encoding the expression", () => {
    const q = buildQuery("workspace", fields.workspace("name", { vcs: ["name"] }).selection);

    expect(toQueryString(q, "ssh.id==abc;name==*a b*")).toBe(
      "include=vcs&fields[workspace]=name,vcs&fields[vcs]=name&filter[workspace]=ssh.id%3D%3Dabc%3Bname%3D%3D*a%20b*"
    );
  });

  it("fields.x.all names every schema field", () => {
    const { attributes, relationships } = API_SCHEMA.reference;

    expect(toQueryString(buildQuery("reference", fields.reference.all.selection))).toBe(
      `fields[reference]=${[...attributes, ...Object.keys(relationships)].join(",")}`
    );
    expect(toQueryString(buildQuery("action", fields.action.all.selection))).toBe(
      `fields[action]=${API_SCHEMA.action.attributes.join(",")}`
    );
  });

  it("same selection on two paths emits one fieldset", () => {
    const { selection } = fields.workspace({
      organization: ["name"],
      project: ["name", { organization: ["name"] }],
    });

    expect(toQueryString(buildQuery("workspace", selection))).toBe(
      "include=organization,project,project.organization&fields[workspace]=organization,project" +
        "&fields[organization]=name&fields[project]=name,organization"
    );
  });

  it("throws on conflicting selections for one type", () => {
    const { selection } = fields.workspace({
      organization: ["name"],
      project: ["name", { organization: ["name", "icon"] }],
    });

    expect(() => buildQuery("workspace", selection)).toThrow(
      new Error("Conflicting selections for organization: name vs name,icon")
    );
  });
});

describe("fragments", () => {
  it("refuses to be put into a URL", () => {
    const fragment = fields.organization("name");

    expect(() => `organization/abc?${fragment}`).toThrow("toQueryString");
    expect(() => String(fragment)).toThrow("toQueryString");
    expect(() => fragment.toString()).toThrow("toQueryString");
  });

  it("rejects names the schema does not have", () => {
    // @ts-expect-error not a workspace attribute
    fields.workspace("address");
    // @ts-expect-error step is a job relationship, not a workspace one
    fields.workspace({ step: ["status"] });
    // @ts-expect-error the nested selection is checked against vcs, which has no branch
    fields.workspace({ vcs: ["branch"] });
    // @ts-expect-error a fragment of the wrong type
    fields.workspace({ vcs: fields.organization("name") });
    // @ts-expect-error a fragment comes only from fields
    const handMade: Selection<"workspace"> = [{ organization: { type: "organization", selection: ["name"] } }];
    expect(handMade).toBeDefined();
  });
});

describe("Row", () => {
  const workspace = fields.workspace("name", {
    organization: ["name"],
    vcs: fields.vcs("vcsType"),
    job: ["status"],
    project: ids,
    access: ids,
  });
  type WorkspaceRow = Row<typeof workspace>;

  const row: WorkspaceRow = {
    id: "ws-1",
    name: "airbyte",
    organization: { id: "org-1", name: "opendoor" },
    vcs: { id: "vcs-1", vcsType: "GITHUB" },
    job: [{ id: "1", status: "completed" }],
    project: null,
    access: [{ id: "a-1" }],
  };

  it("types selected attributes, nested rows and linkage", () => {
    expect(toQueryString(buildQuery("workspace", workspace.selection))).toBe(
      "include=organization,vcs,job&fields[workspace]=name,organization,vcs,job,project,access" +
        "&fields[organization]=name&fields[vcs]=vcsType&fields[job]=status"
    );
    // @ts-expect-error branch was not selected
    expect(row.branch).toBeUndefined();
    // @ts-expect-error JSON:API type never reaches a row
    expect(row.type).toBeUndefined();
    // @ts-expect-error organization's name is the only field selected
    expect(row.organization.description).toBeUndefined();
  });

  it("makes required to-one relationships non-nullable and optional ones nullable", () => {
    const organizationName: string = row.organization.name;
    // @ts-expect-error vcs is an optional to-one, so it may be null
    const vcsType: string = row.vcs.vcsType;
    const projectId: string | undefined = row.project?.id;
    const accessIds: string[] = row.access.map(({ id }) => id);

    expect([organizationName, vcsType, projectId, accessIds]).toEqual(["opendoor", "GITHUB", undefined, ["a-1"]]);
  });

  it("rejects a nullable required to-one", () => {
    const row: WorkspaceRow = {
      id: "ws",
      name: "n",
      // @ts-expect-error organization is a required to-one
      organization: null,
      vcs: null,
      job: [],
      project: null,
      access: [],
    };
    expect(row).toBeDefined();
  });

  it("types every field of fields.x.all", () => {
    const reference: Row<typeof fields.reference.all> = {
      id: "r-1",
      description: null,
      collection: { id: "c-1" },
      workspace: { id: "ws-1" },
    };
    const description: string | null | undefined = reference.description;
    const workspaceId: string = reference.workspace.id;
    // @ts-expect-error linkage carries only the id
    expect(reference.collection.name).toBeUndefined();

    expect([description, workspaceId]).toBeDefined();
  });
});
