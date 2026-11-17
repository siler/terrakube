import axiosInstance from "../../../config/axiosConfig";
import { axiosResponse } from "@/testUtils/fakeAxiosResponse";
import { toActionWorkspace, workspacePageQuery, workspacePageRequest, type WorkspacePageRow } from "../workspaceQuery";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const paramsOf = (tab: string, runOpen = false) =>
  new URLSearchParams(workspacePageQuery("org-1", "ws-1", workspacePageRequest(tab, runOpen)).url().split("?")[1]);

const WORKSPACE_FIELD_NAMES = [
  "allowRemoteApply",
  "branch",
  "createdBy",
  "createdDate",
  "defaultTemplate",
  "deleted",
  "description",
  "executionMode",
  "folder",
  "globalRemoteState",
  "iacType",
  "lastJobDate",
  "lastJobStatus",
  "lockDescription",
  "locked",
  "moduleSshKey",
  "name",
  "policyComplianceStatus",
  "requireApproveToApply",
  "restrictApplyToConfiguredBranch",
  "sharedIds",
  "source",
  "terraformVersion",
  "updatedBy",
  "updatedDate",
  "access",
  "agent",
  "history",
  "job",
  "notificationConfiguration",
  "organization",
  "project",
  "reference",
  "runTriggers",
  "schedule",
  "sourceRunTriggers",
  "ssh",
  "variable",
  "vcs",
  "webhook",
  "workspaceTag",
].sort();

describe("workspacePageRequest", () => {
  const includesOf = (tab: string, runOpen = false) => paramsOf(tab, runOpen).get("include")?.split(",").sort();
  const base = ["history", "organization", "project", "vcs"];

  it("loads the page chrome on every tab and only the collections each tab reads", () => {
    expect(includesOf("1")).toEqual([...base, "job"].sort());
    expect(includesOf("2")).toEqual([...base, "job"].sort());
    expect(includesOf("3")).toEqual(base);
    expect(includesOf("4")).toEqual([...base, "variable"].sort());
    expect(includesOf("5")).toEqual([...base, "schedule"].sort());
    expect(includesOf("6")).toEqual(base);
    expect(includesOf("7")).toEqual(base);
  });

  it("skips the job list while a run is open", () => {
    expect(includesOf("2", true)).toEqual(base);
    expect(workspacePageRequest("2", true).jobs).toBe(false);
  });

  it("says which tab collections each query carries", () => {
    const carried = (tab: string) => {
      const { jobs, variables, schedule } = workspacePageRequest(tab);
      return { jobs, variables, schedule };
    };
    expect(carried("1")).toEqual({ jobs: true, variables: false, schedule: false });
    expect(carried("4")).toEqual({ jobs: false, variables: true, schedule: false });
    expect(carried("5")).toEqual({ jobs: false, variables: false, schedule: true });
    expect(carried("3")).toEqual({ jobs: false, variables: false, schedule: false });
  });

  it("never sends agent or webhook includes", () => {
    ["1", "2", "3", "4", "5", "6", "7"].forEach((tab) => {
      expect(includesOf(tab)).not.toEqual(expect.arrayContaining(["agent"]));
      expect(includesOf(tab)).not.toEqual(expect.arrayContaining(["webhook"]));
    });
  });
});

describe.each([
  ["Overview", "1"],
  ["Variables", "4"],
  ["Schedules", "5"],
  ["Settings", "6"],
])("the %s workspace query", (_, tab) => {
  const params = paramsOf(tab);

  it("asks only for the vcs, organization and project attributes the page reads", () => {
    expect(params.get("fields[vcs]")).toBe("vcsType");
    expect(params.get("fields[organization]")).toBe("name");
    expect(params.get("fields[project]")).toBe("name");
  });

  // Elide returns bare {id, type} for any type without a fields entry once one fields param is present.
  it("names fields for the workspace and every included type", () => {
    const types = ["workspace", ...(params.get("include")?.split(",") ?? [])];
    types.forEach((type) => expect(params.has(`fields[${type}]`)).toBe(true));
  });

  it("sends only the include and one fields entry per type", () => {
    const types = ["workspace", ...(params.get("include")?.split(",") ?? [])];
    expect([...params.keys()].sort()).toEqual(["include", ...types.map((type) => `fields[${type}]`)].sort());
  });

  it("asks for every workspace field and only the history fields the States tab reads", () => {
    const fieldsOf = (type: string) => params.get(`fields[${type}]`)?.split(",").sort();
    expect(fieldsOf("workspace")).toEqual(WORKSPACE_FIELD_NAMES);
    expect(fieldsOf("history")).toEqual(["createdBy", "createdDate", "jobReference", "output"].sort());
  });
});

