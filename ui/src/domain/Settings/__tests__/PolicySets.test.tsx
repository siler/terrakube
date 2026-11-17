import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PolicySetsSettings } from "../PolicySets";
import { linkIncluded } from "@/testUtils/fixtureLinkage";

window._env_ = {
  REACT_APP_AUTHORITY: "http://localhost/authority",
  REACT_APP_CLIENT_ID: "client-id",
  REACT_APP_REDIRECT_URI: "http://localhost/redirect",
  REACT_APP_SCOPE: "openid",
  REACT_APP_TERRAKUBE_API_URL: "http://localhost:8080/api/v1",
  REACT_APP_TERRAKUBE_VERSION: "test",
  REACT_APP_REGISTRY_URI: "http://localhost:8080/registry",
};

type Response = { data: unknown };

const getMock = jest.fn<Promise<Response>, [string]>();
const deleteMock = jest.fn<Promise<Response>, [string]>();
const postMock = jest.fn<Promise<Response>, [string, unknown, unknown]>();
const patchMock = jest.fn<Promise<Response>, [string, unknown, unknown]>();

// Answers only the exact URLs given, so a request that drops a field fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  getMock.mockImplementation((url) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
  );

const POLICY_SETS_URL =
  "policy_set?include=notificationConfiguration&fields[policy_set]=name,description,enforcementLevel,shadowEnforcementLevel,global,overrideTeam,repository,branch,folder,organization,attachments,notificationConfiguration&fields[notification_configuration]=name,channelType";
const editUrl = (id: string) =>
  `policy_set/${id}?fields[policy_set]=name,description,enforcementLevel,shadowEnforcementLevel,overrideTeam,global,repository,branch,folder,opaVersion,vcs,notificationConfiguration`;
const attachmentsUrl = (id: string) => `policy_set/${id}/attachments?fields[policy_attachment]=workspace,project,tag`;
// The delete sweep deletes by id; the required policySet linkage keeps the fieldset non-empty.
const attachmentsIdUrl = (id: string) => `policy_set/${id}/attachments?fields[policy_attachment]=policySet`;
const teamsUrl = "organization/org-1/team?fields[team]=name";
// The reference pickers request a name per row; every route the edit page fires must be answered.
const referenceRoutes = {
  "organization/org-1/vcs?fields[vcs]=name": { data: [] },
  "organization/org-1/workspace?fields[workspace]=name": { data: [] },
  "organization/org-1/project?fields[project]=name": { data: [] },
  "organization/org-1/tag?fields[tag]=name": { data: [] },
  "organization/org-1/notificationConfiguration?fields[notification_configuration]=name": { data: [] },
  [teamsUrl]: { data: [] },
};

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: [string]) => getMock(...args),
    delete: (...args: [string]) => deleteMock(...args),
    post: (...args: [string, unknown, unknown]) => postMock(...args),
    patch: (...args: [string, unknown, unknown]) => patchMock(...args),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

