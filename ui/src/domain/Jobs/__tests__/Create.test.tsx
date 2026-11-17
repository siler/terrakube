import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateJob } from "../Create";
import type { OrgTemplateRow } from "../../Workspaces/workspaceQuery";
import { ORGANIZATION_ARCHIVE, WORKSPACE_ARCHIVE } from "../../../config/actionTypes";

window._env_ = {
  REACT_APP_AUTHORITY: "http://localhost/authority",
  REACT_APP_CLIENT_ID: "client-id",
  REACT_APP_REDIRECT_URI: "http://localhost/redirect",
  REACT_APP_SCOPE: "openid",
  REACT_APP_TERRAKUBE_API_URL: "http://localhost:8080/api/v1",
  REACT_APP_TERRAKUBE_VERSION: "test",
  REACT_APP_REGISTRY_URI: "http://localhost:8080/registry",
};

type AxiosLikeResponse = { data?: unknown };

const getMock = jest.fn<Promise<AxiosLikeResponse>, unknown[]>();
const postMock = jest.fn<Promise<AxiosLikeResponse>, unknown[]>();
const navigateMock = jest.fn<void, unknown[]>();

const template = (id: string, name: string, description: string, tcl: string | null = null): OrgTemplateRow => ({
  id,
  name,
  description,
  tcl,
});

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  ...jest.requireActual<typeof import("../../../config/axiosConfig")>("../../../config/axiosConfig"),
  default: { get: (...args: unknown[]) => getMock(...args), post: (...args: unknown[]) => postMock(...args) },
  axiosClient: { get: (...args: unknown[]) => getMock(...args) },
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual<typeof import("react-router-dom")>("react-router-dom"),
  useNavigate: () => navigateMock,
}));

// The component reads the workspace it runs for from the session, as the workspace page sets it.
beforeEach(() => {
  sessionStorage.setItem(ORGANIZATION_ARCHIVE, "org-1");
  sessionStorage.setItem(WORKSPACE_ARCHIVE, "ws-1");
});

afterEach(() => {
  sessionStorage.clear();
});

describe("CreateJob Run now button", () => {
  beforeEach(() => {
    getMock.mockResolvedValue({
      data: { data: { id: "w-1", attributes: { branch: "main", defaultTemplate: undefined } } },
    });
  });

  const runNowButton = () => screen.getByRole("button", { name: /run now/i });

  it("enables Run now when there is no disabled reason (e.g. VCS workspace)", async () => {
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={[]} />);
    await waitFor(() => expect(runNowButton()).toBeEnabled());
  });

  it("disables Run now when a disabled reason is provided (unconfigured CLI/API workspace)", async () => {
    render(
      <CreateJob
        changeJob={jest.fn()}
        planJob={true}
        templates={[]}
        disabledReason="This CLI/API driven workspace has no applied configuration yet."
      />
    );
    await waitFor(() => expect(runNowButton()).toBeDisabled());
  });

  it("disables Run now when the user lacks plan permission", async () => {
    render(<CreateJob changeJob={jest.fn()} planJob={false} templates={[]} />);
    await waitFor(() => expect(runNowButton()).toBeDisabled());
  });
});

describe("CreateJob new run modal", () => {
  it("offers up to three templates as explained choices and warns about destroy", async () => {
    getMock.mockResolvedValue({
      data: { data: { id: "w-1", attributes: { branch: "main", defaultTemplate: "t-plan" } } },
    });
    const templates = [
      template("t-plan", "Plan", "Plan only"),
      template("t-apply", "Plan and Apply", "Plan, then apply"),
      template("t-destroy", "Terraform-Destroy", "Running terraform destroy"),
      template("t-cli", "Terraform-Plan/Apply-Cli", "CLI"),
    ];

    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={templates} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(await screen.findByText("Start a run")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /^Plan Plan only/ })).toBeChecked();
    expect(screen.getByText("Destroys every resource this workspace manages.")).toBeInTheDocument();
    expect(screen.queryByText("Terraform-Plan/Apply-Cli")).not.toBeInTheDocument();
  });
});

describe("CreateJob with templates from its parent", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({
      data: { data: { id: "w-1", attributes: { branch: "main", defaultTemplate: "t-plan" } } },
    });
  });

  const templates = [template("t-plan", "Plan", "Plan only"), template("t-cli", "Terraform-Plan/Destroy-Cli", "CLI")];

  it("offers the given templates without fetching them, still hiding CLI templates", async () => {
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={templates} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(await screen.findByRole("radio", { name: /^Plan Plan only/ })).toBeInTheDocument();
    expect(screen.queryByText("Terraform-Plan/Destroy-Cli")).not.toBeInTheDocument();
    const urls = getMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/template"))).toBe(false);
  });

  it("asks only for the workspace fields it reads, on mount and again on each Run now", async () => {
    sessionStorage.setItem(ORGANIZATION_ARCHIVE, "org-1");
    sessionStorage.setItem(WORKSPACE_ARCHIVE, "ws-1");
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={templates} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    // The typed query sends one microtask after then, so flush before counting the second GET.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    });

    const workspaceUrls = getMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/workspace/"));
    expect(workspaceUrls).toEqual([
      "organization/org-1/workspace/ws-1?fields[workspace]=branch,defaultTemplate,restrictApplyToConfiguredBranch",
      "organization/org-1/workspace/ws-1?fields[workspace]=branch,defaultTemplate,restrictApplyToConfiguredBranch",
    ]);
    sessionStorage.clear();
  });

  it("waits for the parent instead of fetching while it loads the templates", async () => {
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={null} />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    const urls = getMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/template"))).toBe(false);
  });
});

