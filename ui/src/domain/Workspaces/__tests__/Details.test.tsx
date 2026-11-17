import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, NavigateFunction, Route, Routes, useNavigate } from "react-router-dom";
import { WorkspaceDetails } from "../Details";
import { usePolling } from "../../../hooks";
import { LOAD_DEADLINE_MS } from "../../../hooks/useCoalescedReload";
import { linkIncluded } from "@/testUtils/fixtureLinkage";

window._env_ = {
  REACT_APP_AUTHORITY: "http://localhost/authority",
  REACT_APP_CLIENT_ID: "client-id",
  REACT_APP_REDIRECT_URI: "http://localhost/redirect",
  REACT_APP_SCOPE: "openid",
  REACT_APP_TERRAKUBE_API_URL: "http://localhost:8080/api/v1",
  REACT_APP_TERRAKUBE_VERSION: "test",
  REACT_APP_REGISTRY_URI: "http://localhost:8080/registry",
};

type MockResponse = { data?: unknown };

type GetArgs = [url: string, config?: { signal?: AbortSignal }];

const getMock = jest.fn<Promise<MockResponse>, GetArgs>();
const auxiliaryGetMock = jest.fn<Promise<MockResponse>, unknown[]>();
const patchMock = jest.fn<Promise<MockResponse>, unknown[]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: GetArgs) => getMock(...args).then((response) => linkIncluded(args[0], response)),
    patch: (...args: unknown[]) => patchMock(...args),
  },
  axiosAuxiliary: { get: (...args: unknown[]) => auxiliaryGetMock(...args) },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message ? err.message : "Error"),
}));

// Details.tsx imports from '../../types.js' and '../Icons.jsx' with file extensions.
// Virtual mocks allow Jest to resolve these ESM extension imports in the test environment
// without requiring edits to untouched shared source files.
jest.mock("../../types.js", () => jest.requireActual<typeof import("../../types")>("../../types"), { virtual: true });
jest.mock("../Icons.jsx", () => jest.requireActual<typeof import("../Icons")>("../Icons"), { virtual: true });
jest.mock("../ResourceDrawer", () => ({ ResourceDrawer: () => null }));
jest.mock("../Settings/WorkspaceSettings", () => ({ WorkspaceSettings: () => null }));
jest.mock("../../Jobs/Details", () => ({ DetailsJob: () => <p>Run details</p> }));

const mockVariablesProps: { reload?: () => void } = {};
jest.mock("../Variables", () => ({
  Variables: (props: { reload: () => void }) => {
    mockVariablesProps.reload = props.reload;
    return null;
  },
}));

jest.mock("../../../hooks", () => ({
  ...jest.requireActual<typeof import("../../../hooks")>("../../../hooks"),
  usePolling: jest.fn(),
  useJobStatusSubscription: jest.fn(),
}));

/** The value, failing the test when an earlier step left it unset. */
const defined = <T,>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw new Error(`Expected ${what} to be set`);
  }
  return value;
};

/** The workspace fixture's request handler, so a test can wrap it. */
const currentGet = () => defined(getMock.getMockImplementation(), "a getMock implementation");

