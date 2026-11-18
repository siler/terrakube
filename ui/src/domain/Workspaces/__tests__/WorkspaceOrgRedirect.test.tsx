import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { recordOf } from "@/testUtils/readRequestBody";
import { WorkspaceOrgRedirect, organizationWorkspacePath } from "../WorkspaceOrgRedirect";

const mockPost = jest.fn<Promise<unknown>, [url: string, body: unknown, config?: unknown]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  axiosGraphQL: { post: (...args: Parameters<typeof mockPost>) => mockPost(...args) },
  default: {},
  getErrorMessage: () => "error",
}));

const organizations = (...nodes: { id: string; workspaceIds: string[] }[]) => ({
  data: {
    data: {
      organization: {
        edges: nodes.map(({ id, workspaceIds }) => ({
          node: { id, workspace: { edges: workspaceIds.map((wsId) => ({ node: { id: wsId } })) } },
        })),
      },
    },
  },
});

const Landed = () => {
  const location = useLocation();
  return <p>landed {`${location.pathname}${location.search}`}</p>;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workspaces/:id/*" element={<WorkspaceOrgRedirect />} />
        <Route path="/organizations/*" element={<Landed />} />
      </Routes>
    </MemoryRouter>
  );

describe("WorkspaceOrgRedirect", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("redirects to the same page under the workspace's organization", async () => {
    mockPost.mockResolvedValueOnce(
      organizations({ id: "org-a", workspaceIds: [] }, { id: "org-b", workspaceIds: ["ws-1"] })
    );

    renderAt("/workspaces/ws-1/runs/42?tab=log");

    expect(await screen.findByText("landed /organizations/org-b/workspaces/ws-1/runs/42?tab=log")).toBeInTheDocument();
    const [, body] = mockPost.mock.calls[0];
    expect(recordOf(body).variables).toEqual({ orgFilter: "id=isnull=false", wsFilter: "id=='ws-1'" });
  });

  it("says the workspace is unavailable when no organization holds it", async () => {
    mockPost.mockResolvedValueOnce(organizations({ id: "org-a", workspaceIds: [] }));

    renderAt("/workspaces/ws-1");

    expect(await screen.findByText("Not Authorized")).toBeInTheDocument();
  });

  it("says the workspace is unavailable when the lookup fails", async () => {
    mockPost.mockRejectedValueOnce(new Error("boom"));

    renderAt("/workspaces/ws-1/settings");

    await waitFor(() => expect(screen.getByText("Not Authorized")).toBeInTheDocument());
  });

  it("rewrites only the leading workspaces segment", () => {
    expect(organizationWorkspacePath("/workspaces/ws-1/settings/general", "org-1")).toBe(
      "/organizations/org-1/workspaces/ws-1/settings/general"
    );
  });
});
