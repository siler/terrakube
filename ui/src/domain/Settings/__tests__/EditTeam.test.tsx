import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { EditTeam } from "../EditTeam";
import { requestAttributes, requestData } from "@/testUtils/requestBody";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
}));
// The token endpoints' bodies, run through the caller's parser as the real wrapper does.
const mockTokenBodies: Record<string, unknown> = {
  "/access-token/v1/teams": [],
  "/access-token/v1/teams/current-teams": { groups: [] },
};

jest.mock("@/modules/api/apiWrapper", () => ({
  apiGet: jest.fn((path: string, parse: (body: unknown) => unknown) =>
    Promise.resolve({ isError: false, responseCode: 200, data: parse(mockTokenBodies[path]) })
  ),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}));
jest.mock("@/modules/token/TokenGrid", () => () => null);
jest.mock("@/components/modals/CreatePatModal", () => () => null);

const get = jest.mocked(axiosInstance.get);
const patch = jest.mocked(axiosInstance.patch);

// Everything the form seeds, in the order the form sets it; the secrets of a team are its permissions.
const TEAM_EDIT =
  "organization/org-1/team/t-1?fields[team]=name,manageState,manageProvider,manageModule,manageWorkspace,manageVcs,manageTemplate,manageCollection,managePolicies,manageJob,role,planJob,approveJob,destroyJob";

// Answers only the exact URLs given, so a request that drops a field or filter fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
  );

const renderEdit = (managePermission: boolean) =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/settings/teams/edit/t-1"]}>
      <Routes>
        <Route
          path="/organizations/:orgid/settings/teams/edit/:id"
          element={
            <EditTeam
              mode="edit"
              setMode={jest.fn()}
              teamId="t-1"
              loadTeams={jest.fn()}
              onDeleteTeam={jest.fn()}
              managePermission={managePermission}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe("EditTeam", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    respondTo({
      [TEAM_EDIT]: { data: { id: "t-1", attributes: { name: "PLATFORM", role: "admin", manageWorkspace: true } } },
    });
    patch.mockResolvedValue({});
  });

  it("disables deleting the team without the manage permission", async () => {
    renderEdit(false);

    expect(await screen.findByRole("heading", { name: "PLATFORM" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete this team" })).toBeDisabled();
  });

  it("sends only the role for a preset role, not the individual permissions", async () => {
    renderEdit(true);
    await screen.findByRole("heading", { name: "PLATFORM" });
    expect(screen.getByRole("checkbox", { name: "Manage workspaces" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalled());
    const body: unknown = patch.mock.calls[0][1];
    expect(requestData(body).type).toBe("team");
    expect(requestData(body).id).toBe("t-1");
    const attributes = requestAttributes(body);
    expect(attributes.role).toBe("admin");
    // JSON drops undefined keys, so the request carries the role alone, as before.
    expect(attributes.manageWorkspace).toBeUndefined();
  });

  it("shows a role's destroy right without sending it, and sends the saved right for a custom team", async () => {
    respondTo({
      [TEAM_EDIT]: { data: { id: "t-1", attributes: { name: "PLATFORM", role: "plan" } } },
    });
    renderEdit(true);
    await screen.findByRole("heading", { name: "PLATFORM" });
    expect(screen.getByRole("checkbox", { name: "Destroy runs" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledTimes(1));
    expect(requestAttributes(patch.mock.calls[0][1]).destroyJob).toBeUndefined();

    respondTo({
      [TEAM_EDIT]: {
        data: { id: "t-1", attributes: { name: "OPS", role: "custom", planJob: true, destroyJob: false } },
      },
    });
    renderEdit(true);
    const boxes = await screen.findAllByRole("checkbox", { name: "Destroy runs" });
    const custom = boxes[boxes.length - 1];
    expect(custom).not.toBeChecked();
    fireEvent.click(custom);
    const saveButtons = screen.getAllByRole("button", { name: "Save changes" });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledTimes(2));
    expect(requestAttributes(patch.mock.calls[1][1]).destroyJob).toBe(true);
  });
});
