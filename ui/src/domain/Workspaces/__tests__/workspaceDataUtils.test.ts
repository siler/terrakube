import { waitFor } from "@testing-library/react";
import {
  buildResourceOptions,
  getResourceAddress,
  parseState,
  parseOldState,
  setupWorkspaceIncludes,
  CollectionVariableRow,
  GlobalVariableRow,
  WorkspaceHistoryRow,
  WorkspaceJobRow,
  WorkspaceIncludeOptions,
} from "../workspaceDataUtils";
import type { WorkspaceJob, WorkspacePage, WorkspacePageRow, WorkspaceScheduleRow } from "../workspaceQuery";
import { Resource } from "../../types";
import axiosInstance from "../../../config/axiosConfig";
import { workspacePageRow } from "@/testUtils/workspacePageRow";

const auxiliaryGet = jest.fn<Promise<unknown>, unknown[]>();
const apiGet = jest.mocked(axiosInstance.get);

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue({ data: { data: [] } });
});

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  axiosAuxiliary: { get: (...args: unknown[]) => auxiliaryGet(...args) },
}));

const baseResource: Resource = {
  name: "example",
  provider: "registry.terraform.io/hashicorp/random",
  type: "random_pet",
  module: "root_module",
  values: {},
  depends_on: [],
};

describe("getResourceAddress", () => {
  it("returns type.name for a root module resource", () => {
    const resource = { ...baseResource, module: "root_module" };
    expect(getResourceAddress(resource)).toBe("random_pet.example");
  });

  it("returns module.address.type.name for a child module resource", () => {
    const resource = { ...baseResource, module: "module.instances" };
    expect(getResourceAddress(resource)).toBe("module.instances.random_pet.example");
  });

  it('returns type.name["string_key"] when index is a string', () => {
    const resource = { ...baseResource, module: "root_module", name: "users", index: "name.surname" };
    expect(getResourceAddress(resource)).toBe('random_pet.users["name.surname"]');
  });

  it("returns type.name[0] when index is a number", () => {
    const resource = { ...baseResource, module: "root_module", name: "servers", index: 0 };
    expect(getResourceAddress(resource)).toBe("random_pet.servers[0]");
  });

  it('returns module.type.name["string_key"] for child module resource with index', () => {
    const resource = { ...baseResource, module: "module.cluster", name: "node", index: "primary" };
    expect(getResourceAddress(resource)).toBe('module.cluster.random_pet.node["primary"]');
  });
});

describe("buildResourceOptions", () => {
  it("sorts options alphabetically by address, regardless of input order", () => {
    const resources = [
      { ...baseResource, name: "zebra", module: "root_module" },
      { ...baseResource, name: "alpha", module: "root_module" },
      { ...baseResource, name: "middle", module: "root_module" },
    ];

    expect(buildResourceOptions(resources).map((option) => option.value)).toEqual([
      "random_pet.alpha",
      "random_pet.middle",
      "random_pet.zebra",
    ]);
  });

  it("returns matching value and label for each resource including indexed resources", () => {
    const resources = [
      { ...baseResource, name: "users", index: "alice.smith", module: "root_module" },
      { ...baseResource, name: "users", index: "name.surname", module: "root_module" },
    ];
    expect(buildResourceOptions(resources)).toEqual([
      { value: 'random_pet.users["alice.smith"]', label: 'random_pet.users["alice.smith"]' },
      { value: 'random_pet.users["name.surname"]', label: 'random_pet.users["name.surname"]' },
    ]);
  });
});