describe("PolicySetsSettings", () => {
  const samplePolicySets = [
    {
      id: "ps-1",
      attributes: {
        name: "security-baseline",
        description: "Enforces enterprise encryption and access control",
        enforcementLevel: "HARD_MANDATORY",
        shadowEnforcementLevel: null,
        global: true,
        overrideTeam: null,
        repository: "https://github.com/org/opa-policies",
        branch: "main",
        folder: "/baseline",
        opaVersion: null,
      },
      relationships: {
        organization: { data: { id: "org-1" } },
        attachments: { data: [] },
        notificationConfiguration: { data: { id: "notif-ps-1" } },
      },
    },
    {
      id: "ps-2",
      attributes: {
        name: "tagging-rules",
        description: "Requires cost center and env tags",
        enforcementLevel: "SOFT_MANDATORY",
        shadowEnforcementLevel: "HARD_MANDATORY",
        global: false,
        overrideTeam: "secops",
        repository: "https://github.com/org/tag-policies",
        branch: "main",
        folder: null,
        opaVersion: null,
      },
      relationships: {
        organization: { data: { id: "org-1" } },
        attachments: { data: [{ id: "att-1" }, { id: "att-2" }] },
        notificationConfiguration: { data: null },
      },
    },
    {
      id: "ps-3",
      attributes: {
        name: "advisory-checks",
        description: "Advises on deprecated cloud resource types",
        enforcementLevel: "ADVISORY",
        shadowEnforcementLevel: null,
        global: false,
        overrideTeam: null,
        repository: "https://github.com/org/advisory-policies",
        branch: "develop",
        folder: null,
        opaVersion: null,
      },
      relationships: {
        organization: { data: { id: "org-1" } },
        attachments: { data: [{ id: "att-3" }] },
        notificationConfiguration: { data: null },
      },
    },
  ];

  const sampleIncluded = [
    {
      type: "notification_configuration",
      id: "notif-ps-1",
      attributes: {
        name: "SecOps Alerts",
        channelType: "SLACK",
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    postMock.mockResolvedValue({ data: { data: { id: "new-id" } } });
    patchMock.mockResolvedValue({ data: { data: { id: "edit-id" } } });
    respondTo({
      [POLICY_SETS_URL]: { data: samplePolicySets, included: sampleIncluded },
    });
  });

  it("renders list of policy sets in card mode with filters and view toggle", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("security-baseline")).toBeInTheDocument();
      expect(screen.getByText("tagging-rules")).toBeInTheDocument();
      expect(screen.getByText("advisory-checks")).toBeInTheDocument();
      expect(screen.getByText("Hard mandatory")).toBeInTheDocument();
      expect(screen.getByText("Soft mandatory")).toBeInTheDocument();
      expect(screen.getByText("Advisory")).toBeInTheDocument();
      expect(screen.getByText("Global")).toBeInTheDocument();
      expect(screen.getByText("2 attachments")).toBeInTheDocument();
      expect(screen.getByText("1 attachment")).toBeInTheDocument();
      expect(screen.getByText("Override team: secops")).toBeInTheDocument();
      expect(screen.getByText("Notification: SecOps Alerts")).toBeInTheDocument();
    });

    // Check filter elements and header action are present
    expect(screen.getByTestId("policy-set-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("policy-set-category-select")).toBeInTheDocument();
    expect(screen.getByTestId("policy-set-scope-select")).toBeInTheDocument();
    expect(screen.getByTestId("policy-set-view-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("add-policy-set-btn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create policy set/ })).toBeInTheDocument();
  });

  it("allows toggling between Card mode and Compact mode", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("policy-set-card-ps-1")).toBeInTheDocument();
    });

    // Toggle to compact mode
    const compactSegment = screen.getByRole("radio", { name: /compact/i });
    fireEvent.click(compactSegment);

    // Table view should now be displayed
    await waitFor(() => {
      expect(screen.getByTestId("policy-sets-compact-table")).toBeInTheDocument();
      expect(screen.getByTestId("policy-set-table-link-ps-1")).toBeInTheDocument();
    });

    // Preference should be persisted in localStorage
    expect(localStorage.getItem("terrakube.policySets.listViewMode")).toBe("compact");

    // Toggle back to cards
    const cardsSegment = screen.getByRole("radio", { name: /cards/i });
    fireEvent.click(cardsSegment);

    await waitFor(() => {
      expect(screen.getByTestId("policy-set-card-ps-1")).toBeInTheDocument();
    });
    expect(localStorage.getItem("terrakube.policySets.listViewMode")).toBe("cards");
  });

  it("filters policy sets by search query", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("security-baseline")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("policy-set-search-input");
    fireEvent.change(searchInput, { target: { value: "tagging" } });

    await waitFor(() => {
      expect(screen.queryByText("security-baseline")).not.toBeInTheDocument();
      expect(screen.getByText("tagging-rules")).toBeInTheDocument();
      expect(screen.queryByText("advisory-checks")).not.toBeInTheDocument();
    });

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("security-baseline")).toBeInTheDocument();
      expect(screen.getByText("tagging-rules")).toBeInTheDocument();
      expect(screen.getByText("advisory-checks")).toBeInTheDocument();
    });
  });

  it("displays empty state when search finds no results and allows clearing filters", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("security-baseline")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("policy-set-search-input");
    fireEvent.change(searchInput, { target: { value: "non-existent-policy" } });

    await waitFor(() => {
      expect(screen.getByText("No policy sets match these filters.")).toBeInTheDocument();
    });

    const clearButton = screen.getByTestId("empty-clear-filters-btn");
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.getByText("security-baseline")).toBeInTheDocument();
    });
  });

  it("renders policy set title as a link pointing to edit page", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const titleLink = screen.getByTestId("policy-set-title-link-ps-1");
      expect(titleLink).toBeInTheDocument();
      expect(titleLink).toHaveAttribute("href", "/organizations/org-1/settings/policies/edit/ps-1");
    });
  });

  it("renders empty state when no policy sets configured", async () => {
    respondTo({ [POLICY_SETS_URL]: { data: [] } });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText("No policy sets yet. Create one to check plans against OPA policies.")
      ).toBeInTheDocument();
    });
  });

  it("renders create form when editorMode is new", async () => {
    respondTo(referenceRoutes);

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Create policy set" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Hard mandatory/ })).toBeChecked();
    expect(screen.getByLabelText("Notification")).toBeInTheDocument();
    expect(screen.getByTestId("policy-set-override-team-select")).toBeInTheDocument();
    expect(screen.getByLabelText("Override team")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create policy set" })).toBeInTheDocument();
  });

  it("asks only for workspace names for the scope picker", async () => {
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith("organization/org-1/workspace?fields[workspace]=name", expect.anything())
    );
    expect(getMock).not.toHaveBeenCalledWith("organization/org-1/workspace", expect.anything());
  });

  it("renders authorized override team select allowing user to pick teams", async () => {
    const sampleTeams = [
      { id: "team-1", attributes: { name: "security-admins" } },
      { id: "team-2", attributes: { name: "platform-team" } },
    ];
    respondTo({ ...referenceRoutes, [teamsUrl]: { data: sampleTeams } });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("policy-set-override-team-select")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Override team")).toBeInTheDocument();
  });

  it("renders edit form with pre-populated override team in select", async () => {
    const editItem = {
      id: "ps-2",
      attributes: {
        name: "tagging-rules",
        description: "Requires tags",
        enforcementLevel: "SOFT_MANDATORY",
        shadowEnforcementLevel: null,
        overrideTeam: "secops",
        global: false,
        repository: "https://github.com/org/tag-policies",
        branch: "main",
        folder: null,
        opaVersion: null,
      },
    };

    respondTo({
      ...referenceRoutes,
      [editUrl("ps-2")]: linkIncluded(editUrl("ps-2"), { data: editItem }),
      [attachmentsUrl("ps-2")]: { data: [] },
      [teamsUrl]: {
        data: [
          { id: "team-1", attributes: { name: "secops" } },
          { id: "team-2", attributes: { name: "security-admins" } },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/edit/ps-2"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/edit/:id"
            element={<PolicySetsSettings editorMode="edit" editorId="ps-2" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Edit policy set" })).toBeInTheDocument();
      expect(screen.getByText("secops")).toBeInTheDocument();
    });

    // The override team options come from the teams read; open the select to prove it loaded.
    fireEvent.mouseDown(screen.getByTestId("policy-set-override-team-select"));
    expect(
      await screen.findByText("security-admins", { selector: ".ant-select-item-option-content" })
    ).toBeInTheDocument();
  });

  it("renders OPA version input field with placeholder in create form", async () => {
    respondTo(referenceRoutes);

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create policy set" })).toBeInTheDocument();
    });

    const opaVersionInput = screen.getByTestId("policy-set-opa-version-input");
    expect(opaVersionInput).toBeInTheDocument();
    expect(opaVersionInput).toHaveAttribute("placeholder", "Inherit system default (e.g. 1.20.2)");
    expect(screen.getByText("OPA releases")).toBeInTheDocument();
  });

  it("renders edit form with pre-populated opaVersion", async () => {
    const editItem = {
      id: "ps-3",
      attributes: {
        name: "custom-opa-set",
        description: "Custom OPA version test",
        enforcementLevel: "HARD_MANDATORY",
        shadowEnforcementLevel: null,
        overrideTeam: null,
        global: false,
        opaVersion: "0.68.0",
        repository: "https://github.com/org/policies",
        branch: "main",
        folder: null,
      },
    };

    respondTo({
      ...referenceRoutes,
      [editUrl("ps-3")]: linkIncluded(editUrl("ps-3"), { data: editItem }),
      [attachmentsUrl("ps-3")]: { data: [] },
    });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/edit/ps-3"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/edit/:id"
            element={<PolicySetsSettings editorMode="edit" editorId="ps-3" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Edit policy set" })).toBeInTheDocument();
    });

    expect(screen.getByTestId("policy-set-opa-version-input")).toHaveValue("0.68.0");
  });

  it("deletes a policy set only after its name is typed", async () => {
    deleteMock.mockResolvedValue({ data: null });
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies"
            element={<PolicySetsSettings managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete tagging-rules" }));
    const confirm = await screen.findByRole("button", { name: "Delete policy set" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type the name to confirm"), { target: { value: "tagging-rules" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("policy_set/ps-2"));
  });

  it("offers deletion in a danger zone on the edit page", async () => {
    respondTo({
      ...referenceRoutes,
      [editUrl("ps-3")]: linkIncluded(editUrl("ps-3"), {
        data: {
          id: "ps-3",
          attributes: {
            name: "advisory-checks",
            description: null,
            enforcementLevel: "ADVISORY",
            shadowEnforcementLevel: null,
            overrideTeam: null,
            global: false,
            repository: null,
            branch: null,
            folder: null,
            opaVersion: null,
          },
        },
      }),
      [attachmentsUrl("ps-3")]: { data: [] },
    });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/edit/ps-3"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/edit/:id"
            element={<PolicySetsSettings editorMode="edit" editorId="ps-3" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Destruction and deletion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete this policy set" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Update policy set" })).toBeInTheDocument();
  });

  it("sends the typed create body for a policy set", async () => {
    respondTo({ ...referenceRoutes, [attachmentsIdUrl("new-id")]: { data: [] } });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "baseline" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "https://github.com/org/opa.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Create policy set" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        "policy_set",
        {
          data: {
            type: "policy_set",
            attributes: {
              name: "baseline",
              enforcementLevel: "HARD_MANDATORY",
              shadowEnforcementLevel: null,
              overrideTeam: null,
              global: false,
              repository: "https://github.com/org/opa.git",
              branch: "main",
              folder: "/",
              opaVersion: null,
            },
            relationships: {
              organization: { data: { type: "organization", id: "org-1" } },
            },
          },
        },
        expect.anything()
      )
    );
  });

  it("sends the typed update body and replaces attachments on save", async () => {
    respondTo({
      ...referenceRoutes,
      [editUrl("ps-2")]: linkIncluded(editUrl("ps-2"), {
        data: {
          id: "ps-2",
          attributes: {
            name: "tagging-rules",
            description: "Requires cost center and env tags",
            enforcementLevel: "SOFT_MANDATORY",
            shadowEnforcementLevel: "HARD_MANDATORY",
            overrideTeam: "secops",
            global: false,
            repository: "https://github.com/org/tag-policies",
            branch: "main",
            folder: null,
            opaVersion: null,
          },
        },
      }),
      [attachmentsUrl("ps-2")]: {
        data: [{ id: "att-1", relationships: { workspace: { data: { type: "workspace", id: "ws-1" } } } }],
      },
      [attachmentsIdUrl("ps-2")]: { data: [{ id: "att-1" }] },
    });
    deleteMock.mockResolvedValue({ data: null });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/edit/ps-2"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/edit/:id"
            element={<PolicySetsSettings editorMode="edit" editorId="ps-2" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Update policy set" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        "policy_set/ps-2",
        {
          data: {
            type: "policy_set",
            id: "ps-2",
            attributes: {
              name: "tagging-rules",
              description: "Requires cost center and env tags",
              enforcementLevel: "SOFT_MANDATORY",
              shadowEnforcementLevel: "HARD_MANDATORY",
              overrideTeam: "secops",
              global: false,
              repository: "https://github.com/org/tag-policies",
              branch: "main",
              folder: "/",
              opaVersion: null,
            },
            relationships: {
              organization: { data: { type: "organization", id: "org-1" } },
              notificationConfiguration: { data: null },
            },
          },
        },
        expect.anything()
      )
    );

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        "policy_set/ps-2/attachments",
        {
          data: {
            type: "policy_attachment",
            relationships: {
              policySet: { data: { type: "policy_set", id: "ps-2" } },
              workspace: { data: { type: "workspace", id: "ws-1" } },
            },
          },
        },
        expect.anything()
      )
    );
    expect(deleteMock).toHaveBeenCalledWith("policy_set/ps-2/attachments/att-1");
  });

  it("sends a blank OPA version as null so the set inherits the default", async () => {
    respondTo({ ...referenceRoutes, [attachmentsIdUrl("new-id")]: { data: [] } });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "baseline" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "https://github.com/org/opa.git" } });
    fireEvent.change(screen.getByTestId("policy-set-opa-version-input"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Create policy set" }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith("policy_set", expect.anything(), expect.anything()));
    expect(postMock.mock.calls[0][1]).toMatchObject({ data: { attributes: { opaVersion: null } } });
  });

  it("skips the attachment sync when the create response names no id", async () => {
    postMock.mockResolvedValue({ data: {} });
    respondTo({ ...referenceRoutes });

    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/policies/new"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/policies/new"
            element={<PolicySetsSettings editorMode="new" managePermission={true} />}
          />
          <Route path="/organizations/:orgid/settings/policies" element={<p>policy list</p>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "baseline" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "https://github.com/org/opa.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Create policy set" }));

    expect(await screen.findByText("policy list")).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls.some(([url]) => url.includes("/attachments"))).toBe(false);
  });
});
