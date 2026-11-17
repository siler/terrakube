import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WorkspaceGeneral } from "../General";
import type { WorkspacePageRow } from "../../workspaceQuery";
import { workspacePageRow } from "@/testUtils/workspacePageRow";
import { recordOf } from "@/testUtils/readRequestBody";

type MockResponse = { status?: number; data?: unknown };

const mockGet = jest.fn<Promise<MockResponse>, [url: string, config?: unknown]>();
const mockPost = jest.fn<Promise<MockResponse>, [url: string, body?: unknown, config?: unknown]>();
const mockPatch = jest.fn<Promise<MockResponse>, [url: string, body?: unknown, config?: unknown]>();
const mockDelete = jest.fn<Promise<MockResponse>, [url: string, config?: unknown]>();

jest.mock("../../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: Parameters<typeof mockGet>) => mockGet(...args),
    post: (...args: Parameters<typeof mockPost>) => mockPost(...args),
    patch: (...args: Parameters<typeof mockPatch>) => mockPatch(...args),
    delete: (...args: Parameters<typeof mockDelete>) => mockDelete(...args),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message ? err.message : "Error"),
}));
jest.mock("@/modules/projects/projectService", () => ({
  __esModule: true,
  default: { listProjects: jest.fn(() => Promise.resolve({ isError: false, data: [] })) },
}));
let mockOrgPermissions = { manageVcs: false, manageWorkspace: true };
jest.mock("@/modules/permissions/useOrgPermissions", () => ({
  useOrgPermissions: () => ({ permissions: mockOrgPermissions }),
}));

const REPO = "https://github.com/acme/infra.git";

const workspace = (source: string, related: Partial<WorkspacePageRow> = {}): WorkspacePageRow =>
  workspacePageRow({
    id: "ws-1",
    name: "prod",
    source,
    branch: "main",
    iacType: "terraform",
    terraformVersion: "1.9.0",
    restrictApplyToConfiguredBranch: false,
    requireApproveToApply: false,
    organization: { id: "org-1", name: "acme" },
    vcs: { id: "vcs-1", vcsType: "GITHUB" },
    ...related,
  });

const renderGeneral = (ws: WorkspacePageRow, onWorkspaceUpdate = jest.fn()) =>
  render(
    <MemoryRouter>
      <WorkspaceGeneral
        organizationId="org-1"
        workspaceData={ws}
        orgTemplates={[]}
        manageWorkspace
        onWorkspaceUpdate={onWorkspaceUpdate}
      />
    </MemoryRouter>
  );

const changeRepoAndSave = async (url: string) => {
  fireEvent.change(await screen.findByLabelText("Repository URL"), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
};

/** The workspace attributes the first atomic operations request sent. */
const savedAttributes = (): Record<string, unknown> => {
  const operations = recordOf(mockPost.mock.calls[0]?.[1])["atomic:operations"];
  if (!Array.isArray(operations)) {
    throw new Error(`Expected atomic operations, got ${JSON.stringify(operations)}`);
  }
  const operation: unknown = operations[0];
  return recordOf(recordOf(recordOf(operation).data).attributes);
};

const savedSource = () => savedAttributes().source;

const getUrls = () => mockGet.mock.calls.map(([url]) => url);

beforeAll(() => {
  window._env_ = { ...window._env_, REACT_APP_TERRAKUBE_API_URL: "http://localhost/api" };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgPermissions = { manageVcs: false, manageWorkspace: true };
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: url.endsWith("index.json") ? { versions: { "1.9.0": {} } } : { data: [] } })
  );
  mockPost.mockResolvedValue({ status: 200 });
  mockPatch.mockResolvedValue({ status: 204 });
  mockDelete.mockResolvedValue({ status: 204 });
});

