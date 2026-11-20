import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { message } from "antd";
import { WorkspaceTeamAccess } from "../TeamAccess";
import workspaceAccessService from "@/modules/workspaces/workspaceAccessService";
import { workspacePageRow } from "@/testUtils/workspacePageRow";

jest.mock("@/config/authConfig", () => ({ mgr: { removeUser: jest.fn() } }));
jest.mock("@/config/axiosConfig", () => ({
  ...jest.requireActual<typeof import("@/config/axiosConfig")>("@/config/axiosConfig"),
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [] } }) },
}));
jest.mock("@/modules/workspaces/workspaceAccessService", () => ({
  __esModule: true,
  default: { listWorkspaceAccess: jest.fn(), removeWorkspaceAccess: jest.fn() },
}));

const workspace = workspacePageRow({ id: "ws-1", name: "prod", organization: { id: "org-1", name: "acme" } });
const list = jest.mocked(workspaceAccessService.listWorkspaceAccess);
const remove = jest.mocked(workspaceAccessService.removeWorkspaceAccess);
const devs = {
  id: "a1",
  name: "devs",
  role: "write",
  manageWorkspace: false,
  manageState: false,
  planJob: false,
  approveJob: false,
  destroyJob: false,
};
const rejectedWith = (status: number, data: unknown) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, data, statusText: "", headers: {}, config: {} },
});

const removeDevs = async () => {
  render(<WorkspaceTeamAccess organizationId="org-1" workspace={workspace} manageWorkspace={true} />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove access for team devs" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove access" }));
};

describe("WorkspaceTeamAccess", () => {
  it("shows only the empty state when no team has access", async () => {
    list.mockResolvedValue({ isError: false, responseCode: 200, data: [] });
    render(<WorkspaceTeamAccess organizationId="org-1" workspace={workspace} manageWorkspace={true} />);

    expect(await screen.findByText("No teams have been granted access to this workspace yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a team/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uses singular grammar and role labels from the role list", async () => {
    list.mockResolvedValue({
      isError: false,
      responseCode: 200,
      data: [
        {
          id: "a1",
          name: "devs",
          role: "write",
          manageWorkspace: false,
          manageState: false,
          planJob: false,
          approveJob: false,
          destroyJob: false,
        },
      ],
    });
    render(<WorkspaceTeamAccess organizationId="org-1" workspace={workspace} manageWorkspace={true} />);

    expect(await screen.findByText("1 team has access")).toBeInTheDocument();
    expect(screen.getAllByText("Write").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Remove access for team devs" })).toBeInTheDocument();
  });

  it("lists who can destroy: the role decides for a preset role, the saved right for a custom one", async () => {
    const base = { manageWorkspace: false, manageState: false, planJob: true, approveJob: false };
    list.mockResolvedValue({
      isError: false,
      responseCode: 200,
      data: [
        { id: "a1", name: "planners", role: "plan", ...base, destroyJob: true },
        { id: "a2", name: "writers", role: "write", ...base, destroyJob: false },
        { id: "a3", name: "ops", role: "custom", ...base, destroyJob: true },
      ],
    });
    render(<WorkspaceTeamAccess organizationId="org-1" workspace={workspace} manageWorkspace={true} />);

    expect(await screen.findByText("3 teams have access")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    const destroy = (team: string) => {
      const row = rows.find((candidate) => within(candidate).queryByText(team));
      if (!row) {
        throw new Error(`No row for team ${team}`);
      }
      return within(row)
        .queryByLabelText(/destroy runs/i)
        ?.getAttribute("aria-label");
    };
    expect(destroy("planners")).toBe("Cannot destroy runs");
    expect(destroy("writers")).toBe("Can destroy runs");
    expect(destroy("ops")).toBe("Can destroy runs");
  });

  it("shows the server's reason when removing access fails", async () => {
    const error = jest.spyOn(message, "error").mockImplementation(jest.fn());
    list.mockResolvedValue({ isError: false, responseCode: 200, data: [devs] });
    remove.mockRejectedValue(rejectedWith(409, { errors: [{ detail: "The last admin team cannot be removed" }] }));

    await removeDevs();

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Failed to remove team access: The last admin team cannot be removed")
    );
  });

  it("keeps the team-access wording for a 403", async () => {
    const error = jest.spyOn(message, "error").mockImplementation(jest.fn());
    list.mockResolvedValue({ isError: false, responseCode: 200, data: [devs] });
    remove.mockRejectedValue(rejectedWith(403, {}));

    await removeDevs();

    await waitFor(() => expect(error).toHaveBeenCalledWith("You are not authorized to manage workspace team access."));
  });
});
