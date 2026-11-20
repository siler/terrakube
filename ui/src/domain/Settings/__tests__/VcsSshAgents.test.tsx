import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { message } from "antd";
import { AxiosError, AxiosHeaders } from "axios";
import axiosInstance from "../../../config/axiosConfig";
import { SSHKeysSettings } from "../SSHKeys";
import { AgentSettings } from "../Agents";
import { VCSSettings } from "../VCS";
import { AddVCS } from "../AddVCS";
import { FederatedCredentials } from "../FederatedCredentials";
import { EditFederatedCredential } from "../EditFederatedCredential";
import { getConnectUrl } from "../vcsProviders";
import { VcsType } from "../../generated/apiResources";
import { fakeUuid } from "@/testUtils/fakeUuid";

jest.spyOn(crypto, "randomUUID").mockReturnValue(fakeUuid(1));

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: [] } }),
    post: jest.fn().mockResolvedValue({ status: 201, data: { data: { id: "new-1", attributes: {} } } }),
    patch: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
  isPermissionError: () => false,
}));

const renderAt = (path: string, route: string, element: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  );

const get = jest.mocked(axiosInstance.get);

const SSH_LIST = "organization/org-1/ssh?fields[ssh]=name,description,sshType";
const VCS_LIST =
  "organization/org-1/vcs?fields[vcs]=name,vcsType,connectionType,endpoint,clientId,callback,apiUrl,status,createdBy,createdDate";
const VCS_WORKSPACES = "organization/org-1/vcs/v1?fields[vcs]=workspace";
const AGENT_LIST = "organization/org-1/agent?fields[agent]=name,description,url";
// The usage counts read linkage only: the related ids stay requested, the names do not.
const usage = (collection: string, type: string, rel: string, rsql: string) =>
  `${collection}?fields[${type}]=${rel}&filter[${type}]=${encodeURIComponent(rsql)}`;

// Answers only the exact URLs given, so a request that drops a field or filter fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
  );

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: [] } });
});

