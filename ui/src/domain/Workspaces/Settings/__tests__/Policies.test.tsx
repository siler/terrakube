import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { message } from "antd";
import { AxiosError, AxiosHeaders } from "axios";
import { WorkspacePolicies } from "../Policies";
import axiosInstance from "../../../../config/axiosConfig";
import { workspacePageRow } from "@/testUtils/workspacePageRow";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual<typeof import("react-router-dom")>("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: [] } }),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
}));

describe("WorkspacePolicies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseWorkspace = workspacePageRow({
    id: "ws-123",
    name: "prod-cluster",
    locked: false,
    lastJobStatus: "completed",
    policyComplianceStatus: "COMPLIANT",
    organization: { id: "org-456", name: "acme" },
  });

  const rowWith = (text: string) => {
    const row = screen.getAllByRole("row").find((candidate) => within(candidate).queryByText(text) !== null);
    if (!row) {
      throw new Error(`No row shows ${text}`);
    }
    return row;
  };

  it("renders COMPLIANT status badge and allows triggering evaluation", async () => {
    jest.mocked(axiosInstance.post).mockResolvedValueOnce({
      data: { jobId: "999", status: "pending" },
    });

    render(<WorkspacePolicies workspace={baseWorkspace} manageWorkspace={true} />);

    expect(screen.getByText("Compliant")).toBeInTheDocument();
    expect(screen.getByText("Evaluate policies now")).toBeEnabled();

    fireEvent.click(screen.getByText("Evaluate policies now"));

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith(
        "https://terrakube-api.test/policy/v1/organization/org-456/workspace/ws-123/evaluation"
      );
      expect(mockNavigate).toHaveBeenCalledWith("/organizations/org-456/workspaces/ws-123/runs/999");
    });
  });

  it("shows the server's message when dispatching an evaluation fails", async () => {
    const errorSpy = jest.spyOn(message, "error");
    jest.mocked(axiosInstance.post).mockRejectedValueOnce(
      new AxiosError("Request failed with status code 409", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: "A policy evaluation is already running" },
      })
    );

    render(<WorkspacePolicies workspace={baseWorkspace} manageWorkspace={true} />);
    fireEvent.click(screen.getByText("Evaluate policies now"));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Policy evaluation failed: A policy evaluation is already running");
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("stays on the page when the dispatch response carries no job id", async () => {
    jest.mocked(axiosInstance.post).mockResolvedValueOnce({ data: "" });

    render(<WorkspacePolicies workspace={baseWorkspace} manageWorkspace={true} />);
    fireEvent.click(screen.getByText("Evaluate policies now"));

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalled();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders NON-COMPLIANT status badge when status is NON_COMPLIANT", () => {
    const ws = { ...baseWorkspace, policyComplianceStatus: "NON_COMPLIANT" as const };

    render(<WorkspacePolicies workspace={ws} manageWorkspace={true} />);
    expect(screen.getByText("Non-Compliant")).toBeInTheDocument();
  });

  it("disables button and displays warning alert when workspace is locked", () => {
    const ws = { ...baseWorkspace, locked: true };

    render(<WorkspacePolicies workspace={ws} manageWorkspace={true} />);
    expect(screen.getByText("This workspace is locked. Unlock it to evaluate policies.")).toBeInTheDocument();
    expect(screen.getByText("Evaluate policies now").closest("button")).toBeDisabled();
  });

  it("disables button and displays warning alert when workspace has no completed runs", () => {
    const ws = { ...baseWorkspace, lastJobStatus: "NeverExecuted" as const };

    render(<WorkspacePolicies workspace={ws} manageWorkspace={true} />);
    expect(
      screen.getByText("This workspace has no completed run with a plan yet. Run a plan first.")
    ).toBeInTheDocument();
    expect(screen.getByText("Evaluate policies now").closest("button")).toBeDisabled();
  });

  it("disables button when user lacks both manageWorkspace and planJob permissions", () => {
    render(<WorkspacePolicies workspace={baseWorkspace} manageWorkspace={false} planJob={false} />);
    expect(screen.getByText("Evaluate policies now").closest("button")).toBeDisabled();
  });

  it("enables button when user has planJob permission even without manageWorkspace", () => {
    render(<WorkspacePolicies workspace={baseWorkspace} manageWorkspace={false} planJob={true} />);
    expect(screen.getByText("Evaluate policies now")).toBeEnabled();
  });

  it("classifies exemptions by their linkage even when a scoped workspace is not readable", async () => {
    // Elide drops a related resource the caller cannot read from `included`, but keeps the linkage:
    // the foreign exemption must not resurface as organization-scoped, and this workspace's own
    // exemption still shows its scope name.
    const exemptions = {
      data: {
        data: [
          {
            id: "ex-1",
            type: "policy_exemption",
            attributes: { ruleId: "rule_foreign_ws", ticketReference: "TICKET-1" },
            relationships: {
              policySet: { data: { type: "policy_set", id: "ps-1" } },
              workspace: { data: { type: "workspace", id: "ws-999" } },
            },
          },
          {
            id: "ex-2",
            type: "policy_exemption",
            attributes: { ruleId: "rule_own_ws", ticketReference: "TICKET-2" },
            relationships: {
              policySet: { data: { type: "policy_set", id: "ps-1" } },
              workspace: { data: { type: "workspace", id: "ws-123" } },
            },
          },
          {
            id: "ex-3",
            type: "policy_exemption",
            attributes: { ruleId: "rule_org", ticketReference: "TICKET-3" },
            relationships: { policySet: { data: { type: "policy_set", id: "ps-2" } } },
          },
        ],
        included: [
          { type: "policy_set", id: "ps-1", attributes: { name: "locked-down" } },
          { type: "policy_set", id: "ps-2", attributes: { name: "open" } },
        ],
      },
    };
    jest.mocked(axiosInstance.get).mockImplementation((url: string) =>
      url.includes("policyExemption")
        ? Promise.resolve(exemptions)
        : Promise.resolve({
            data: { data: [{ id: "ws-123", type: "workspace", attributes: { name: "prod-cluster" } }] },
          })
    );

    render(<WorkspacePolicies workspace={baseWorkspace} manageWorkspace={true} />);

    expect(await screen.findByText("locked-down")).toBeInTheDocument();
    expect(screen.queryByText("rule_foreign_ws")).toBeNull();
    const ownRow = rowWith("rule_own_ws");
    expect(within(ownRow).getByText("prod-cluster")).toBeInTheDocument();
    expect(within(ownRow).getByText("Workspace")).toBeInTheDocument();
    expect(within(ownRow).queryByText("Inherited")).toBeNull();
    const orgRow = rowWith("rule_org");
    expect(within(orgRow).getByText("Organization-wide")).toBeInTheDocument();
    expect(within(orgRow).getByText("Inherited")).toBeInTheDocument();
    // Scopes are looked up by id in one request each; nothing is asked for projects.
    const urls = jest.mocked(axiosInstance.get).mock.calls.map(([url]) => decodeURIComponent(url));
    expect(urls.find((url) => url.includes("id=in="))).toBe(
      "organization/org-456/workspace?fields[workspace]=name&filter[workspace]=id=in=('ws-999','ws-123')"
    );
    expect(urls.some((url) => url.includes("/project?"))).toBe(false);
  });
});
