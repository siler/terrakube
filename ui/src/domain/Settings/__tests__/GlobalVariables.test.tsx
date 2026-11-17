import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { GlobalVariablesSettings } from "../GlobalVariables";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
  isPermissionError: () => false,
}));

const variable = (id: string, key: string, category: string, extra: Record<string, unknown> = {}) => ({
  id,
  attributes: { key, value: `${key}-value`, category, hcl: false, sensitive: false, description: "", ...extra },
});

const GLOBALVAR_LIST = "organization/org-1/globalvar?fields[globalvar]=key,value,hcl,sensitive,category";
const GLOBALVAR_EDIT =
  "organization/org-1/globalvar/v-2?fields[globalvar]=key,value,hcl,sensitive,category,description";

// Answers only the exact URLs given, so a request that drops a field fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  jest
    .mocked(axiosInstance.get)
    .mockImplementation((url: string) =>
      url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
    );

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/settings/variables"]}>
      <Routes>
        <Route path="/organizations/:orgid/settings/variables" element={<GlobalVariablesSettings />} />
      </Routes>
    </MemoryRouter>
  );

describe("GlobalVariablesSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("groups variables by category with counts and hides sensitive values", async () => {
    respondTo({
      [GLOBALVAR_LIST]: {
        data: [
          variable("v-1", "region", "TERRAFORM"),
          variable("v-2", "TOKEN", "ENV", { sensitive: true, value: undefined }),
        ],
      },
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Terraform variables (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Environment variables (1)" })).toBeInTheDocument();
    expect(screen.getByText("region-value")).toBeInTheDocument();
    expect(screen.getByText("Sensitive, write-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete variable TOKEN" })).toBeInTheDocument();
  });

  it("shows one empty state when there are no variables", async () => {
    respondTo({ [GLOBALVAR_LIST]: { data: [] } });
    renderPage();

    expect(await screen.findByText("No global variables yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  // The API never returns a sensitive variable's value, so saving must not wipe it with an empty string.
  it("blocks saving a sensitive variable whose write-only value was not re-entered", async () => {
    respondTo({
      [GLOBALVAR_LIST]: { data: [variable("v-2", "TOKEN", "ENV", { sensitive: true, value: undefined })] },
      [GLOBALVAR_EDIT]: {
        data: {
          id: "v-2",
          attributes: { key: "TOKEN", hcl: false, sensitive: true, category: "ENV", description: "creds" },
        },
      },
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit variable TOKEN" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByLabelText("Key")).toHaveValue("TOKEN"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(within(dialog).getByText("Enter a value")).toBeInTheDocument());
    expect(axiosInstance.patch).not.toHaveBeenCalled();
  });

  it("sends the re-entered value when saving a sensitive variable", async () => {
    respondTo({
      [GLOBALVAR_LIST]: { data: [variable("v-2", "TOKEN", "ENV", { sensitive: true, value: undefined })] },
      [GLOBALVAR_EDIT]: {
        data: {
          id: "v-2",
          attributes: { key: "TOKEN", hcl: false, sensitive: true, category: "ENV", description: "creds" },
        },
      },
    });
    jest.mocked(axiosInstance.patch).mockResolvedValue({});
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit variable TOKEN" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByLabelText("Key")).toHaveValue("TOKEN"));
    fireEvent.change(within(dialog).getByLabelText("Value"), { target: { value: "supersecret" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "organization/org-1/globalvar/v-2",
        {
          data: {
            type: "globalvar",
            id: "v-2",
            attributes: { key: "TOKEN", value: "supersecret", description: "creds", hcl: false, category: "ENV" },
          },
        },
        expect.anything()
      )
    );
  });
});
