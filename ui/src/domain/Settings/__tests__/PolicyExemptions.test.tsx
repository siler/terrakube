import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PolicyExemptionsSettings } from "../PolicyExemptions";
import axiosInstance from "../../../config/axiosConfig";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    delete: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message ? err.message : "Error"),
}));

const get = jest.mocked(axiosInstance.get);

describe("PolicyExemptionsSettings", () => {
  // Answers only the exact URLs given, so a request that drops a field fails the test.
  const respondTo = (routes: Record<string, unknown>) =>
    get.mockImplementation((url: string) =>
      url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
    );

  const POLICY_SETS_URL = "policy_set?fields[policy_set]=name,organization";
  const EXEMPTIONS_URL =
    "organization/org-1/policyExemption?fields[policy_exemption]=ruleId,ticketReference,justification,expiresAt,createdDate,createdBy,policySet,workspace,project";
  // The workspace scope names are fetched by id once the exemptions name their scopes.
  const WORKSPACE_NAMES_URL =
    "organization/org-1/workspace?fields[workspace]=name&filter[workspace]=id%3Din%3D('ws-1')";

  const sampleRawExemptions = [
    {
      id: "ex-1",
      attributes: {
        ruleId: "aws_s3_bucket_no_public",
        ticketReference: "SEC-101",
        justification: "Approved CDN bucket waiver",
        expiresAt: "2099-12-31T00:00:00Z",
        createdDate: null,
        createdBy: null,
      },
      relationships: {
        policySet: { data: { id: "ps-1" } },
        workspace: { data: { id: "ws-1" } },
        project: { data: null },
      },
    },
    {
      id: "ex-2",
      attributes: {
        ruleId: "require_owner_tag",
        ticketReference: "SEC-202",
        justification: "Global tagging exemption for sandbox",
        expiresAt: null,
        createdDate: null,
        createdBy: null,
      },
      relationships: {
        policySet: { data: { id: "ps-2" } },
        workspace: { data: null },
        project: { data: null },
      },
    },
  ];

  const policySetRows = [
    {
      id: "ps-1",
      attributes: { name: "AWS Security Rules" },
      relationships: { organization: { data: { id: "org-1" } } },
    },
    {
      id: "ps-2",
      attributes: { name: "FinOps Governance" },
      relationships: { organization: { data: { id: "org-1" } } },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    respondTo({
      [POLICY_SETS_URL]: { data: policySetRows },
      [EXEMPTIONS_URL]: { data: sampleRawExemptions },
      [WORKSPACE_NAMES_URL]: { data: [{ id: "ws-1", attributes: { name: "frontend-prod" } }] },
      // The create modal loads its own pickers when it opens.
      "organization/org-1/policySet?fields[policy_set]=name": { data: [] },
      "organization/org-1/workspace?fields[workspace]=name": { data: [] },
      "organization/org-1/project?fields[project]=name": { data: [] },
    });
  });

  it("renders list of exemptions with filters", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicyExemptionsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("aws_s3_bucket_no_public")).toBeInTheDocument();
      expect(screen.getByText("require_owner_tag")).toBeInTheDocument();
      expect(screen.getByText("SEC-101")).toBeInTheDocument();
      expect(screen.getByText("SEC-202")).toBeInTheDocument();
      expect(screen.getByText("AWS Security Rules")).toBeInTheDocument();
      expect(screen.getByText("FinOps Governance")).toBeInTheDocument();
      expect(screen.getByText("frontend-prod")).toBeInTheDocument();
      expect(screen.getByText("Organization-wide")).toBeInTheDocument();
    });

    expect(screen.getByTestId("add-exemption-btn")).toBeInTheDocument();
  });

  it("opens create exemption modal on button click", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicyExemptionsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("add-exemption-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-exemption-btn"));

    await waitFor(() => {
      expect(screen.getByText("Create exemption", { selector: ".ant-modal-title" })).toBeInTheDocument();
    });
  });
});
