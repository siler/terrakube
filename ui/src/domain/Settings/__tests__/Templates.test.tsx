import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { TemplatesSettings } from "../Templates";
import { EditTemplate } from "../EditTemplate";
import { AddTemplate } from "../AddTemplate";
import { message } from "antd";
import { AxiosError, AxiosHeaders } from "axios";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), delete: jest.fn(), post: jest.fn() },
  getErrorMessage: (err: Error) => err.message,
  isPermissionError: () => false,
}));
jest.mock("@/components/forms/CodeEditor", () => ({ CodeEditor: () => null }));

const get = jest.mocked(axiosInstance.get);

const TEMPLATE_LIST = "organization/org-1/template?fields[template]=name,description";
const TEMPLATE_EDIT = "organization/org-1/template/t-1?fields[template]=name,description,tcl";

// Answers only the exact URLs given, so a request that drops a field fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
  );

const renderList = (managePermission = true) =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/settings/templates"]}>
      <Routes>
        <Route
          path="/organizations/:orgid/settings/templates"
          element={<TemplatesSettings managePermission={managePermission} />}
        />
      </Routes>
    </MemoryRouter>
  );

describe("TemplatesSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists templates under a count heading with named icon actions", async () => {
    respondTo({
      [TEMPLATE_LIST]: {
        data: [{ id: "t-1", attributes: { name: "Plan and apply", description: "Runs plan and apply" } }],
      },
    });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    renderList();

    expect(await screen.findByRole("heading", { name: "Templates (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan and apply" })).toHaveAttribute(
      "href",
      "/organizations/org-1/settings/templates/edit/t-1"
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Plan and apply" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete template" }));
    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/template/t-1"));
  });

  it("shows an empty state with one action instead of an empty list", async () => {
    respondTo({ [TEMPLATE_LIST]: { data: [] } });
    renderList();

    expect(await screen.findByText("No templates yet. Workspaces need one to run a job.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Templates \(/ })).not.toBeInTheDocument();
    // The header primary plus the empty-state action.
    expect(screen.getAllByRole("link", { name: /Create template/ })).toHaveLength(2);
  });

  it("shows template names as plain text without the manage permission", async () => {
    respondTo({ [TEMPLATE_LIST]: { data: [{ id: "t-1", attributes: { name: "Plan and apply" } }] } });
    renderList(false);

    expect(await screen.findByText("Plan and apply")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Plan and apply" })).not.toBeInTheDocument();
  });

  it("disables updating and deleting a template without the manage permission", async () => {
    respondTo({
      [TEMPLATE_EDIT]: { data: { id: "t-1", attributes: { name: "Plan and apply", tcl: btoa("flow: []") } } },
    });
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/templates/edit/t-1"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/templates/edit/:editorId"
            element={
              <EditTemplate setMode={jest.fn()} templateId="t-1" loadTemplates={jest.fn()} managePermission={false} />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Update template" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete this template" })).toBeDisabled();
  });
});

describe("AddTemplate", () => {
  beforeEach(() => jest.clearAllMocks());

  const rejectionWithStatus = (status: number) => {
    const config = { headers: new AxiosHeaders() };
    return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, {
      data: {},
      status,
      statusText: "",
      headers: {},
      config,
    });
  };

  const submitBlankTemplate = async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/templates/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/templates/new"
            element={<AddTemplate setMode={jest.fn()} loadTemplates={jest.fn()} />}
          />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Start from Blank template" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "flow" } });
    fireEvent.click(screen.getByRole("button", { name: "Create template" }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
  };

  it("reports a failed create that is not a permission error", async () => {
    const errorSpy = jest.spyOn(message, "error");
    jest.mocked(axiosInstance.post).mockRejectedValueOnce(rejectionWithStatus(500));
    await submitBlankTemplate();
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith("Could not create the template: Request failed"));
  });

  it("explains the missing permission when the create is forbidden", async () => {
    const errorSpy = jest.spyOn(message, "error");
    jest.mocked(axiosInstance.post).mockRejectedValueOnce(rejectionWithStatus(403));
    await submitBlankTemplate();
    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("Could not create the template"));
  });
});
