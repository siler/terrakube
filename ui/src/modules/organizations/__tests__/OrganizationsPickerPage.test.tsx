import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrganizationsPickerPage from "../OrganizationsPickerPage";
import organizationService from "../organizationService";
import { useOrganizationSummaries } from "../useOrganizationSummaries";
import { useOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import { orgPermissionsResult } from "@/testUtils/orgPermissions";

jest.mock("../useOrganizationSummaries");
jest.mock("../organizationService", () => ({
  __esModule: true,
  default: { listOrganizationWorkspaceCounts: jest.fn() },
}));
jest.mock("@/modules/permissions/useOrgPermissions");

const listOrganizationWorkspaceCounts = jest.mocked(organizationService.listOrganizationWorkspaceCounts);

const renderPicker = () =>
  render(
    <MemoryRouter initialEntries={["/organizations"]}>
      <OrganizationsPickerPage />
    </MemoryRouter>
  );

describe("OrganizationsPickerPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    listOrganizationWorkspaceCounts.mockReset();
    jest.mocked(useOrgPermissions).mockReturnValue(orgPermissionsResult({ managePermission: true }));
    jest.mocked(useOrganizationSummaries).mockReturnValue({
      organizations: [
        { id: "org-1", name: "acme" },
        { id: "org-2", name: "data" },
      ],
      loading: false,
      error: undefined,
      refresh: jest.fn(),
      upsertOrganization: jest.fn(),
      updateOrganization: jest.fn(),
      removeOrganization: jest.fn(),
    });
  });

  it("fetches workspace totals for the list and shows them on each row", async () => {
    listOrganizationWorkspaceCounts.mockResolvedValue({
      "org-1": { workspaceCount: 3, workspaceStatusCounts: { failed: 1 } },
      "org-2": { workspaceCount: 1, workspaceStatusCounts: {} },
    });

    renderPicker();

    expect(await screen.findByText("3 workspaces")).toBeInTheDocument();
    expect(screen.getByText("1 workspace")).toBeInTheDocument();
    expect(listOrganizationWorkspaceCounts).toHaveBeenCalledTimes(1);
  });

  it("lists the organizations without totals when they cannot be loaded", async () => {
    listOrganizationWorkspaceCounts.mockRejectedValue(new Error("Forbidden"));

    renderPicker();

    expect(screen.getByText("acme")).toBeInTheDocument();
    await waitFor(() => expect(listOrganizationWorkspaceCounts).toHaveBeenCalled());
    expect(screen.queryByText(/workspaces?$/)).not.toBeInTheDocument();
  });

  it("does not fetch totals for the card view, which does not show them", () => {
    localStorage.setItem("terrakube.listViewMode", "cards");

    renderPicker();

    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(listOrganizationWorkspaceCounts).not.toHaveBeenCalled();
  });
});
