import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PolicyExemptionModal } from "../PolicyExemptionModal";
import axiosInstance from "../../../../config/axiosConfig";

jest.mock("../../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
}));

describe("PolicyExemptionModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(axiosInstance.get).mockImplementation((url: string) => {
      if (url.includes("/policySet")) {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "ps-1",
                attributes: { name: "AWS Security Baseline" },
                relationships: { organization: { data: { id: "org-1" } } },
              },
            ],
          },
        });
      }
      if (url.includes("/workspace")) {
        return Promise.resolve({
          data: {
            data: [{ id: "ws-1", attributes: { name: "frontend-prod" } }],
          },
        });
      }
      if (url.includes("/project")) {
        return Promise.resolve({
          data: {
            data: [{ id: "proj-1", attributes: { name: "Core Platform" } }],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it("renders creation modal with form fields", async () => {
    render(
      <PolicyExemptionModal
        visible={true}
        mode="create"
        organizationId="org-1"
        onCancel={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByText("Create exemption", { selector: ".ant-modal-title" })).toBeInTheDocument();
    expect(screen.getByText("Policy set")).toBeInTheDocument();
    expect(screen.getByText("Rule ID")).toBeInTheDocument();
    expect(screen.getByText("Scope")).toBeInTheDocument();
    expect(screen.getByText("Organization-wide")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Ticket reference")).toBeInTheDocument();
    expect(screen.getByText("Justification")).toBeInTheDocument();
    expect(screen.getByText("Never expires")).toBeInTheDocument();

    await waitFor(() => {
      // The typed query sends its abort config as the second argument.
      expect(axiosInstance.get).toHaveBeenCalledWith(
        "organization/org-1/policySet?fields[policy_set]=name",
        expect.anything()
      );
      expect(axiosInstance.get).toHaveBeenCalledWith(
        "organization/org-1/workspace?fields[workspace]=name",
        expect.anything()
      );
      expect(axiosInstance.get).toHaveBeenCalledWith(
        "organization/org-1/project?fields[project]=name",
        expect.anything()
      );
    });
  });

  it("handles locked workspace scope properly", () => {
    render(
      <PolicyExemptionModal
        visible={true}
        mode="create"
        organizationId="org-1"
        lockedScope={{
          scopeType: "WORKSPACE",
          workspaceId: "ws-1",
          workspaceName: "frontend-prod",
        }}
        initialData={{
          ruleId: "aws_s3_bucket_no_public_access",
        }}
        onCancel={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("aws_s3_bucket_no_public_access")).toBeInTheDocument();
  });

  it("submits create exemption payload", async () => {
    jest.mocked(axiosInstance.post).mockResolvedValueOnce({
      data: { data: { id: "ex-new-1" } },
    });

    const onSuccessMock = jest.fn();

    render(
      <PolicyExemptionModal
        visible={true}
        mode="create"
        organizationId="org-1"
        initialData={{
          policySetId: "ps-1",
          ruleId: "aws_s3_no_public",
          ticketReference: "SEC-100",
          justification: "Approved exception for public assets",
        }}
        onCancel={jest.fn()}
        onSuccess={onSuccessMock}
      />
    );

    const submitBtn = screen.getByRole("button", { name: "Create exemption" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith("policy_exemption", expect.anything(), expect.anything());
    });
    expect(jest.mocked(axiosInstance.post).mock.calls[0][1]).toMatchObject({
      data: {
        type: "policy_exemption",
        attributes: {
          ruleId: "aws_s3_no_public",
          ticketReference: "SEC-100",
          justification: "Approved exception for public assets",
        },
      },
    });

    expect(onSuccessMock).toHaveBeenCalled();
  });

  it("toggles indefinite exemption when clicking the switch or label text", async () => {
    jest.mocked(axiosInstance.post).mockResolvedValueOnce({
      data: { data: { id: "ex-new-2" } },
    });

    const onSuccessMock = jest.fn();

    render(
      <PolicyExemptionModal
        visible={true}
        mode="create"
        organizationId="org-1"
        initialData={{
          policySetId: "ps-1",
          ruleId: "aws_s3_no_public",
          ticketReference: "SEC-200",
          justification: "Permanent exception for legacy setup",
        }}
        onCancel={jest.fn()}
        onSuccess={onSuccessMock}
      />
    );

    // Initially, Expiration Date is visible
    expect(screen.getByText("Expires on")).toBeInTheDocument();

    // Click label text to toggle indefinite on
    const toggleLabel = screen.getByText("Never expires");
    fireEvent.click(toggleLabel);

    // Expiration date field should now be hidden
    expect(screen.queryByText("Expires on")).not.toBeInTheDocument();

    // Submit form and verify expiresAt is null
    const submitBtn = screen.getByRole("button", { name: "Create exemption" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith("policy_exemption", expect.anything(), expect.anything());
    });
    expect(jest.mocked(axiosInstance.post).mock.calls[0][1]).toMatchObject({
      data: { attributes: { ruleId: "aws_s3_no_public", expiresAt: null } },
    });

    expect(onSuccessMock).toHaveBeenCalled();
  });
});
