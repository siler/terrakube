import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { GeneralSettings } from "../General";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
  isPermissionError: () => false,
}));

const updateOrganization = jest.fn();
jest.mock("@/modules/organizations/useOrganizationSummaries", () => ({
  useOrganizationSummaries: () => ({ updateOrganization, removeOrganization: jest.fn() }),
}));

const ORGANIZATION_ITEM = "organization/org-1?fields[organization]=name,description,executionMode,icon";

// Answers only the exact URLs given, so a request that drops a field fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  jest
    .mocked(axiosInstance.get)
    .mockImplementation((url: string) =>
      url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
    );

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/settings/general"]}>
      <Routes>
        <Route path="/organizations/:orgid/settings/general" element={<GeneralSettings />} />
      </Routes>
    </MemoryRouter>
  );

describe("GeneralSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    respondTo({
      [ORGANIZATION_ITEM]: {
        data: { id: "org-1", attributes: { name: "acme", description: "", executionMode: "remote", icon: null } },
      },
    });
  });

  it("sends the typed update body when saving general settings", async () => {
    jest.mocked(axiosInstance.patch).mockResolvedValue({ status: 204 });
    renderPage();

    expect(await screen.findByDisplayValue("acme")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update organization" }));

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "organization/org-1",
        {
          data: {
            type: "organization",
            id: "org-1",
            attributes: { name: "acme", description: "", executionMode: "remote", icon: "FaBuilding:#000000" },
          },
        },
        expect.anything()
      )
    );
  });

  it("sends a real boolean for disabled when deleting the organization", async () => {
    jest.mocked(axiosInstance.patch).mockResolvedValue({ status: 204 });
    renderPage();

    expect(await screen.findByDisplayValue("acme")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete this organization" }));
    fireEvent.change(screen.getByLabelText("Type the name to confirm"), { target: { value: "acme" } });
    const deleteButtons = screen.getAllByRole("button", { name: "Delete this organization" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "organization/org-1",
        { data: { type: "organization", id: "org-1", attributes: { disabled: true } } },
        expect.anything()
      )
    );
  });
});
