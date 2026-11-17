import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WorkspaceAdvanced } from "../Advanced";
import axiosInstance from "../../../../config/axiosConfig";
import { axiosResponse } from "@/testUtils/fakeAxiosResponse";
import { requestAttributes } from "@/testUtils/readRequestBody";
import { workspacePageRow } from "@/testUtils/workspacePageRow";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual<typeof import("react-router-dom")>("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { patch: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
}));

jest.mock("../../Workspaces", () => ({ genericHeader: {} }));

const workspace = workspacePageRow({
  id: "ws-1",
  name: "prod-cluster",
  organization: { id: "org-1", name: "acme" },
});
const patchMock = jest.mocked(axiosInstance.patch);

describe("WorkspaceAdvanced", () => {
  it("says resources keep running and soft-deletes after typing the name", async () => {
    patchMock.mockResolvedValue(axiosResponse({ status: 204 }));
    render(
      <MemoryRouter>
        <WorkspaceAdvanced organizationId="org-1" workspace={workspace} manageWorkspace={true} />
      </MemoryRouter>
    );

    expect(screen.getByText("Destruction and deletion")).toBeInTheDocument();
    expect(screen.getByText(/does not destroy any infrastructure/)).toBeInTheDocument();
    expect(screen.queryByText(/permanently/)).not.toBeInTheDocument();
    expect(screen.getByText(/state files and run outputs are deleted from storage/)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete this workspace" }));
    fireEvent.change(screen.getByLabelText("Type the name to confirm"), { target: { value: "prod-cluster" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete this workspace" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/organizations/org-1/workspaces"));
    expect(axiosInstance.patch).toHaveBeenCalledWith(
      "/organization/org-1/workspace/ws-1/relationships/vcs",
      { data: null },
      expect.anything()
    );
    const attributes = requestAttributes(patchMock.mock.calls[1][1]);
    expect(attributes.deleted).toBe(true);
    expect(attributes.name).toMatch(/^prod-cluster_DEL_/);
  });

  it("disables the action without manage permission", () => {
    render(
      <MemoryRouter>
        <WorkspaceAdvanced organizationId="org-1" workspace={workspace} manageWorkspace={false} />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Delete this workspace" })).toBeDisabled();
  });
});
