import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrgSettingsButton from "../OrgSettingsButton";
import { useOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import { orgPermissionsResult } from "@/testUtils/orgPermissions";

jest.mock("@/modules/permissions/useOrgPermissions");
const mockUseOrgPermissions = jest.mocked(useOrgPermissions);

function renderButton() {
  return render(
    <MemoryRouter>
      <OrgSettingsButton orgId="org-1" />
    </MemoryRouter>
  );
}

describe("OrgSettingsButton", () => {
  it("renders nothing while permissions are loading", () => {
    mockUseOrgPermissions.mockReturnValue(orgPermissionsResult({}, true));
    const { container } = renderButton();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the user lacks managePermission", () => {
    mockUseOrgPermissions.mockReturnValue(orgPermissionsResult({ managePermission: false }));
    const { container } = renderButton();
    expect(container.firstChild).toBeNull();
  });

  it("renders the settings icon button when the user has managePermission", () => {
    mockUseOrgPermissions.mockReturnValue(orgPermissionsResult({ managePermission: true }));
    renderButton();
    expect(screen.getByLabelText("organization settings")).toBeInTheDocument();
  });

  it("links to the organization's settings page", () => {
    mockUseOrgPermissions.mockReturnValue(orgPermissionsResult({ managePermission: true }));
    renderButton();
    expect(screen.getByLabelText("organization settings").closest("a")).toHaveAttribute(
      "href",
      "/organizations/org-1/settings"
    );
  });
});
