import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateWorkspace } from "../Create";

const getMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();
const sshSelectMock = jest.fn<Promise<unknown[]>, []>();
const templateSelectMock = jest.fn<Promise<unknown[]>, []>();
const vcsSelectMock = jest.fn<Promise<unknown[]>, []>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: (...args: Parameters<typeof getMock>) => getMock(...args), post: jest.fn() },
  getErrorMessage: () => "error",
}));

jest.mock("../../generated/apiPaths", () => ({
  ...jest.requireActual<typeof import("../../generated/apiPaths")>("../../generated/apiPaths"),
  api: {
    organization: () => ({
      ssh: () => ({ select: () => sshSelectMock() }),
      template: () => ({ select: () => templateSelectMock() }),
      vcs: () => ({ select: () => vcsSelectMock() }),
    }),
  },
}));

jest.mock("@/modules/organizations/organizationService", () => ({
  __esModule: true,
  default: { getOrganizationNameGraphQL: () => Promise.resolve("acme") },
}));

jest.mock("@/modules/projects/projectService", () => ({
  __esModule: true,
  default: { listProjects: () => Promise.resolve({ isError: false, data: [] }) },
}));

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/workspaces/create"]}>
      <Routes>
        <Route path="/organizations/:orgid/workspaces/create" element={<CreateWorkspace />} />
      </Routes>
    </MemoryRouter>
  );

describe("CreateWorkspace", () => {
  beforeEach(() => {
    [getMock, sshSelectMock, templateSelectMock, vcsSelectMock].forEach((mock) => mock.mockReset());
    sshSelectMock.mockResolvedValue([]);
    templateSelectMock.mockResolvedValue([{ id: "tpl-1", name: "Plan and apply" }]);
    vcsSelectMock.mockResolvedValue([{ id: "vcs-1", name: "acme-github", vcsType: "GITHUB" }]);
  });

  it("still loads VCS connections when the version indexes are malformed", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    // Terraform's index should be an object and OpenTofu's an array; serve each the other shape.
    getMock.mockImplementation((url: string) =>
      Promise.resolve({ data: url.endsWith("/tofu/index.json") ? { versions: {} } : null })
    );
    renderCreate();

    await waitFor(() => expect(vcsSelectMock).toHaveBeenCalled());
    await userEvent.click(await screen.findByAltText("OpenTofu"));
    await userEvent.click(screen.getByText("Version control workflow"));

    expect(await screen.findByRole("button", { name: /acme-github/ })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(expect.stringMatching(/\/tofu\/index\.json$/));
    expect(consoleError).not.toHaveBeenCalledWith("Failed to load workspace creation data:", expect.anything());
    consoleError.mockRestore();
  });
});