describe("parseOldState", () => {
  it("correctly extracts index_key from all instances of each resource", () => {
    const rawState = {
      version: 4,
      terraform_version: "1.15.8",
      resources: [
        {
          mode: "managed",
          type: "random_pet",
          name: "user_pet",
          provider: 'provider["registry.terraform.io/hashicorp/random"]',
          instances: [
            { index_key: "alice.smith", attributes: { id: "alice" } },
            { index_key: "bob.jones", attributes: { id: "bob" } },
            { index_key: "name.surname", attributes: { id: "surname" } },
          ],
        },
        {
          mode: "managed",
          type: "terraform_data",
          name: "standalone",
          provider: 'provider["terraform.io/builtin/terraform"]',
          instances: [{ attributes: { id: "single" } }],
        },
      ],
    };

    const result = parseOldState(rawState);
    expect(result.resources).toHaveLength(4);
    expect(result.resources[0]).toMatchObject({
      name: "user_pet",
      type: "random_pet",
      index: "alice.smith",
    });
    expect(result.resources[1]).toMatchObject({
      name: "user_pet",
      type: "random_pet",
      index: "bob.jones",
    });
    expect(result.resources[2]).toMatchObject({
      name: "user_pet",
      type: "random_pet",
      index: "name.surname",
    });
    expect(result.resources[3]).toMatchObject({
      name: "standalone",
      type: "terraform_data",
      index: undefined,
    });
  });
});

describe("parseState", () => {
  it("extracts index field from root_module resources", () => {
    const jsonState = {
      values: {
        root_module: {
          resources: [
            {
              name: "users",
              type: "terraform_data",
              index: "name.surname",
              provider_name: "terraform.io/builtin/terraform",
              values: { id: "1" },
            },
          ],
        },
      },
    };

    const result = parseState(jsonState);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]).toMatchObject({
      name: "users",
      type: "terraform_data",
      index: "name.surname",
    });
  });
});

/** A workspace page load with nothing related, overridden by `workspace` and the collections given. */
const page = (workspace: Partial<WorkspacePageRow> = {}, collections: Partial<WorkspacePage> = {}): WorkspacePage => ({
  workspace: workspacePageRow({ id: "ws-1", name: "ws", ...workspace }),
  jobs: null,
  variables: null,
  schedule: null,
  ...collections,
});

/** A run as the workspace page loads it, with `fields` laid over an empty one. */
const job = (fields: Pick<WorkspaceJob, "via"> & Partial<WorkspaceJob>): WorkspaceJob => ({
  id: "job-1",
  status: "completed",
  createdBy: null,
  createdDate: null,
  updatedDate: null,
  commitId: null,
  templateReference: null,
  approvedBy: null,
  approvedAt: null,
  approvalTeam: null,
  comments: null,
  prCommentError: null,
  ...fields,
});

const variableFields = {
  key: "owner",
  value: "me",
  category: "TERRAFORM",
  hcl: false,
  sensitive: false,
  description: "",
} as const;

const noopOptions = (): WorkspaceIncludeOptions => ({
  setVariables: () => {},
  setJobs: () => {},
  setEnvVariables: () => {},
  setHistory: () => {},
  setSchedule: () => {},
  setVCSProvider: () => {},
  currentStateId: { current: "" },
  variableSourcesKey: { current: null },
  manageState: Promise.resolve(false),
  axiosInstance: { get: jest.fn().mockResolvedValue({ data: {} }) },
  setResources: () => {},
  setOutputs: () => {},
  setContextState: () => {},
  setCollectionVariables: () => {},
  setCollectionEnvVariables: () => {},
  setGlobalVariables: () => {},
  setGlobalEnvVariables: () => {},
});

describe("workspace page row types", () => {
  it("only let the page read job fields it requests", () => {
    const row: WorkspaceJobRow = { ...job({ via: "UI" }), title: "Run", latestChange: null };
    // @ts-expect-error terraformPlan is not in the job fieldset
    expect(row.terraformPlan).toBeUndefined();
    expect(row.title).toBe("Run");
  });

  it("only let the tabs read the history and schedule fields they request", () => {
    const version: WorkspaceHistoryRow = {
      id: "h-1",
      output: "http://state",
      jobReference: "1",
      createdBy: null,
      createdDate: "2026-09-08T11:00:00Z",
      title: "Run",
      relativeDate: null,
    };
    const schedule: WorkspaceScheduleRow = { id: "s-1", cron: "0 0 * * *", templateReference: null };
    // @ts-expect-error serial is not in the history fieldset
    expect(version.serial).toBeUndefined();
    // @ts-expect-error enabled is not in the schedule fieldset
    expect(schedule.enabled).toBeUndefined();
    expect([version.output, schedule.cron]).toEqual(["http://state", "0 0 * * *"]);
  });
});