describe("WorkspaceGeneral repository URL", () => {
  it("saves a new repository URL without a confirmation when there is no webhook", async () => {
    renderGeneral(workspace(REPO));

    await changeRepoAndSave("git@gitlab.com:acme/infra.git");

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedSource()).toBe("git@gitlab.com:acme/infra.git");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("trims a new repository URL before saving", async () => {
    renderGeneral(workspace(REPO));

    await changeRepoAndSave("  https://gitlab.com/acme/infra.git  ");

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedSource()).toBe("https://gitlab.com/acme/infra.git");
  });

  it("does not delete the webhook when only repository URL whitespace changes", async () => {
    renderGeneral(workspace(REPO, { webhook: { id: "hook-1" } }));

    await changeRepoAndSave(`  ${REPO}  `);

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedSource()).toBe(REPO);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Saving deletes it/)).not.toBeInTheDocument();
  });

  it.each(["request rejection", "unsuccessful response"])(
    "refreshes the deleted webhook and explains an update failure: %s",
    async (failure) => {
      const onWorkspaceUpdate = jest.fn();
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      if (failure === "request rejection") {
        mockPost.mockRejectedValue(new Error("Update unavailable"));
      } else {
        mockPost.mockResolvedValue({ status: 500 });
      }
      renderGeneral(workspace(REPO, { webhook: { id: "hook-1" } }), onWorkspaceUpdate);

      try {
        await changeRepoAndSave("https://gitlab.com/acme/infra.git");
        fireEvent.click(await screen.findByRole("button", { name: "Delete webhook and save" }));

        expect(await screen.findByText(/Workspace update failed after the webhook was deleted/)).toBeInTheDocument();
        expect(onWorkspaceUpdate).toHaveBeenCalledTimes(1);
        expect(onWorkspaceUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockPost.mock.invocationCallOrder[0]);
      } finally {
        consoleError.mockRestore();
      }
    }
  );

  it("deletes the webhook before pointing the workspace at another repository", async () => {
    renderGeneral(workspace(REPO, { webhook: { id: "hook-1" } }));

    await changeRepoAndSave("https://gitlab.com/acme/infra.git");

    expect(await screen.findByText(/Saving deletes it/)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete webhook and save" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockDelete).toHaveBeenCalledWith("organization/org-1/workspace/ws-1/webhook/hook-1", expect.anything());
    // The API removes the remote hook using the workspace's current repository, so the delete must land first.
    expect(mockDelete.mock.invocationCallOrder[0]).toBeLessThan(mockPost.mock.invocationCallOrder[0]);
    expect(savedSource()).toBe("https://gitlab.com/acme/infra.git");
  });

  it("leaves the workspace unchanged when the webhook cannot be deleted", async () => {
    mockDelete.mockRejectedValue(new Error("424"));
    renderGeneral(workspace(REPO, { webhook: { id: "hook-1" } }));

    await changeRepoAndSave("https://gitlab.com/acme/infra.git");
    fireEvent.click(await screen.findByRole("button", { name: "Delete webhook and save" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("retries the update when an earlier save already deleted the webhook", async () => {
    mockDelete.mockRejectedValue({ response: { status: 404 } });
    renderGeneral(workspace(REPO, { webhook: { id: "hook-1" } }));

    await changeRepoAndSave("https://gitlab.com/acme/infra.git");
    fireEvent.click(await screen.findByRole("button", { name: "Delete webhook and save" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedSource()).toBe("https://gitlab.com/acme/infra.git");
  });

  it("also deletes the webhook when only the VCS provider changes", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith("index.json")
          ? { versions: { "1.9.0": {} } }
          : url.includes("/vcs?")
            ? { data: [{ id: "vcs-2", attributes: { name: "GitLab", vcsType: "GITLAB" } }] }
            : { data: [] },
      })
    );
    renderGeneral(workspace(REPO, { webhook: { id: "hook-1" } }));

    fireEvent.mouseDown(await screen.findByLabelText("VCS provider"));

    // The order Promise.all loads the settings form's option lists in.
    expect(getUrls()).toEqual([
      expect.stringContaining("index.json"),
      "organization/org-1/agent?fields[agent]=name",
      "organization/org-1/vcs?fields[vcs]=name,vcsType",
    ]);

    fireEvent.click(await screen.findByText("GitLab"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete webhook and save" }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/organization/org-1/workspace/ws-1/relationships/vcs",
        { data: { type: "vcs", id: "vcs-2" } },
        expect.anything()
      )
    );
    expect(mockDelete).toHaveBeenCalledWith("organization/org-1/workspace/ws-1/webhook/hook-1", expect.anything());
  });

  it("does not accept the CLI-driven marker as a repository", async () => {
    renderGeneral(workspace(REPO));

    await changeRepoAndSave("empty");

    expect(await screen.findByText("Enter a Git URL.")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("hides the field for CLI-driven workspaces and does not send a source", async () => {
    renderGeneral(workspace("empty"));

    expect(await screen.findByLabelText("VCS provider")).toBeInTheDocument();
    expect(screen.queryByLabelText("Repository URL")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedSource()).toBeUndefined();
  });
});

describe("WorkspaceGeneral branch restriction", () => {
  it("saves the setting with the workspace for an organization manager", async () => {
    renderGeneral(workspace(REPO));

    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Only run apply and destroy from the default branch/ })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedAttributes().restrictApplyToConfiguredBranch).toBe(true);
  });

  it("shows the saved value", async () => {
    const restricted = workspace(REPO);
    restricted.restrictApplyToConfiguredBranch = true;
    renderGeneral(restricted);

    expect(
      await screen.findByRole("checkbox", { name: /Only run apply and destroy from the default branch/ })
    ).toBeChecked();
  });

  it("is read-only and not sent for a manager limited to the workspace", async () => {
    mockOrgPermissions = { manageVcs: false, manageWorkspace: false };
    renderGeneral(workspace(REPO));

    expect(
      await screen.findByRole("checkbox", { name: /Only run apply and destroy from the default branch/ })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedAttributes()).not.toHaveProperty("restrictApplyToConfiguredBranch");
  });

  it("is disabled with an explanation on a CLI-driven workspace, which has no branch to restrict", async () => {
    renderGeneral(workspace("empty", { vcs: null }));

    expect(
      await screen.findByRole("checkbox", { name: /Only run apply and destroy from the default branch/ })
    ).toBeDisabled();
    expect(screen.getByText(/This workspace is CLI-driven/)).toBeInTheDocument();
  });

  it("hides the setting and does not send it to a Terrakube that does not report it", async () => {
    const older = workspace(REPO);
    // Older Terrakube versions omit the attribute, which the row type cannot express.
    Reflect.deleteProperty(older, "restrictApplyToConfiguredBranch");
    renderGeneral(older);

    await screen.findByLabelText("Repository URL");
    expect(
      screen.queryByRole("checkbox", { name: /Only run apply and destroy from the default branch/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedAttributes()).not.toHaveProperty("restrictApplyToConfiguredBranch");
  });
});

describe("WorkspaceGeneral approve rule", () => {
  const name = /Require the approve permission to start an apply with no approval step/;

  it("saves the setting with the workspace for an organization manager", async () => {
    renderGeneral(workspace(REPO));

    fireEvent.click(await screen.findByRole("checkbox", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedAttributes().requireApproveToApply).toBe(true);
  });

  it("is read-only and not sent for a manager limited to the workspace", async () => {
    mockOrgPermissions = { manageVcs: false, manageWorkspace: false };
    renderGeneral(workspace(REPO));

    expect(await screen.findByRole("checkbox", { name })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedAttributes()).not.toHaveProperty("requireApproveToApply");
  });

  it("is hidden and not sent to a Terrakube that does not report it", async () => {
    const older = workspace(REPO);
    // Older Terrakube versions omit the attribute, which the row type cannot express.
    Reflect.deleteProperty(older, "requireApproveToApply");
    renderGeneral(older);

    await screen.findByRole("button", { name: "Save settings" });
    expect(screen.queryByRole("checkbox", { name })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(savedAttributes()).not.toHaveProperty("requireApproveToApply");
  });
});