describe("the tab collection fieldsets", () => {
  const fieldsOf = (tab: string, type: string) => paramsOf(tab).get(`fields[${type}]`)?.split(",").sort();

  it("asks only for the job attributes the overview and runs list read", () => {
    expect(fieldsOf("1", "job")).toEqual(
      [
        "approvalTeam",
        "approvedAt",
        "approvedBy",
        "comments",
        "commitId",
        "createdBy",
        "createdDate",
        "prCommentError",
        "status",
        "templateReference",
        "updatedDate",
        "via",
      ].sort()
    );
    expect(fieldsOf("2", "job")).toEqual(fieldsOf("1", "job"));
  });

  it("asks only for the variable and schedule attributes their tabs read", () => {
    expect(fieldsOf("4", "variable")).toEqual(
      ["category", "description", "hcl", "incomplete", "key", "sensitive", "value"].sort()
    );
    // Reference ids come from the workspace's own linkage, so the Variables tab includes no reference.
    expect(paramsOf("4").has("fields[reference]")).toBe(false);
    expect(fieldsOf("5", "schedule")).toEqual(["cron", "templateReference"].sort());
  });
});

describe("workspacePageQuery", () => {
  const get = jest.mocked(axiosInstance.get);

  beforeEach(() => get.mockReset());

  it("requests the organization's workspace and returns the collection the tab asked for", async () => {
    const workspaceDocument = {
      data: {
        type: "workspace",
        id: "ws-1",
        attributes: { name: "prod" },
        relationships: {
          organization: { data: { type: "organization", id: "org-1" } },
          job: { data: [{ type: "job", id: "7" }] },
        },
      },
      included: [
        { type: "organization", id: "org-1", attributes: { name: "od" } },
        { type: "job", id: "7", attributes: { status: "completed" } },
      ],
    };
    get.mockResolvedValue(axiosResponse({ data: workspaceDocument }));

    const page = await workspacePageQuery("org-1", "ws-1", workspacePageRequest("1")).load(
      new AbortController().signal
    );

    expect(get.mock.calls[0][0]).toMatch(/^organization\/org-1\/workspace\/ws-1\?include=/);
    expect(page.workspace).toMatchObject({ id: "ws-1", name: "prod", organization: { id: "org-1", name: "od" } });
    expect(page.jobs).toEqual([{ id: "7", status: "completed" }]);
    expect([page.variables, page.schedule]).toEqual([null, null]);
  });
});

describe("toActionWorkspace", () => {
  it("hands action scripts the workspace as a JSON:API resource with linkage only", () => {
    const attributes = {
      allowRemoteApply: false,
      branch: "main",
      createdBy: null,
      createdDate: null,
      defaultTemplate: null,
      deleted: false,
      description: null,
      executionMode: null,
      folder: null,
      globalRemoteState: false,
      iacType: "terraform",
      lastJobDate: null,
      lastJobStatus: "completed",
      lockDescription: null,
      locked: false,
      moduleSshKey: null,
      name: "prod",
      policyComplianceStatus: "UNKNOWN",
      requireApproveToApply: false,
      restrictApplyToConfiguredBranch: false,
      sharedIds: null,
      source: "https://github.com/acme/infra.git",
      terraformVersion: "1.9.0",
      updatedBy: null,
      updatedDate: null,
    } satisfies Partial<WorkspacePageRow>;
    const workspace: WorkspacePageRow = {
      id: "ws-1",
      ...attributes,
      access: [],
      agent: null,
      history: [],
      job: [{ id: "7" }],
      notificationConfiguration: [],
      organization: { id: "org-1", name: "od" },
      project: null,
      reference: [],
      runTriggers: [],
      schedule: [],
      sourceRunTriggers: [],
      ssh: null,
      variable: [],
      vcs: null,
      webhook: null,
      workspaceTag: [],
    };

    expect(toActionWorkspace(workspace)).toEqual({
      type: "workspace",
      id: "ws-1",
      attributes,
      relationships: {
        access: { data: [] },
        agent: { data: null },
        history: { data: [] },
        job: { data: [{ type: "job", id: "7" }] },
        notificationConfiguration: { data: [] },
        organization: { data: { type: "organization", id: "org-1" } },
        project: { data: null },
        reference: { data: [] },
        runTriggers: { data: [] },
        schedule: { data: [] },
        sourceRunTriggers: { data: [] },
        ssh: { data: null },
        variable: { data: [] },
        vcs: { data: null },
        webhook: { data: null },
        workspaceTag: { data: [] },
      },
    });
  });
});