describe("global and collection variable requests", () => {
  it("only let the page read the fields they request", () => {
    const globalvar: GlobalVariableRow = { id: "g-1", ...variableFields };
    const variable: CollectionVariableRow = { id: "i-1", ...variableFields, priority: 1, collectionName: "shared" };
    // @ts-expect-error a global variable's organization is not requested
    expect(globalvar.organization).toBeUndefined();
    // @ts-expect-error a collection item's author is not requested
    expect(variable.createdBy).toBeUndefined();
  });

  it("lists collection items with their collection, split by category, and loads them once per reference set", async () => {
    const get = apiGet.mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith("reference/")
          ? {
              data: {
                data: {
                  id: "c-1",
                  attributes: { name: "shared", priority: 2 },
                  relationships: {
                    item: {
                      data: [
                        { type: "item", id: "i-1" },
                        { type: "item", id: "i-2" },
                      ],
                    },
                  },
                },
                included: [
                  { id: "i-1", type: "item", attributes: { key: "TF_LOG", value: "1", category: "ENV" } },
                  { id: "i-2", type: "item", attributes: { key: "region", value: "us", category: "TERRAFORM" } },
                ],
              },
            }
          : {
              data: {
                data: [
                  { id: "g-1", type: "globalvar", attributes: { key: "owner", value: "me", category: "TERRAFORM" } },
                ],
              },
            }
      )
    );
    const variableSourcesKey: { current: string | null } = { current: null };
    const setCollectionVariables = jest.fn();
    const setCollectionEnvVariables = jest.fn();
    const setGlobalVariables = jest.fn();
    const payload = page(
      { organization: { id: "org-1", name: "org" }, reference: [{ id: "ref-1" }] },
      { variables: [] }
    );
    const options = {
      ...noopOptions(),
      variableSourcesKey,
      setCollectionVariables,
      setCollectionEnvVariables,
      setGlobalVariables,
    };

    await setupWorkspaceIncludes(payload, options);
    expect(setCollectionVariables).toHaveBeenCalledWith([
      { id: "i-2", key: "region", value: "us", category: "TERRAFORM", priority: 2, collectionName: "shared" },
    ]);
    expect(setCollectionEnvVariables).toHaveBeenCalledWith([
      { id: "i-1", key: "TF_LOG", value: "1", category: "ENV", priority: 2, collectionName: "shared" },
    ]);
    expect(setGlobalVariables).toHaveBeenCalledWith([{ id: "g-1", key: "owner", value: "me", category: "TERRAFORM" }]);
    expect(variableSourcesKey.current).toBe("org-1,ref-1");
    expect(get.mock.calls.map(([url]) => url).sort()).toEqual([
      "organization/org-1/globalvar?fields[globalvar]=key,value,category,hcl,sensitive,description",
      "reference/ref-1/collection?include=item&fields[collection]=name,priority,item" +
        "&fields[item]=key,value,category,hcl,sensitive,description",
    ]);

    await setupWorkspaceIncludes(payload, options);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("tries again on the next load when the variables could not be loaded", async () => {
    apiGet.mockRejectedValue(new Error("down"));
    const variableSourcesKey: { current: string | null } = { current: null };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await setupWorkspaceIncludes(page({ organization: { id: "org-1", name: "org" } }, { variables: [] }), {
      ...noopOptions(),
      variableSourcesKey,
    });
    errorSpy.mockRestore();

    expect(variableSourcesKey.current).toBeNull();
  });
});

