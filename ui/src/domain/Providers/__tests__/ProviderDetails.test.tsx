import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { message } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProviderDetails } from "../ProviderDetails";
import { deleteProviderCascade } from "../providerService";

const permissions = { manageProvider: false };

jest.mock("@/modules/permissions/useOrgPermissions", () => ({
  useOrgPermissions: () => ({ permissions, loading: false }),
}));
jest.mock("../providerService", () => ({
  getProvider: () =>
    Promise.resolve({
      id: "p1",
      name: "random",
      description: "",
      registryNamespace: "hashicorp",
      version: [
        {
          id: "v1",
          versionNumber: "3.6.0",
          protocols: "5.0",
          status: "deprecated",
          deprecationMessage: "Use 4.0; 3.6.0 has a signing bug.",
        },
      ],
    }),
  deleteProviderCascade: jest.fn(),
  updateVersionStatus: jest.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/registry/providers/p1"]}>
      <Routes>
        <Route
          path="/organizations/:orgid/registry/providers/:providerid"
          element={<ProviderDetails organizationName="acme" />}
        />
      </Routes>
    </MemoryRouter>
  );

describe("ProviderDetails delete action", () => {
  it.each([
    [false, "true"],
    [true, "false"],
  ])("is disabled without manageProvider (manageProvider=%s)", async (allowed, ariaDisabled) => {
    permissions.manageProvider = allowed;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Manage provider/ }));

    const item = await screen.findByRole("menuitem", { name: /Delete provider/ });
    expect(item.getAttribute("aria-disabled")).toBe(ariaDisabled);
    fireEvent.click(item);
    if (allowed) expect(await screen.findByRole("dialog")).toBeInTheDocument();
    else expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ProviderDetails delete failure", () => {
  it("shows the thrown error's message", async () => {
    permissions.manageProvider = true;
    jest.mocked(deleteProviderCascade).mockRejectedValueOnce(new Error("version v1 is locked"));
    const showError = jest.spyOn(message, "error");
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Manage provider/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete provider/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "random" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete provider" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith("Failed to delete provider: version v1 is locked"));
  });
});

describe("ProviderDetails version status", () => {
  it("shows the stored deprecation message in the alert and pre-fills it in the status modal", async () => {
    permissions.manageProvider = true;
    renderPage();

    expect(await screen.findByText("Use 4.0; 3.6.0 has a signing bug.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Manage provider/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Change status of version 3.6.0/ }));

    await screen.findByRole("dialog");
    expect(await screen.findByLabelText("Message")).toHaveValue("Use 4.0; 3.6.0 has a signing bug.");
  });
});
