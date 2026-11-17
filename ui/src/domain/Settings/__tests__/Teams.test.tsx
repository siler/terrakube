import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { TeamSettings } from "../Teams";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), delete: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message ? err.message : "Error"),
  isPermissionError: () => false,
}));

jest.mock("../EditTeam", () => ({ EditTeam: () => <div /> }));

const get = jest.mocked(axiosInstance.get);

// Every boolean the permission summary reads is selected; the name and role label the table.
const TEAM_LIST =
  "organization/org-1/team?fields[team]=name,role,manageWorkspace,manageState,manageModule,manageProvider,manageTemplate,manageVcs,manageCollection,managePolicies,planJob,approveJob,destroyJob";

// Answers only the exact URLs given, so a request that drops a field or filter fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
  );

const team = (id: string, name: string, attributes: Record<string, unknown> = {}) => ({
  id,
  attributes: { name, ...attributes },
});

const renderTeams = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/settings/teams"]}>
      <Routes>
        <Route path="/organizations/:orgid/settings/teams" element={<TeamSettings />} />
      </Routes>
    </MemoryRouter>
  );

describe("TeamSettings list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists teams with a count, role and permission summary", async () => {
    respondTo({
      [TEAM_LIST]: {
        data: [
          team("t-1", "PLATFORM", { role: "admin" }),
          team("t-2", "DEVS", { role: "custom", manageWorkspace: true, planJob: true }),
        ],
      },
    });
    renderTeams();

    expect(await screen.findByRole("heading", { name: "Teams (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PLATFORM" })).toHaveAttribute(
      "href",
      "/organizations/org-1/settings/teams/edit/t-1"
    );
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Can manage workspaces, plan runs.")).toBeInTheDocument();
  });

  it("labels a role it does not recognise with the raw role name", async () => {
    respondTo({ [TEAM_LIST]: { data: [team("t-1", "PLATFORM", { role: "owner" })] } });
    renderTeams();

    expect(await screen.findByText("owner")).toBeInTheDocument();
  });

  it("shows an empty state instead of an empty table", async () => {
    respondTo({ [TEAM_LIST]: { data: [] } });
    renderTeams();

    expect(await screen.findByText(/No teams yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("deletes a team only after its name is typed", async () => {
    respondTo({ [TEAM_LIST]: { data: [team("t-1", "PLATFORM", { role: "read" })] } });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    renderTeams();

    fireEvent.click(await screen.findByRole("button", { name: "Delete team PLATFORM" }));
    const confirm = await screen.findByRole("button", { name: "Delete team" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type the name to confirm"), { target: { value: "PLATFORM" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/team/t-1"));
  });
});