describe("setupWorkspaceIncludes for a tab that does not read every collection", () => {
  const payload = page({
    organization: { id: "org-1", name: "org" },
    history: [{ id: "h-1", jobReference: "1", output: "http://state", createdBy: null, createdDate: null }],
  });

  it("leaves the jobs, variables and schedules it did not ask for as they are", async () => {
    const setJobs = jest.fn();
    const setVariables = jest.fn();
    const setEnvVariables = jest.fn();
    const setSchedule = jest.fn();
    const setHistory = jest.fn();
    await setupWorkspaceIncludes(payload, {
      ...noopOptions(),
      setJobs,
      setVariables,
      setEnvVariables,
      setSchedule,
      setHistory,
    });

    expect(setJobs).not.toHaveBeenCalled();
    expect(setVariables).not.toHaveBeenCalled();
    expect(setEnvVariables).not.toHaveBeenCalled();
    expect(setSchedule).not.toHaveBeenCalled();
    expect(setHistory).toHaveBeenCalledWith([expect.objectContaining({ id: "h-1" })]);
  });

  it("loads no global or collection variables unless it asked for the workspace variables", async () => {
    const get = apiGet.mockResolvedValue({ data: { data: [] } });
    const variableSourcesKey: { current: string | null } = { current: null };
    await setupWorkspaceIncludes(
      { ...payload, jobs: [] },
      {
        ...noopOptions(),
        variableSourcesKey,
      }
    );

    expect(get).not.toHaveBeenCalled();
    expect(variableSourcesKey.current).toBeNull();
  });

  it("sets an empty job list when it asked for jobs and there are none", async () => {
    const setJobs = jest.fn();
    await setupWorkspaceIncludes(
      { ...payload, jobs: [] },
      {
        ...noopOptions(),
        setJobs,
      }
    );

    expect(setJobs).toHaveBeenCalledWith([]);
  });
});

describe("setupWorkspaceIncludes state preview", () => {
  const payload = page({
    iacType: "terraform",
    organization: { id: "org-1", name: "org" },
    history: [{ id: "hist-1", jobReference: "1", output: "http://state", createdBy: null, createdDate: null }],
  });

  beforeEach(() => {
    auxiliaryGet.mockReset();
    auxiliaryGet.mockResolvedValue({ data: { values: { outputs: { url: { type: "string", value: "x" } } } } });
  });

  it("downloads the newest state once the given permissions allow it, without asking for them again", async () => {
    const get = jest.fn().mockResolvedValue({ data: {} });
    const setOutputs = jest.fn();
    await setupWorkspaceIncludes(payload, {
      ...noopOptions(),
      axiosInstance: { get },
      manageState: Promise.resolve(true),
      setOutputs,
    });

    await waitFor(() => expect(setOutputs).toHaveBeenCalledWith([{ name: "url", type: "string", value: "x" }]));
    expect(auxiliaryGet).toHaveBeenCalledTimes(1);
    expect(auxiliaryGet).toHaveBeenCalledWith("http://state", expect.anything());
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("/access-token/"), expect.anything());
  });

  it("falls back to the raw tfstate when the show -json document has nothing to list", async () => {
    const rawState = {
      outputs: { enabled: { type: "bool", value: true } },
      resources: [{ type: "null_resource", name: "n", provider: "provider[x]", instances: [{ attributes: {} }] }],
    };
    auxiliaryGet.mockReset();
    auxiliaryGet.mockResolvedValueOnce({ data: { values: {} } }).mockResolvedValueOnce({ data: rawState });
    const setOutputs = jest.fn();
    const setResources = jest.fn();
    const setContextState = jest.fn();
    await setupWorkspaceIncludes(payload, {
      ...noopOptions(),
      manageState: Promise.resolve(true),
      setOutputs,
      setResources,
      setContextState,
    });

    await waitFor(() => expect(setOutputs).toHaveBeenCalledWith([{ name: "enabled", type: "bool", value: "true" }]));
    expect(setResources).toHaveBeenCalledWith([expect.objectContaining({ name: "n", module: "root_module" })]);
    expect(auxiliaryGet).toHaveBeenLastCalledWith(
      expect.stringContaining("/tfstate/v1/organization/org-1/workspace/ws-1/state/terraform.tfstate"),
      expect.anything()
    );
    expect(setContextState).toHaveBeenLastCalledWith(rawState);
  });

  it("sets the page state before the permissions answer, and skips the download without manageState", async () => {
    let resolvePermissions: (value: boolean) => void = () => {};
    const setHistory = jest.fn();
    await setupWorkspaceIncludes(payload, {
      ...noopOptions(),
      manageState: new Promise((resolve) => {
        resolvePermissions = resolve;
      }),
      setHistory,
    });

    expect(setHistory).toHaveBeenCalledTimes(1);
    resolvePermissions(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auxiliaryGet).not.toHaveBeenCalled();
  });
});

