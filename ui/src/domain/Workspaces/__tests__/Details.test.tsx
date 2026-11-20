import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, NavigateFunction, Route, Routes, useNavigate } from "react-router-dom";
import { WorkspaceDetails } from "../Details";
import { LOAD_DEADLINE_MS } from "../../../hooks/useCoalescedReload";

window._env_ = {
  REACT_APP_AUTHORITY: "http://localhost/authority",
  REACT_APP_CLIENT_ID: "client-id",
  REACT_APP_REDIRECT_URI: "http://localhost/redirect",
  REACT_APP_SCOPE: "openid",
  REACT_APP_TERRAKUBE_API_URL: "http://localhost:8080/api/v1",
  REACT_APP_TERRAKUBE_VERSION: "test",
  REACT_APP_REGISTRY_URI: "http://localhost:8080/registry",
};

const getMock = jest.fn();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => getMock(...args),
  },
  getErrorMessage: (err: any) => err?.message || "Error",
}));

// Details.tsx imports from '../../types.js' and '../Icons.jsx' with file extensions.
// Virtual mocks allow Jest to resolve these ESM extension imports in the test environment
// without requiring edits to untouched shared source files.
jest.mock("../../types.js", () => jest.requireActual("../../types"), { virtual: true });
jest.mock("../Icons.jsx", () => jest.requireActual("../Icons"), { virtual: true });
jest.mock("../ResourceDrawer", () => ({ ResourceDrawer: () => null }));

jest.mock("../../Jobs/Details", () => ({
  DetailsJob: ({ jobId }: { jobId: string }) => <p>{`run ${jobId}`}</p>,
}));