describe("SSH keys", () => {
  const renderPage = () =>
    renderAt("/organizations/org-1/settings/ssh", "/organizations/:orgid/settings/ssh", <SSHKeysSettings />);

  it("shows an empty state with one action instead of an empty list", async () => {
    renderPage();
    expect(await screen.findByText(/No SSH keys yet/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add an SSH key/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Add an SSH key/ })[0]).toHaveClass("ant-btn-primary");
    expect(screen.getAllByRole("button", { name: /Add an SSH key/ })[1]).not.toHaveClass("ant-btn-primary");
  });

  it("deletes a key only after its name is typed", async () => {
    respondTo({
      [SSH_LIST]: { data: [{ id: "k1", attributes: { name: "deploy", description: "Modules", sshType: "rsa" } }] },
      [usage("organization/org-1/workspace", "workspace", "ssh", "ssh.id=='k1'")]: { data: [] },
      [usage("organization/org-1/module", "module", "ssh", "ssh.id=='k1'")]: { data: [] },
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "SSH keys (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete SSH key deploy" }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete SSH key" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type the name to confirm"), { target: { value: "deploy" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/ssh/k1"));
  });

  it("sends the typed create body when adding a key", async () => {
    renderPage();

    fireEvent.click((await screen.findAllByRole("button", { name: /Add an SSH key/ }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "deploy" } });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Modules" } });
    fireEvent.mouseDown(within(dialog).getByLabelText("Key type"));
    fireEvent.click(await screen.findByText("ED25519"));
    fireEvent.change(within(dialog).getByLabelText("Private key"), {
      target: { value: "-----BEGIN PRIVATE KEY-----" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add SSH key" }));

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith(
        "organization/org-1/ssh",
        {
          data: {
            type: "ssh",
            attributes: {
              name: "deploy",
              description: "Modules",
              sshType: "ed25519",
              privateKey: "-----BEGIN PRIVATE KEY-----",
            },
          },
        },
        expect.anything()
      )
    );
  });
});

describe("Agents", () => {
  it("confirms a delete with the consequence and labels the icon action", async () => {
    respondTo({
      [AGENT_LIST]: {
        data: [{ id: "a1", attributes: { name: "pool-a", description: "Runners", url: "http://agent:8090" } }],
      },
      [usage("organization/org-1/workspace", "workspace", "agent", "agent.id=='a1'")]: { data: [] },
    });
    renderAt("/organizations/org-1/settings/agents", "/organizations/:orgid/settings/agents", <AgentSettings />);

    expect(await screen.findByText("http://agent:8090")).toHaveClass("resource-mono");
    fireEvent.click(screen.getByRole("button", { name: "Delete agent pool pool-a" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("can only be deleted when no workspace is assigned to it");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete agent pool" }));

    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/agent/a1"));
  });
});

describe("delete refusals", () => {
  const confirmDelete = async (button: string, okText: string, name?: string) => {
    fireEvent.click(await screen.findByRole("button", { name: button }));
    const dialog = await screen.findByRole("dialog");
    if (name) fireEvent.change(within(dialog).getByLabelText("Type the name to confirm"), { target: { value: name } });
    fireEvent.click(within(dialog).getByRole("button", { name: okText }));
  };

  it("refuses to delete an agent pool that workspaces still use, with the count", async () => {
    const errorSpy = jest.spyOn(message, "error");
    respondTo({
      [AGENT_LIST]: { data: [{ id: "a1", attributes: { name: "pool-a" } }] },
      [usage("organization/org-1/workspace", "workspace", "agent", "agent.id=='a1'")]: { data: [{ id: "w1" }] },
    });
    renderAt("/organizations/org-1/settings/agents", "/organizations/:orgid/settings/agents", <AgentSettings />);

    await confirmDelete("Delete agent pool pool-a", "Delete agent pool");

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith("pool-a is used by 1 workspace. Move them to another agent pool first.")
    );
    expect(axiosInstance.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete an SSH key that workspaces or modules still use, with the counts", async () => {
    const errorSpy = jest.spyOn(message, "error");
    respondTo({
      [SSH_LIST]: { data: [{ id: "k1", attributes: { name: "deploy" } }] },
      [usage("organization/org-1/workspace", "workspace", "ssh", "ssh.id=='k1'")]: {
        data: [{ id: "w1" }, { id: "w2" }],
      },
      [usage("organization/org-1/module", "module", "ssh", "ssh.id=='k1'")]: { data: [{ id: "m1" }] },
    });
    renderAt("/organizations/org-1/settings/ssh", "/organizations/:orgid/settings/ssh", <SSHKeysSettings />);

    await confirmDelete("Delete SSH key deploy", "Delete SSH key", "deploy");

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "deploy is used by 2 workspaces and 1 module. Move them to another SSH key first."
      )
    );
    expect(axiosInstance.delete).not.toHaveBeenCalled();
  });
});

describe("VCS providers", () => {
  const provider = (attributes: Record<string, unknown>) => ({
    id: "v1",
    attributes: {
      name: "corp-github",
      vcsType: "GITHUB",
      connectionType: "OAUTH",
      status: "PENDING",
      clientId: "abc123",
      callback: "cb-1",
      ...attributes,
    },
  });
  const renderList = () =>
    renderAt("/organizations/org-1/settings/vcs", "/organizations/:orgid/settings/vcs", <VCSSettings />);

  it("offers to connect pending OAuth providers but not managed identities", async () => {
    respondTo({
      [VCS_LIST]: {
        data: [provider({}), { ...provider({ name: "azure-mi", vcsType: "AZURE_SP_MI", callback: "cb-2" }), id: "v2" }],
      },
    });
    renderList();

    expect(await screen.findByRole("heading", { name: "VCS providers (2)" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Connect to/ })).toHaveLength(1);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("https://terrakube-api.test/callback/v1/vcs/cb-1")).toHaveClass("resource-mono");
  });

  it("refuses to delete a provider that workspaces still use, with the count", async () => {
    const errorSpy = jest.spyOn(message, "error");
    respondTo({
      [VCS_LIST]: { data: [provider({ status: "COMPLETED" })] },
      [VCS_WORKSPACES]: {
        data: {
          id: "v1",
          type: "vcs",
          relationships: {
            workspace: {
              data: [
                { type: "workspace", id: "w1" },
                { type: "workspace", id: "w2" },
              ],
            },
          },
        },
      },
      [usage("organization/org-1/module", "module", "vcs", "vcs.id=='v1'")]: { data: [] },
      [usage("policy_set", "policy_set", "vcs", "vcs.id=='v1'")]: { data: [] },
    });
    renderList();

    fireEvent.click(await screen.findByRole("button", { name: "Delete VCS provider corp-github" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Type the name to confirm"), {
      target: { value: "corp-github" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete VCS provider" }));

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "corp-github is used by 2 workspaces. Move them to another VCS provider first."
      )
    );
    expect(axiosInstance.delete).not.toHaveBeenCalled();
  });
});

describe("VCS provider delete", () => {
  const unusedVcs = { data: { id: "v1", type: "vcs", relationships: { workspace: { data: [] } } } };

  it("refuses to delete a provider that modules or policy sets still use", async () => {
    const errorSpy = jest.spyOn(message, "error");
    respondTo({
      [VCS_LIST]: {
        data: [{ id: "v1", attributes: { name: "corp-github", vcsType: "GITHUB", connectionType: "STANDALONE" } }],
      },
      [VCS_WORKSPACES]: unusedVcs,
      [usage("organization/org-1/module", "module", "vcs", "vcs.id=='v1'")]: { data: [{ id: "m1" }, { id: "m2" }] },
      [usage("policy_set", "policy_set", "vcs", "vcs.id=='v1'")]: { data: [{ id: "p1" }] },
    });
    renderAt("/organizations/org-1/settings/vcs", "/organizations/:orgid/settings/vcs", <VCSSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete VCS provider corp-github" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Type the name to confirm"), { target: { value: "corp-github" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete VCS provider" }));

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "corp-github is used by 2 modules and 1 policy set. Move them to another VCS provider first."
      )
    );
    expect(axiosInstance.delete).not.toHaveBeenCalled();
  });

  it("explains a conflict from a shared repository webhook the usage check can't see", async () => {
    const errorSpy = jest.spyOn(message, "error");
    respondTo({
      [VCS_LIST]: {
        data: [{ id: "v1", attributes: { name: "corp-github", vcsType: "GITHUB", connectionType: "STANDALONE" } }],
      },
      [VCS_WORKSPACES]: unusedVcs,
      [usage("organization/org-1/module", "module", "vcs", "vcs.id=='v1'")]: { data: [] },
      [usage("policy_set", "policy_set", "vcs", "vcs.id=='v1'")]: { data: [] },
    });
    const config = { headers: new AxiosHeaders() };
    jest.mocked(axiosInstance.delete).mockRejectedValueOnce(
      new AxiosError("Conflict", "ERR_BAD_REQUEST", config, undefined, {
        data: {},
        status: 409,
        statusText: "Conflict",
        headers: {},
        config,
      })
    );
    renderAt("/organizations/org-1/settings/vcs", "/organizations/:orgid/settings/vcs", <VCSSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete VCS provider corp-github" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "no workspace, module, policy set or shared repository webhook uses this provider"
    );
    fireEvent.change(within(dialog).getByLabelText("Type the name to confirm"), { target: { value: "corp-github" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete VCS provider" }));

    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/vcs/v1"));
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Could not delete corp-github: it is still in use\. A shared repository webhook/)
      )
    );
  });
});

describe("Add VCS provider", () => {
  const renderAdd = () =>
    renderAt(
      "/organizations/org-1/settings/vcs/new",
      "/organizations/:orgid/settings/vcs/new",
      <AddVCS setMode={jest.fn()} loadVCS={jest.fn()} />
    );

  it("picks a provider from tiles, then its edition, then shows the setup form", async () => {
    renderAdd();

    expect(screen.getAllByRole("radio")).toHaveLength(4 + 4);
    fireEvent.click(screen.getByRole("radio", { name: "GitLab" }));
    fireEvent.click(screen.getByRole("radio", { name: /GitLab Community Edition/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Register Terrakube on GitLab Community Edition" })
    ).toBeVisible();
    expect(screen.getByLabelText("Redirect URI")).toHaveValue(
      `https://terrakube-api.test/callback/v1/vcs/${fakeUuid(1)}`
    );
    expect(screen.getByRole("button", { name: "Copy Redirect URI" })).toBeInTheDocument();
    // Secrets are typed into a password field.
    expect(screen.getByLabelText("Secret")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Add and connect" })).toHaveClass("ant-btn-primary");
  });

  it("creates a GitHub App provider without the OAuth redirect", async () => {
    renderAdd();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "gh-app" } });
    fireEvent.change(screen.getByLabelText("App ID"), { target: { value: "970081" } });
    fireEvent.change(screen.getByLabelText("Private key (PKCS#8)"), {
      target: { value: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add VCS provider" }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    const [url, body] = jest.mocked(axiosInstance.post).mock.calls[0];
    expect(url).toBe("organization/org-1/vcs");
    expect(body).toMatchObject({
      data: {
        attributes: {
          name: "gh-app",
          vcsType: "GITHUB",
          connectionType: "STANDALONE",
          clientId: "970081",
          endpoint: "https://github.com",
          apiUrl: "https://api.github.com",
        },
      },
    });
  });

  it("reports an OAuth provider whose create response has no client ID instead of redirecting", async () => {
    const errorSpy = jest.spyOn(message, "error");
    const setMode = jest.fn();
    renderAt(
      "/organizations/org-1/settings/vcs/new",
      "/organizations/:orgid/settings/vcs/new",
      <AddVCS setMode={setMode} loadVCS={jest.fn()} />
    );
    fireEvent.click(screen.getByRole("radio", { name: "GitLab" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(await screen.findByPlaceholderText("GitLab"), { target: { value: "gitlab" } });
    fireEvent.change(screen.getByLabelText("Application ID"), { target: { value: "app-1" } });
    fireEvent.change(screen.getByLabelText("Secret"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Add and connect" }));

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "Could not add the VCS provider: the response did not include the provider's client ID"
      )
    );
    expect(setMode).not.toHaveBeenCalled();
  });

  it("sends self-managed GitLab editions to GitLab's OAuth page", () => {
    expect(getConnectUrl(VcsType.GITLAB, "id", "cb", "https://git.example.com")).toMatch(
      /^https:\/\/git\.example\.com\/oauth\/authorize\?client_id=id/
    );
  });
});

describe("Federated credentials", () => {
  it("lists issuer and audience in monospace and confirms deletes by name", async () => {
    const FEDERATED_LIST = "federated?fields[federated]=name,issuerUrl,audience";
    // The list only counts claims, so the count read asks for linkage alone.
    const FEDERATED_CLAIM_COUNTS = "federated/f1/claims?fields[federated_claim]=federated";
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === FEDERATED_CLAIM_COUNTS
              ? []
              : url === FEDERATED_LIST
                ? [{ id: "f1", attributes: { name: "CI_TEAM", issuerUrl: "https://issuer.test", audience: "tk" } }]
                : [],
        },
      })
    );
    renderAt(
      "/organizations/org-1/settings/federated-credentials",
      "/organizations/:orgid/settings/federated-credentials",
      <FederatedCredentials />
    );

    expect(await screen.findByText("https://issuer.test")).toHaveClass("resource-mono");
    expect(await screen.findByText("No claim conditions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete federated credential CI_TEAM" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Delete federated credential" })).toBeDisabled();
  });

  it("adds a claim condition with Enter without submitting, then saves it", async () => {
    const setMode = jest.fn();
    render(<EditFederatedCredential mode="create" setMode={setMode} loadFederated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "CI_TEAM" } });
    fireEvent.change(screen.getByLabelText("Issuer URL"), { target: { value: "https://issuer.test" } });
    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "tk" } });
    fireEvent.change(screen.getByLabelText("Claim key"), { target: { value: "repository_owner" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "acme" } });
    fireEvent.keyDown(screen.getByLabelText("Value"), { key: "Enter", code: "Enter", keyCode: 13 });

    expect(await within(screen.getByRole("table")).findByText("repository_owner")).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add federated credential" }));
    await waitFor(() => expect(setMode).toHaveBeenCalledWith("list"));
    expect(jest.mocked(axiosInstance.post).mock.calls.map((call) => call[0])).toEqual([
      "federated",
      "federated/new-1/claims",
    ]);
    expect(axiosInstance.post).toHaveBeenCalledWith(
      "federated",
      {
        data: {
          type: "federated",
          attributes: { name: "CI_TEAM", issuerUrl: "https://issuer.test", audience: "tk" },
        },
      },
      expect.anything()
    );
    expect(axiosInstance.post).toHaveBeenCalledWith(
      "federated/new-1/claims",
      { data: { type: "federated_claim", attributes: { claimKey: "repository_owner", claimValue: "acme" } } },
      expect.anything()
    );
  });

  it("patches the credential with the typed update body when editing", async () => {
    const FEDERATED_ONE = "federated/f1?fields[federated]=name,issuerUrl,audience";
    const FEDERATED_CLAIMS = "federated/f1/claims?fields[federated_claim]=claimKey,claimValue";
    get.mockImplementation((url: string) =>
      url === FEDERATED_ONE
        ? Promise.resolve({
            data: {
              data: { id: "f1", attributes: { name: "CI_TEAM", issuerUrl: "https://issuer.test", audience: "tk" } },
            },
          })
        : url === FEDERATED_CLAIMS
          ? Promise.resolve({
              data: { data: [{ id: "c1", attributes: { claimKey: "repository_owner", claimValue: "acme" } }] },
            })
          : Promise.reject(new Error(`Unexpected GET ${url}`))
    );

    render(<EditFederatedCredential mode="edit" setMode={jest.fn()} federatedId="f1" loadFederated={jest.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Issuer URL")).toHaveValue("https://issuer.test"));
    fireEvent.click(screen.getByRole("button", { name: "Update federated credential" }));

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "federated/f1",
        {
          data: {
            type: "federated",
            id: "f1",
            attributes: { name: "CI_TEAM", issuerUrl: "https://issuer.test", audience: "tk" },
          },
        },
        expect.anything()
      )
    );
  });
});