const renderDetails = (selectedTab?: string) =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-1"]}>
      <Routes>
        <Route
          path="/organizations/:orgid/workspaces/:id"
          element={
            <WorkspaceDetails
              setOrganizationName={jest.fn()}
              setWorkspaceManageState={jest.fn()}
              selectedTab={selectedTab}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe("WorkspaceDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders correctly with Remote fallback when executionMode is null (e.g. CLI driven workflow)", async () => {
    getMock.mockImplementation((url: string) => {
      if (url.includes("/workspace/ws-1")) {
        return Promise.resolve({
          data: {
            data: {
              id: "ws-1",
              type: "workspace",
              attributes: {
                name: "sample-workspace",
                description: "Test workspace",
                source:
                  "https://terrakube-api.localhost/remote/tfe/v2/configuration-versions/1/terraformContent.tar.gz",
                branch: "remote-content",
                executionMode: null,
                terraformVersion: "1.5.0",
                folder: "/",
              },
              relationships: {
                organization: { data: { id: "org-1" } },
              },
            },
            included: [
              {
                id: "org-1",
                type: "organization",
                attributes: { name: "test-org" },
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-1"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/workspaces/:id"
            element={<WorkspaceDetails setOrganizationName={jest.fn()} setWorkspaceManageState={jest.fn()} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("CLI/API-driven workflow")).toBeInTheDocument();
    });

    expect(screen.getByText("Remote")).toBeInTheDocument();
  });

  const mockWorkspaceWithRuns = (runs: Array<{ id: string; status: string }>) => {
    getMock.mockImplementation((url: string) => {
      if (url.includes("/workspace/ws-1")) {
        return Promise.resolve({
          data: {
            data: {
              id: "ws-1",
              type: "workspace",
              attributes: {
                name: "sample-workspace",
                description: "Test workspace",
                source: "https://github.com/example/repo.git",
                branch: "main",
                executionMode: "remote",
                terraformVersion: "1.5.0",
                iacType: "terraform",
                folder: "/",
              },
              relationships: {
                organization: { data: { id: "org-1" } },
                job: { data: runs.map((run) => ({ type: "job", id: run.id })) },
              },
            },
            included: [
              { id: "org-1", type: "organization", attributes: { name: "test-org" } },
              ...runs.map((run) => ({
                id: run.id,
                type: "job",
                attributes: {
                  status: run.status,
                  createdBy: "someone",
                  createdDate: "2026-10-19T10:00:00Z",
                  updatedDate: "2026-10-19T10:05:00Z",
                  via: "UI",
                  templateReference: "tpl-1",
                },
              })),
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  };

  const renderOverviewWithRuns = async (runs: Array<{ id: string; status: string }>) => {
    mockWorkspaceWithRuns(runs);
    renderDetails();
  };

  it("keeps the run waiting for approval in the card when newer runs queue behind it", async () => {
    await renderOverviewWithRuns([
      { id: "1", status: "completed" },
      { id: "2", status: "waitingApproval" },
      { id: "3", status: "pending" },
      { id: "4", status: "pending" },
    ]);

    const card = await screen.findByRole("article", { name: "Current run" });
    expect(card).toHaveTextContent("#2");
    expect(card).toHaveTextContent("2 more runs queued behind this one");
    expect(screen.getByRole("heading", { name: "Current run" })).toBeInTheDocument();
  });

  it("does not let a newer finished run replace the run waiting for approval", async () => {
    await renderOverviewWithRuns([
      { id: "2", status: "waitingApproval" },
      { id: "3", status: "completed" },
    ]);

    const card = await screen.findByRole("article", { name: "Current run" });
    expect(card).toHaveTextContent("#2");
    expect(card).not.toHaveTextContent("queued behind");
  });

  const requestedUrls = () => getMock.mock.calls.map(([url]) => String(url));

  it("requests the workspace with sparse job fields and without agent or webhook includes", async () => {
    await renderOverviewWithRuns([{ id: "1", status: "completed" }]);
    await screen.findByRole("article", { name: "Latest run" });

    const workspaceUrls = requestedUrls().filter((url) => url.startsWith("organization/org-1/workspace/ws-1?include="));
    expect(workspaceUrls.length).toBeGreaterThan(0);
    const params = new URLSearchParams(workspaceUrls[0].split("?")[1]);
    expect(params.get("include")?.split(",")).not.toEqual(expect.arrayContaining(["agent"]));
    expect(params.get("include")?.split(",")).not.toEqual(expect.arrayContaining(["webhook"]));
    expect(params.get("fields[job]")).toContain("templateReference");
    expect(params.get("fields[organization]")).toBe("name");
    expect(params.get("fields[workspace]")).toContain("locked");
  });

  it("asks for permissions once, on the workspace endpoint", async () => {
    await renderOverviewWithRuns([{ id: "1", status: "completed" }]);
    await screen.findByRole("article", { name: "Latest run" });

    const permissionUrls = requestedUrls().filter((url) => url.includes("/access-token/v1/teams/permissions/"));
    expect(permissionUrls).toEqual([
      "http://localhost:8080/access-token/v1/teams/permissions/organization/org-1/workspace/ws-1",
    ]);
  });

  it("locks the workspace by its route id from the header button", async () => {
    patchMock.mockResolvedValue({});
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const workspaceGet = currentGet();
    getMock.mockImplementation((url: string) =>
      url.includes("/access-token/")
        ? Promise.resolve({ data: { manageState: false, manageWorkspace: true, planJob: false, approveJob: false } })
        : workspaceGet(url)
    );
    renderDetails();
    await screen.findByRole("article", { name: "Latest run" });

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        "organization/org-1/workspace/ws-1",
        { data: { type: "workspace", id: "ws-1", attributes: { locked: true } } },
        { headers: { "Content-Type": "application/vnd.api+json" } }
      )
    );
  });

  it("reports a lock failure that has no API response instead of throwing", async () => {
    patchMock.mockRejectedValue(new Error("Network Error"));
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const workspaceGet = currentGet();
    getMock.mockImplementation((url: string) =>
      url.includes("/access-token/")
        ? Promise.resolve({ data: { manageState: false, manageWorkspace: true, planJob: false, approveJob: false } })
        : workspaceGet(url)
    );
    renderDetails();
    await screen.findByRole("article", { name: "Latest run" });

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));

    expect(await screen.findByText("Workspace lock failed: Network Error")).toBeInTheDocument();
  });

  it("downloads the newest state once the permissions allow it, even when they arrive last", async () => {
    let resolvePermissions: (value: MockResponse) => void = () => {};
    const permissionsResponse = new Promise<MockResponse>((resolve) => {
      resolvePermissions = resolve;
    });
    auxiliaryGetMock.mockResolvedValue({ data: { values: { outputs: { url: { type: "string", value: "x" } } } } });
    getMock.mockImplementation((url: string) => {
      if (url.includes("/access-token/")) {
        return permissionsResponse;
      }
      if (url.startsWith("organization/org-1/workspace/ws-1")) {
        return Promise.resolve({
          data: {
            data: {
              id: "ws-1",
              type: "workspace",
              attributes: { name: "sample-workspace", source: "https://github.com/example/repo.git", branch: "main" },
              relationships: {
                organization: { data: { id: "org-1" } },
                history: {
                  data: [
                    { type: "history", id: "h-1" },
                    { type: "history", id: "h-2" },
                  ],
                },
              },
            },
            included: [
              { id: "h-1", type: "history", attributes: { jobReference: "1", output: "http://state/1.json" } },
              { id: "h-2", type: "history", attributes: { jobReference: "2", output: "http://state/2.json" } },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderDetails();

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(
        expect.stringMatching(/^organization\/org-1\/workspace\/ws-1\?/),
        expect.anything()
      )
    );
    expect(await screen.findByText("No runs yet.")).toBeInTheDocument();
    expect(auxiliaryGetMock).not.toHaveBeenCalled();

    resolvePermissions({ data: { manageState: true, manageWorkspace: true, planJob: true, approveJob: true } });
    await waitFor(() => expect(auxiliaryGetMock).toHaveBeenCalledTimes(1));
    expect(auxiliaryGetMock).toHaveBeenCalledWith("http://state/2.json", expect.anything());
  });

  it("queues one reload when polls fire while the workspace request is in flight", async () => {
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const workspaceGet = currentGet();
    const responses: Array<() => void> = [];
    getMock.mockImplementation((url: string) =>
      url.startsWith("organization/org-1/workspace/ws-1?include=")
        ? new Promise((resolve) => responses.push(() => resolve(workspaceGet(url))))
        : workspaceGet(url)
    );
    const workspaceRequests = () =>
      requestedUrls().filter((url) => url.startsWith("organization/org-1/workspace/ws-1?include="));
    renderDetails();
    await waitFor(() => expect(workspaceRequests()).toHaveLength(1));

    const pollCalls = jest.mocked(usePolling).mock.calls;
    const poll = pollCalls[pollCalls.length - 1][0];
    poll();
    poll();
    poll();
    expect(workspaceRequests()).toHaveLength(1);

    responses[0]();
    await waitFor(() => expect(workspaceRequests()).toHaveLength(2));
    responses[1]();
    await screen.findByRole("article", { name: "Latest run" });
    expect(workspaceRequests()).toHaveLength(2);
  });

  it("renders without waiting for permissions, and enables Run now once they allow it", async () => {
    let resolvePermissions: (value: MockResponse) => void = () => {};
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const workspaceGet = currentGet();
    getMock.mockImplementation((url: string) =>
      url.includes("/access-token/")
        ? new Promise((resolve) => {
            resolvePermissions = resolve;
          })
        : workspaceGet(url)
    );
    renderDetails();

    expect(await screen.findByRole("article", { name: "Latest run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run now/i })).toBeDisabled();

    resolvePermissions({ data: { manageState: false, manageWorkspace: false, planJob: true, approveJob: false } });
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
  });

  it("drops a load that times out without showing its cancellation as an error", async () => {
    jest.useFakeTimers();
    try {
      mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
      const workspaceGet = currentGet();
      let hang = true;
      getMock.mockImplementation((url: string, config?: { signal?: AbortSignal }) => {
        if (hang && url.startsWith("organization/org-1/workspace/ws-1?include=")) {
          hang = false;
          return new Promise((_, reject) =>
            config?.signal?.addEventListener("abort", () => reject(new Error("canceled")))
          );
        }
        return workspaceGet(url);
      });
      renderDetails();
      await act(async () => {
        jest.advanceTimersByTime(LOAD_DEADLINE_MS);
      });
      expect(screen.queryByText("canceled")).not.toBeInTheDocument();

      const pollCalls = jest.mocked(usePolling).mock.calls;
      await act(async () => {
        pollCalls[pollCalls.length - 1][0]();
      });
      expect(await screen.findByRole("article", { name: "Latest run" })).toBeInTheDocument();
      expect(screen.queryByText("canceled")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores a late global variables response for the workspace the page has navigated away from", async () => {
    const workspaceResponse = (workspaceId: string, jobId: string) => ({
      data: {
        data: {
          id: workspaceId,
          type: "workspace",
          attributes: { name: workspaceId, source: "https://github.com/example/repo.git", branch: "main" },
          relationships: { organization: { data: { id: "org-1" } } },
        },
        included: [
          { id: "org-1", type: "organization", attributes: { name: "test-org" } },
          {
            id: jobId,
            type: "job",
            attributes: { status: "completed", createdBy: "someone", createdDate: "2026-10-19T10:00:00Z", via: "UI" },
          },
          {
            id: `h-${workspaceId}`,
            type: "history",
            attributes: { jobReference: jobId, output: `http://state/${workspaceId}.json` },
          },
        ],
      },
    });
    let resolveFirstGlobalVars: (value: MockResponse) => void = () => {};
    let globalVarCalls = 0;
    auxiliaryGetMock.mockResolvedValue({ data: { values: { outputs: { url: { type: "string", value: "x" } } } } });
    getMock.mockImplementation((url: string) => {
      if (url.includes("/access-token/")) {
        return Promise.resolve({ data: { manageState: true, manageWorkspace: true, planJob: true, approveJob: true } });
      }
      if (url.includes("/globalvar?")) {
        globalVarCalls += 1;
        return globalVarCalls === 1
          ? new Promise((resolve) => {
              resolveFirstGlobalVars = resolve;
            })
          : Promise.resolve({ data: { data: [] } });
      }
      const workspace = url.match(/^organization\/org-1\/workspace\/(ws-[ab])/);
      if (workspace) {
        return Promise.resolve(workspaceResponse(workspace[1], workspace[1] === "ws-a" ? "7" : "9"));
      }
      return Promise.resolve({ data: { data: [] } });
    });
    let navigate: NavigateFunction = () => {};
    const Navigator = () => {
      navigate = useNavigate();
      return null;
    };
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-a"]}>
        <Navigator />
        <Routes>
          <Route
            path="/organizations/:orgid/workspaces/:id"
            element={
              <WorkspaceDetails setOrganizationName={jest.fn()} setWorkspaceManageState={jest.fn()} selectedTab="4" />
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(globalVarCalls).toBe(1));

    await act(async () => {
      navigate("/organizations/org-1/workspaces/ws-b");
    });
    await waitFor(() => expect(auxiliaryGetMock).toHaveBeenCalledWith("http://state/ws-b.json", expect.anything()));

    await act(async () => {
      resolveFirstGlobalVars({ data: { data: [] } });
    });
    expect(auxiliaryGetMock).not.toHaveBeenCalledWith("http://state/ws-a.json", expect.anything());
  });

  it("off the Variables tab, loads neither workspace variables nor global and collection variables", async () => {
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const workspaceRequests = () => requestedUrls().filter((url) => url.includes("/workspace/ws-1?include="));
    const sourceRequests = () =>
      requestedUrls().filter((url) => url.includes("/globalvar") || url.startsWith("reference/"));
    renderDetails("1");
    await screen.findByRole("article", { name: "Latest run" });

    const pollCalls = jest.mocked(usePolling).mock.calls;
    await act(async () => {
      pollCalls[pollCalls.length - 1][0]();
    });
    await waitFor(() => expect(workspaceRequests()).toHaveLength(2));
    await act(async () => {});

    expect(sourceRequests()).toEqual([]);
    workspaceRequests().forEach((url) => {
      const include = new URLSearchParams(url.split("?")[1]).get("include")?.split(",");
      expect(include).toEqual(expect.arrayContaining(["job", "history", "vcs", "organization", "project"]));
      expect(include).not.toEqual(expect.arrayContaining(["variable"]));
      expect(include).not.toEqual(expect.arrayContaining(["reference"]));
    });
  });

  describe("switching tabs without a remount", () => {
    const renderTab = (selectedTab: string, settingsSection?: string) => (
      <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-1"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/workspaces/:id"
            element={
              <WorkspaceDetails
                setOrganizationName={jest.fn()}
                setWorkspaceManageState={jest.fn()}
                selectedTab={selectedTab}
                settingsSection={settingsSection}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const count = (match: (url: string) => boolean) => requestedUrls().filter(match).length;
    const workspaceLoads = () => count((url) => url.startsWith("organization/org-1/workspace/ws-1?include="));
    const permissionLoads = () => count((url) => url.includes("/access-token/v1/teams/permissions/"));
    const globalvarLoads = () => count((url) => url.includes("/globalvar?"));
    const templateLoads = () => count((url) => url.startsWith("organization/org-1/template?"));
    const actionLoads = () => count((url) => url.startsWith("action?"));

    const renderLoadedOverview = async () => {
      mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
      const view = render(renderTab("1"));
      await screen.findByRole("article", { name: "Latest run" });
      return view;
    };

    it("revalidates the workspace, permissions, templates and actions on each tab", async () => {
      const { rerender } = await renderLoadedOverview();

      expect(actionLoads()).toBe(1);
      expect(templateLoads()).toBe(1);

      rerender(renderTab("2"));
      await waitFor(() => expect(workspaceLoads()).toBe(2));
      await waitFor(() => expect(permissionLoads()).toBe(2));
      expect(actionLoads()).toBe(2);
      expect(templateLoads()).toBe(2);

      rerender(renderTab("6", "locking"));
      await waitFor(() => expect(workspaceLoads()).toBe(3));
      await waitFor(() => expect(permissionLoads()).toBe(3));
      await act(async () => {});

      expect(templateLoads()).toBe(3);
      expect(globalvarLoads()).toBe(0);
    });

    it("loads global and collection variables each time the Variables tab is entered", async () => {
      const { rerender } = await renderLoadedOverview();
      expect(globalvarLoads()).toBe(0);

      rerender(renderTab("4"));
      await waitFor(() => expect(globalvarLoads()).toBe(1));

      rerender(renderTab("1"));
      await waitFor(() => expect(workspaceLoads()).toBe(3));
      rerender(renderTab("4"));
      await waitFor(() => expect(globalvarLoads()).toBe(2));
    });

    const includesOf = (url: string) => new URLSearchParams(url.split("?")[1]).get("include")?.split(",") ?? [];
    const workspaceUrls = () =>
      requestedUrls().filter((url) => url.startsWith("organization/org-1/workspace/ws-1?include="));

    it("keeps the loaded runs on screen while a tab without them loads, and while they revalidate", async () => {
      const { rerender } = await renderLoadedOverview();

      rerender(renderTab("4"));
      await waitFor(() => expect(workspaceLoads()).toBe(2));
      expect(includesOf(workspaceUrls()[1])).not.toContain("job");
      await waitFor(() => expect(globalvarLoads()).toBe(1));
      await act(async () => {});

      const workspaceGet = currentGet();
      getMock.mockImplementation((url: string) =>
        url.startsWith("organization/org-1/workspace/ws-1?include=") ? new Promise(() => {}) : workspaceGet(url)
      );
      rerender(renderTab("1"));
      await waitFor(() => expect(workspaceLoads()).toBe(3));
      expect(includesOf(workspaceUrls()[2])).toContain("job");
      expect(screen.getByRole("article", { name: "Latest run" })).toHaveTextContent("#1");
    });

    it("shows the runs as loading, not empty, on entering the Overview from a tab that skipped them", async () => {
      mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
      const workspaceGet = currentGet();
      const responses: Array<() => void> = [];
      getMock.mockImplementation((url: string) =>
        url.startsWith("organization/org-1/workspace/ws-1?include=") && includesOf(url).includes("job")
          ? new Promise((resolve) => responses.push(() => resolve(workspaceGet(url))))
          : workspaceGet(url)
      );
      const { rerender, container } = render(renderTab("4"));
      await waitFor(() => expect(globalvarLoads()).toBe(1));
      await act(async () => {});

      rerender(renderTab("1"));
      await waitFor(() => expect(responses).toHaveLength(1));
      expect(screen.queryByText(/No runs yet/)).not.toBeInTheDocument();
      expect(screen.queryByRole("article", { name: "Latest run" })).not.toBeInTheDocument();
      expect(screen.queryByText("View all runs")).not.toBeInTheDocument();
      expect(container.querySelector(".loading-fallback-container")).toBeInTheDocument();

      await act(async () => {
        responses[0]();
      });
      expect(await screen.findByRole("article", { name: "Latest run" })).toHaveTextContent("#1");
    });

    it("shows the run list as loading, not as zero runs, until the jobs arrive", async () => {
      mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
      const workspaceGet = currentGet();
      const responses: Array<() => void> = [];
      getMock.mockImplementation((url: string) =>
        url.startsWith("organization/org-1/workspace/ws-1?include=") && includesOf(url).includes("job")
          ? new Promise((resolve) => responses.push(() => resolve(workspaceGet(url))))
          : workspaceGet(url)
      );
      const { rerender, container } = render(renderTab("3"));
      await waitFor(() => expect(workspaceLoads()).toBe(1));
      await act(async () => {});

      rerender(renderTab("2"));
      await waitFor(() => expect(responses).toHaveLength(1));
      expect(screen.queryByRole("heading", { name: /^Runs \(/ })).not.toBeInTheDocument();
      expect(container.querySelector(".loading-fallback-container")).toBeInTheDocument();

      await act(async () => {
        responses[0]();
      });
      expect(await screen.findByRole("heading", { name: "Runs (1)" })).toBeInTheDocument();
    });

    it("loads the queued follow-up for the tab that is open when it starts", async () => {
      mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
      const workspaceGet = currentGet();
      const responses: Array<() => void> = [];
      getMock.mockImplementation((url: string) =>
        url.startsWith("organization/org-1/workspace/ws-1?include=")
          ? new Promise((resolve) => responses.push(() => resolve(workspaceGet(url))))
          : workspaceGet(url)
      );
      const { rerender } = render(renderTab("1"));
      await waitFor(() => expect(responses).toHaveLength(1));
      responses[0]();
      await screen.findByRole("article", { name: "Latest run" });

      const pollCalls = jest.mocked(usePolling).mock.calls;
      await act(async () => {
        pollCalls[pollCalls.length - 1][0]();
      });
      await waitFor(() => expect(responses).toHaveLength(2));
      expect(includesOf(workspaceUrls()[1])).toContain("job");

      rerender(renderTab("4"));
      await act(async () => {});
      expect(responses).toHaveLength(2);

      await act(async () => {
        responses[1]();
      });
      await waitFor(() => expect(responses).toHaveLength(3));
      expect(includesOf(workspaceUrls()[2])).toEqual(expect.arrayContaining(["variable"]));
      expect(includesOf(workspaceUrls()[2])).not.toContain("job");

      await act(async () => {
        responses[2]();
      });
      await act(async () => {
        jest.mocked(usePolling).mock.calls[jest.mocked(usePolling).mock.calls.length - 1][0]();
      });
      await waitFor(() => expect(responses).toHaveLength(4));
      expect(includesOf(workspaceUrls()[3])).toContain("variable");
      expect(includesOf(workspaceUrls()[3])).not.toContain("job");
    });
  });

  it("on the Variables tab, loads global and collection variables again on every poll and on a Variables reload", async () => {
    mockWorkspaceWithRuns([]);
    const sourceRequests = () => requestedUrls().filter((url) => url.includes("/globalvar"));
    const workspaceRequests = () => requestedUrls().filter((url) => url.includes("/workspace/ws-1?include="));
    renderDetails("4");
    await waitFor(() => expect(sourceRequests()).toHaveLength(1));
    await waitFor(() => expect(mockVariablesProps.reload).toBeDefined());

    const pollCalls = jest.mocked(usePolling).mock.calls;
    await act(async () => {
      pollCalls[pollCalls.length - 1][0]();
    });
    await waitFor(() => expect(workspaceRequests()).toHaveLength(2));
    await waitFor(() => expect(sourceRequests()).toHaveLength(2));

    await act(async () => {
      defined(mockVariablesProps.reload, "the Variables reload")();
    });
    await waitFor(() => expect(sourceRequests()).toHaveLength(3));
  });

  it("skips the job list while a run is open, and loads it on going back to the list", async () => {
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const includes = () =>
      requestedUrls()
        .filter((url) => url.startsWith("organization/org-1/workspace/ws-1?include="))
        .map((url) => new URLSearchParams(url.split("?")[1]).get("include")?.split(",") ?? []);
    let navigate: NavigateFunction = () => {};
    const Navigator = () => {
      navigate = useNavigate();
      return null;
    };
    const details = (
      <WorkspaceDetails setOrganizationName={jest.fn()} setWorkspaceManageState={jest.fn()} selectedTab="2" />
    );
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-1/runs/1"]}>
        <Navigator />
        <Routes>
          <Route path="/organizations/:orgid/workspaces/:id/runs/:runid" element={details} />
          <Route path="/organizations/:orgid/workspaces/:id/runs" element={details} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Run details")).toBeInTheDocument();
    expect(includes()).toHaveLength(1);
    expect(includes()[0]).not.toContain("job");

    await act(async () => {
      navigate("/organizations/org-1/workspaces/ws-1/runs");
    });
    expect(await screen.findByRole("heading", { name: "Runs (1)" })).toBeInTheDocument();
    expect(includes()).toHaveLength(2);
    expect(includes()[1]).toContain("job");
  });

  describe("templates opened in Run now", () => {
    const plan = { id: "t-plan", type: "template", attributes: { name: "Plan", description: "Plan only" } };
    const apply = { id: "t-apply", type: "template", attributes: { name: "Plan and Apply", description: "Apply" } };

    const renderWithTemplates = (secondTemplates: () => Promise<MockResponse>) => {
      mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
      const workspaceGet = currentGet();
      let templateCalls = 0;
      getMock.mockImplementation((url: string) => {
        if (url.startsWith("organization/org-1/template?")) {
          templateCalls += 1;
          return templateCalls === 1 ? Promise.resolve({ data: { data: [plan] } }) : secondTemplates();
        }
        if (url.includes("/access-token/")) {
          return Promise.resolve({
            data: { manageState: true, manageWorkspace: true, planJob: true, approveJob: true },
          });
        }
        if (url.includes("fields[workspace]=branch,defaultTemplate")) {
          return Promise.resolve({ data: { data: { attributes: { branch: "main", defaultTemplate: "t-plan" } } } });
        }
        return workspaceGet(url);
      });
      renderDetails();
    };
    const openRunNow = async () => {
      const runNow = await screen.findByRole("button", { name: /run now/i });
      await waitFor(() => expect(runNow).toBeEnabled());
      await act(async () => {
        runNow.click();
      });
    };

    it("fetches the templates again, showing one another user just added", async () => {
      renderWithTemplates(() => Promise.resolve({ data: { data: [plan, apply] } }));
      await openRunNow();

      expect(await screen.findByRole("radio", { name: /^Plan and Apply/ })).toBeInTheDocument();
      expect(requestedUrls().filter((url) => url.startsWith("organization/org-1/template?"))).toHaveLength(2);
    });

    it("keeps the templates it has when the refresh fails", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      renderWithTemplates(() => Promise.reject(new Error("offline")));
      await openRunNow();
      await waitFor(() =>
        expect(requestedUrls().filter((url) => url.startsWith("organization/org-1/template?"))).toHaveLength(2)
      );
      await act(async () => {});

      expect(screen.getByRole("radio", { name: /^Plan Plan only/ })).toBeInTheDocument();
      consoleError.mockRestore();
    });
  });

  it("fetches templates once, without holding back the workspace request", async () => {
    let resolveTemplates: (value: MockResponse) => void = () => {};
    const templatesResponse = new Promise<MockResponse>((resolve) => {
      resolveTemplates = resolve;
    });
    mockWorkspaceWithRuns([{ id: "1", status: "completed" }]);
    const workspaceGet = currentGet();
    getMock.mockImplementation((url: string) =>
      url.startsWith("organization/org-1/template?") ? templatesResponse : workspaceGet(url)
    );
    renderDetails();

    const card = await screen.findByRole("article", { name: "Latest run" });
    expect(card).toHaveTextContent("Template—");

    resolveTemplates({ data: { data: [{ id: "tpl-1", attributes: { name: "Plan and Apply" } }] } });
    await waitFor(() => expect(card).toHaveTextContent("TemplatePlan and Apply"));
    expect(requestedUrls().filter((url) => url.startsWith("organization/org-1/template?"))).toHaveLength(1);
  });

  it("names schedules from templates that arrive after the workspace", async () => {
    let resolveTemplates: (value: MockResponse) => void = () => {};
    const templatesResponse = new Promise<MockResponse>((resolve) => {
      resolveTemplates = resolve;
    });
    const templateList = { data: { data: [{ id: "tpl-1", attributes: { name: "Plan and Apply" } }] } };
    let templateCalls = 0;
    getMock.mockImplementation((url: string) => {
      if (url.startsWith("organization/org-1/workspace/ws-1")) {
        return Promise.resolve({
          data: {
            data: {
              id: "ws-1",
              type: "workspace",
              attributes: { name: "sample-workspace", source: "https://github.com/example/repo.git", branch: "main" },
              relationships: { organization: { data: { id: "org-1" } } },
            },
            included: [
              { id: "sched-1", type: "schedule", attributes: { cron: "0 0 * * *", templateReference: "tpl-1" } },
            ],
          },
        });
      }
      if (url.startsWith("organization/org-1/template?")) {
        templateCalls += 1;
        // Later calls come from the Schedules tab, which loads its own copy for the edit form.
        return templateCalls === 1 ? templatesResponse : Promise.resolve(templateList);
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderDetails("5");

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(
        expect.stringMatching(/^organization\/org-1\/workspace\/ws-1\?/),
        expect.anything()
      )
    );
    expect(screen.queryByRole("cell", { name: "Plan and Apply" })).not.toBeInTheDocument();
    resolveTemplates(templateList);
    expect(await screen.findByRole("cell", { name: "Plan and Apply" })).toBeInTheDocument();
  });

  it("shows the newest run as the latest run when every run is finished", async () => {
    await renderOverviewWithRuns([
      { id: "1", status: "failed" },
      { id: "2", status: "completed" },
    ]);

    const card = await screen.findByRole("article", { name: "Latest run" });
    expect(card).toHaveTextContent("#2");
    expect(screen.getByRole("heading", { name: "Latest run" })).toBeInTheDocument();
  });
});