const mockSubscriptions: { poll?: () => void; jobEvent?: () => void } = {};
jest.mock("../../../hooks", () => ({
  usePolling: (callback: () => void) => {
    mockSubscriptions.poll = callback;
  },
  useJobStatusSubscription: ({ onEvent }: { onEvent: () => void }) => {
    mockSubscriptions.jobEvent = onEvent;
  },
  useCoalescedReload: jest.requireActual("../../../hooks/useCoalescedReload").useCoalescedReload,
}));

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

  const renderOverviewWithRuns = async (runs: Array<{ id: string; status: string }>) => {
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
              relationships: { organization: { data: { id: "org-1" } } },
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
                },
              })),
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

  it("shows the newest run as the latest run when every run is finished", async () => {
    await renderOverviewWithRuns([
      { id: "1", status: "failed" },
      { id: "2", status: "completed" },
    ]);

    const card = await screen.findByRole("article", { name: "Latest run" });
    expect(card).toHaveTextContent("#2");
    expect(screen.getByRole("heading", { name: "Latest run" })).toBeInTheDocument();
  });

  describe("permissions, templates and actions", () => {
    const workspaceResponse = (included: unknown[] = []) => ({
      data: {
        data: {
          id: "ws-1",
          type: "workspace",
          attributes: { name: "sample-workspace", source: "https://github.com/example/repo.git", branch: "main" },
          relationships: { organization: { data: { id: "org-1" } } },
        },
        included: [{ id: "org-1", type: "organization", attributes: { name: "test-org" } }, ...included],
      },
    });
    const templatesResponse = {
      data: { data: [{ id: "tpl-1", type: "template", attributes: { name: "Plan and apply" } }] },
    };
    const urls = () => getMock.mock.calls.map(([url]) => String(url));
    const count = (match: (url: string) => boolean) => urls().filter(match).length;
    const workspaceLoads = () => count((url) => url.startsWith("organization/org-1/workspace/ws-1?"));
    const permissionLoads = () => count((url) => url.includes("/access-token/v1/teams/permissions/"));
    const templateLoads = () => count((url) => url === "organization/org-1/template");
    const actionLoads = () => count((url) => url === "action");

    const page = (selectedTab: string, settingsSection?: string) => (
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

    it("asks the workspace endpoint for permissions once and does not hold the workspace back for templates", async () => {
      getMock.mockImplementation((url: string) => {
        if (url === "organization/org-1/template") return new Promise(() => {});
        if (url.includes("/access-token/")) return Promise.resolve({ data: { manageState: true, planJob: true } });
        if (url.includes("/workspace/ws-1")) return Promise.resolve(workspaceResponse());
        return Promise.resolve({ data: { data: [] } });
      });
      render(page("1"));

      expect(await screen.findByText("Run now")).toBeInTheDocument();
      expect(urls().filter((url) => url.includes("/access-token/"))).toEqual([
        "http://localhost:8080/access-token/v1/teams/permissions/organization/org-1/workspace/ws-1",
      ]);
      expect(templateLoads()).toBe(1);
    });

    it("names schedules from templates that arrive after the workspace", async () => {
      let resolveTemplates: (value: unknown) => void = () => {};
      getMock.mockImplementation((url: string) => {
        if (url === "organization/org-1/template") {
          return new Promise((resolve) => {
            resolveTemplates = resolve;
          });
        }
        if (url.includes("/workspace/ws-1")) {
          return Promise.resolve(
            workspaceResponse([
              { id: "sch-1", type: "schedule", attributes: { cron: "0 * * * *", templateReference: "tpl-1" } },
            ])
          );
        }
        return Promise.resolve({ data: { data: [] } });
      });
      render(page("5"));

      expect(await screen.findByText("Loading...")).toBeInTheDocument();
      await act(async () => resolveTemplates(templatesResponse));
      expect(await screen.findByText("sch-1")).toBeInTheDocument();
      expect(screen.getByText("Plan and apply")).toBeInTheDocument();
    });

    it("revalidates permissions, templates and actions when a tab is entered, leaving the workspace to its poll", async () => {
      getMock.mockImplementation((url: string) => {
        if (url === "organization/org-1/template") return Promise.resolve(templatesResponse);
        if (url.includes("/access-token/")) return Promise.resolve({ data: { manageState: false } });
        if (url.includes("/workspace/ws-1")) return Promise.resolve(workspaceResponse());
        return Promise.resolve({ data: { data: [] } });
      });
      const { rerender } = render(page("1"));
      await waitFor(() => expect(actionLoads()).toBe(1));
      expect(permissionLoads()).toBe(1);
      expect(templateLoads()).toBe(1);

      rerender(page("4"));
      await waitFor(() => expect(actionLoads()).toBe(2));
      expect(permissionLoads()).toBe(2);
      expect(templateLoads()).toBe(2);

      rerender(page("6", "locking"));
      await waitFor(() => expect(actionLoads()).toBe(3));
      expect(permissionLoads()).toBe(3);
      expect(templateLoads()).toBe(3);
      expect(workspaceLoads()).toBe(1);
    });

    it("revalidates permissions, templates and actions when the run changes", async () => {
      getMock.mockImplementation((url: string) => {
        if (url === "organization/org-1/template") return Promise.resolve(templatesResponse);
        if (url.includes("/access-token/")) return Promise.resolve({ data: { manageState: false } });
        if (url.includes("/workspace/ws-1")) return Promise.resolve(workspaceResponse());
        return Promise.resolve({ data: { data: [] } });
      });
      let navigate: NavigateFunction = () => {};
      const CaptureNavigate = () => {
        const nav = useNavigate();
        useEffect(() => {
          navigate = nav;
        }, [nav]);
        return null;
      };
      const runs = (
        <WorkspaceDetails setOrganizationName={jest.fn()} setWorkspaceManageState={jest.fn()} selectedTab="2" />
      );
      render(
        <MemoryRouter initialEntries={["/organizations/org-1/workspaces/ws-1/runs/r1"]}>
          <CaptureNavigate />
          <Routes>
            <Route path="/organizations/:orgid/workspaces/:id/runs" element={runs} />
            <Route path="/organizations/:orgid/workspaces/:id/runs/:runid" element={runs} />
          </Routes>
        </MemoryRouter>
      );
      await waitFor(() => expect(actionLoads()).toBe(1));

      await act(() => navigate("/organizations/org-1/workspaces/ws-1/runs/r2"));
      await waitFor(() => expect(actionLoads()).toBe(2));
      expect(permissionLoads()).toBe(2);
      expect(templateLoads()).toBe(2);

      await act(() => navigate("/organizations/org-1/workspaces/ws-1/runs"));
      await waitFor(() => expect(actionLoads()).toBe(3));
      expect(permissionLoads()).toBe(3);
      expect(templateLoads()).toBe(3);
    });
  });

  describe("reloading the workspace", () => {
    const workspaceResponse = {
      data: {
        data: {
          id: "ws-1",
          type: "workspace",
          attributes: { name: "sample-workspace", source: "https://github.com/example/repo.git", branch: "main" },
          relationships: { organization: { data: { id: "org-1" } } },
        },
        included: [{ id: "org-1", type: "organization", attributes: { name: "test-org" } }],
      },
    };
    const workspaceRequests: Array<{ resolve: (value: unknown) => void; signal?: AbortSignal }> = [];
    const timeoutMessage = `timeout of ${LOAD_DEADLINE_MS}ms exceeded`;

    const renderPage = () => {
      workspaceRequests.length = 0;
      getMock.mockImplementation((url: string, config?: { signal?: AbortSignal }) => {
        if (url.startsWith("organization/org-1/workspace/ws-1?")) {
          return new Promise((resolve) => workspaceRequests.push({ resolve, signal: config?.signal }));
        }
        if (url.includes("/workspace/ws-1")) return Promise.resolve(workspaceResponse);
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
    };

    afterEach(() => jest.useRealTimers());

    it("keeps one workspace request in flight and folds the polls that overlap it into one more", async () => {
      renderPage();
      await waitFor(() => expect(workspaceRequests).toHaveLength(1));
      expect(workspaceRequests[0].signal).toBeInstanceOf(AbortSignal);

      act(() => {
        mockSubscriptions.poll?.();
        mockSubscriptions.poll?.();
        mockSubscriptions.poll?.();
      });
      expect(workspaceRequests).toHaveLength(1);

      await act(async () => workspaceRequests[0].resolve(workspaceResponse));
      await waitFor(() => expect(workspaceRequests).toHaveLength(2));
      await act(async () => workspaceRequests[1].resolve(workspaceResponse));
      expect(workspaceRequests).toHaveLength(2);
    });

    it("reloads right away on a job status event and folds the rest of a burst into one more load", async () => {
      renderPage();
      await waitFor(() => expect(workspaceRequests).toHaveLength(1));
      await act(async () => workspaceRequests[0].resolve(workspaceResponse));
      await screen.findByText("Run now");

      await act(async () => mockSubscriptions.jobEvent?.());
      expect(workspaceRequests).toHaveLength(2);
      await act(async () => {
        mockSubscriptions.jobEvent?.();
        mockSubscriptions.jobEvent?.();
      });
      expect(workspaceRequests).toHaveLength(2);

      await act(async () => workspaceRequests[1].resolve(workspaceResponse));
      await waitFor(() => expect(workspaceRequests).toHaveLength(3));
      await act(async () => workspaceRequests[2].resolve(workspaceResponse));
      expect(workspaceRequests).toHaveLength(3);
    });

    it("shows a timeout error when the first load passes the deadline, and clears it once a load succeeds", async () => {
      jest.useFakeTimers();
      renderPage();
      await waitFor(() => expect(workspaceRequests).toHaveLength(1));

      await act(async () => jest.advanceTimersByTime(LOAD_DEADLINE_MS));

      expect(await screen.findByText(timeoutMessage)).toBeInTheDocument();
      expect(workspaceRequests[0].signal?.aborted).toBe(true);

      await act(async () => mockSubscriptions.poll?.());
      expect(workspaceRequests).toHaveLength(2);
      await act(async () => workspaceRequests[1].resolve(workspaceResponse));

      expect(await screen.findByText("Run now")).toBeInTheDocument();
      expect(screen.queryByText(timeoutMessage)).not.toBeInTheDocument();
    });

    it("keeps the page on screen when a background reload passes the deadline", async () => {
      jest.useFakeTimers();
      renderPage();
      await waitFor(() => expect(workspaceRequests).toHaveLength(1));
      await act(async () => workspaceRequests[0].resolve(workspaceResponse));
      expect(await screen.findByText("Run now")).toBeInTheDocument();

      await act(async () => mockSubscriptions.poll?.());
      expect(workspaceRequests).toHaveLength(2);
      await act(async () => jest.advanceTimersByTime(LOAD_DEADLINE_MS));

      expect(workspaceRequests[1].signal?.aborted).toBe(true);
      expect(screen.queryByText(timeoutMessage)).not.toBeInTheDocument();
      expect(screen.getByText("Run now")).toBeInTheDocument();
    });
  });
});
