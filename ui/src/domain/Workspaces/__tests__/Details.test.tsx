import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, NavigateFunction, Route, Routes, useNavigate } from "react-router-dom";
import { WorkspaceDetails } from "../Details";

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

const mockRunMounts: string[] = [];
jest.mock("../../Jobs/Details", () => ({
  DetailsJob: ({ jobId }: { jobId: string }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockRunMounts.push(jobId);
    }, []);
    return <p>{`run ${jobId}`}</p>;
  },
}));

jest.mock("../../../hooks", () => ({
  usePolling: jest.fn(),
  useJobStatusSubscription: jest.fn(),
}));

describe("WorkspaceDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockRunMounts.length = 0;
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

  describe("opening runs while the page stays mounted", () => {
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
    const workspaceLoads = () =>
      getMock.mock.calls.filter(([url]) => String(url).startsWith("organization/org-1/workspace/ws-1?")).length;

    let navigate: NavigateFunction;
    const CaptureNavigate = () => {
      const nav = useNavigate();
      useEffect(() => {
        navigate = nav;
      }, [nav]);
      return null;
    };

    const renderRuns = (initial: string) => {
      const page = (
        <WorkspaceDetails setOrganizationName={jest.fn()} setWorkspaceManageState={jest.fn()} selectedTab="2" />
      );
      render(
        <MemoryRouter initialEntries={[initial]}>
          <CaptureNavigate />
          <Routes>
            <Route path="/organizations/:orgid/workspaces/:id/runs" element={page} />
            <Route path="/organizations/:orgid/workspaces/:id/runs/:runid" element={page} />
          </Routes>
        </MemoryRouter>
      );
    };

    it("shows each run it opens with fresh run details and no workspace reload", async () => {
      getMock.mockImplementation((url: string) =>
        Promise.resolve(url.includes("/workspace/ws-1") ? workspaceResponse : { data: { data: [] } })
      );
      renderRuns("/organizations/org-1/workspaces/ws-1/runs/r1");
      expect(await screen.findByText("run r1")).toBeInTheDocument();

      await act(() => navigate("/organizations/org-1/workspaces/ws-1/runs/r2"));
      expect(await screen.findByText("run r2")).toBeInTheDocument();
      await act(() => navigate("/organizations/org-1/workspaces/ws-1/runs"));
      await waitFor(() => expect(screen.queryByText(/^run r/)).not.toBeInTheDocument());

      expect(mockRunMounts).toEqual(["r1", "r2"]);
      expect(workspaceLoads()).toBe(1);
    });

    it("keeps the run the URL names when the first workspace load lands after a run change", async () => {
      let resolveWorkspace: (value: unknown) => void = () => {};
      getMock.mockImplementation((url: string) =>
        url.startsWith("organization/org-1/workspace/ws-1?")
          ? new Promise((resolve) => {
              resolveWorkspace = resolve;
            })
          : Promise.resolve(url.includes("/workspace/ws-1") ? workspaceResponse : { data: { data: [] } })
      );
      renderRuns("/organizations/org-1/workspaces/ws-1/runs/r1");
      await waitFor(() => expect(workspaceLoads()).toBe(1));

      await act(() => navigate("/organizations/org-1/workspaces/ws-1/runs/r2"));
      await act(async () => resolveWorkspace(workspaceResponse));

      expect(await screen.findByText("run r2")).toBeInTheDocument();
      expect(screen.queryByText("run r1")).not.toBeInTheDocument();
    });
  });
});