describe("CreateJob with templates someone else changed", () => {
  const plan = template("t-plan", "Plan", "Plan only");
  const apply = template("t-apply", "Plan and Apply", "Plan, then apply");

  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({
      data: { data: { id: "w-1", attributes: { branch: "main", defaultTemplate: "t-plan" } } },
    });
  });

  it("asks the parent to refresh the templates each time Run now opens", async () => {
    const onOpen = jest.fn();
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={[plan]} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("moves the selection off a template the refresh shows was deleted", async () => {
    const { rerender } = render(<CreateJob changeJob={jest.fn()} planJob={true} templates={[plan, apply]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    expect(await screen.findByRole("radio", { name: /^Plan Plan only/ })).toBeChecked();

    rerender(<CreateJob changeJob={jest.fn()} planJob={true} templates={[apply]} />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Plan and Apply/ })).toBeChecked());
  });
});

describe("CreateJob on a workspace that restricts apply to its branch", () => {
  const tcl = (yaml: string) => window.btoa(yaml);
  const plan = tcl('flow:\n  - type: "terraformPlan"\n    step: 100\n');
  const planAndApply = tcl(
    'flow:\n  - type: "terraformPlan"\n    step: 100\n  - type: "terraformApply"\n    step: 200\n'
  );

  const planAndApplyTemplate = template("t-apply", "Plan and Apply", "Plan, then apply", planAndApply);
  const bothTemplates = [template("t-plan", "Plan", "Plan only", plan), planAndApplyTemplate];

  beforeEach(() => {
    getMock.mockResolvedValue({
      data: {
        data: {
          id: "w-1",
          attributes: { branch: "main, develop", defaultTemplate: "t-apply", restrictApplyToConfiguredBranch: true },
        },
      },
    });
  });

  const open = async (templates: OrgTemplateRow[] = bothTemplates) => {
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={templates} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    await screen.findByText("Start a run");
  };

  it("offers every template on the first branch of the workspace", async () => {
    await open();

    expect(await screen.findByRole("radio", { name: /^Plan and Apply/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Plan Plan only/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Branch")).toHaveValue("main");
  });

  it("offers only plan-only templates on another branch", async () => {
    await open();

    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "feature/x" } });

    await waitFor(() => expect(screen.queryByRole("radio", { name: /^Plan and Apply/ })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Plan Plan only/ })).toBeChecked());
    expect(screen.getByText(/only plan-only templates are offered/)).toBeInTheDocument();
  });

  it("keeps every template when the branch box is emptied, as the API treats it as the workspace branch", async () => {
    await open();

    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "" } });

    expect(screen.getByRole("radio", { name: /^Plan and Apply/ })).toBeInTheDocument();
    expect(screen.queryByText(/only plan-only templates are offered/)).not.toBeInTheDocument();
  });

  it("explains why nothing can be chosen when the organization has no plan-only template", async () => {
    await open([planAndApplyTemplate]);

    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "feature/x" } });

    expect(await screen.findByText("No plan-only templates available in this organization")).toBeInTheDocument();
  });
});

describe("CreateJob without a workspace in the session", () => {
  it("does not request a workspace when the organization id is missing", async () => {
    getMock.mockReset();
    sessionStorage.removeItem(ORGANIZATION_ARCHIVE);
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("CreateJob failures", () => {
  const plan = template("t-plan", "Plan", "Plan only");

  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it("reports a failed workspace load instead of leaving the rejection unhandled", async () => {
    getMock.mockRejectedValue(new Error("network down"));
    render(<CreateJob changeJob={jest.fn()} planJob={true} templates={[plan]} />);

    expect(await screen.findByText("Could not load the workspace branch: network down")).toBeInTheDocument();
  });

  const startRun = async (changeJob: jest.Mock) => {
    getMock.mockResolvedValue({
      data: { data: { id: "w-1", attributes: { branch: "main", defaultTemplate: "t-plan" } } },
    });
    render(<CreateJob changeJob={changeJob} planJob={true} templates={[plan]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Plan Plan only/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
  };

  it("opens the run the server created", async () => {
    postMock.mockResolvedValue({ data: { data: { type: "job", id: "42" } } });
    const changeJob = jest.fn();
    await startRun(changeJob);

    await waitFor(() => expect(changeJob).toHaveBeenCalledWith("42"));
    expect(navigateMock).toHaveBeenCalledWith("/organizations/org-1/workspaces/ws-1/runs/42");
  });

  it("reports a create response without a run id instead of navigating to an undefined run", async () => {
    postMock.mockResolvedValue({ data: {} });
    const changeJob = jest.fn();
    await startRun(changeJob);

    expect(
      await screen.findByText("Could not start the run: the server did not return the new run id")
    ).toBeInTheDocument();
    expect(changeJob).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