describe("setupWorkspaceIncludes job and history titles", () => {
  const createPayload = (jobVia: string, fields: Partial<WorkspaceJob> = {}) =>
    page(
      {
        iacType: "terraform",
        history: [
          { id: "hist-1", jobReference: null, output: null, createdBy: null, createdDate: "2026-09-08T11:00:00Z" },
        ],
      },
      {
        jobs: [
          job({
            via: jobVia,
            commitId: "abcdef123456",
            createdDate: "2026-09-08T12:00:00Z",
            updatedDate: "2026-09-08T12:05:00Z",
            ...fields,
          }),
        ],
      }
    );

  const runSetup = async (payload: WorkspacePage) => {
    let capturedJobs: WorkspaceJobRow[] = [];
    let capturedHistory: WorkspaceHistoryRow[] = [];
    await setupWorkspaceIncludes(payload, {
      ...noopOptions(),
      setJobs: (jobs) => {
        capturedJobs = jobs;
      },
      setHistory: (history) => {
        capturedHistory = history;
      },
    });
    return { jobs: capturedJobs, history: capturedHistory };
  };

  it("preserves approval details in run history", async () => {
    const payload = createPayload("UI", {
      approvedBy: "reviewer@example.com",
      approvedAt: "2026-09-08T12:04:00Z",
    });
    const { jobs } = await runSetup(payload);
    expect(jobs[0]).toMatchObject({
      approvedBy: "reviewer@example.com",
      approvedAt: "2026-09-08T12:04:00Z",
    });
  });

  it("generates dynamic Triggered via <Source> titles for non-UI webhook runs", async () => {
    const { jobs } = await runSetup(createPayload("Github"));
    expect(jobs[0].title).toBe("Triggered via GitHub");
  });

  it("formats Azure DevOps and CLI titles properly", async () => {
    expect((await runSetup(createPayload("AzureDevops"))).jobs[0].title).toBe("Triggered via Azure DevOps");
    expect((await runSetup(createPayload("CLI"))).jobs[0].title).toBe("Triggered via CLI");
  });

  it("keeps 'Queue manually using Terraform' for UI runs or undefined via", async () => {
    const { jobs, history } = await runSetup(createPayload("UI"));
    expect(jobs[0].title).toBe("Queue manually using Terraform");
    expect(history[0].title).toBe("Queue manually using Terraform");
  });

  it("uses the job comment as the run title when one is set", async () => {
    const { jobs } = await runSetup(
      createPayload("UI", { comments: "  Rotate the database credentials\nTicket OPS-42 " })
    );
    expect(jobs[0].title).toBe("Rotate the database credentials");
  });

  it("falls back to the default title for a blank comment or the CLI marker", async () => {
    expect((await runSetup(createPayload("UI", { comments: "   " }))).jobs[0].title).toBe(
      "Queue manually using Terraform"
    );
    expect((await runSetup(createPayload("CLI", { comments: "terraform-cli" }))).jobs[0].title).toBe(
      "Triggered via CLI"
    );
  });

  it("prefers the job comment over the Triggered via title for webhook runs", async () => {
    const { jobs } = await runSetup(createPayload("Github", { comments: "Deploy release 2.4" }));
    expect(jobs[0].title).toBe("Deploy release 2.4");
  });
});
