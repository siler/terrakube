import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WorkspaceWebhook } from "../Webhook";
import axiosInstance from "../../../../config/axiosConfig";
import { VcsType } from "../../../generated/apiResources";
import type { OrgTemplateRow, WorkspacePageRow } from "../../workspaceQuery";
import { isRecord, isUnknownArray } from "@/modules/utils/typeGuards";
import { workspacePageRow } from "@/testUtils/workspacePageRow";
import { fakeUuid } from "@/testUtils/fakeUuid";

jest.mock("../../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message ? err.message : "Error"),
}));
jest.mock("../../Workspaces", () => ({ atomicHeader: {} }));
let uuidCount = 0;
jest.spyOn(crypto, "randomUUID").mockImplementation(() => fakeUuid(++uuidCount));

const workspace = (related: Partial<WorkspacePageRow> = {}) =>
  workspacePageRow({ id: "ws-1", name: "prod", organization: { id: "org-1", name: "acme" }, ...related });

const withVcs = workspace({
  vcs: { id: "vcs-1", vcsType: "GITHUB" },
  webhook: { id: "hook-1" },
});

const templates: OrgTemplateRow[] = [{ id: "tpl-1", name: "Plan and apply", tcl: null, description: null }];

const renderWebhook = (ws = withVcs) =>
  render(
    <MemoryRouter>
      <WorkspaceWebhook
        organizationId="org-1"
        workspace={ws}
        vcsProvider={VcsType.GITHUB}
        orgTemplates={templates}
        manageWorkspace
      />
    </MemoryRouter>
  );

const get = jest.mocked(axiosInstance.get);

const getUrls = () => get.mock.calls.map(([url]) => url);

const record = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`Expected an object, got ${JSON.stringify(value)}`);
  }
  return value;
};

/** The `data` member of a JSON:API body or atomic operation. */
const dataOf = (body: unknown) => record(record(body).data);

/** The attributes a JSON:API body or atomic operation sends. */
const attributesOf = (body: unknown) => record(dataOf(body).attributes);

/** The atomic operations the given POST to /operations sent. */
const postedOperations = (call: number) => {
  const body: unknown = jest.mocked(axiosInstance.post).mock.calls[call]?.[1];
  const operations = record(body)["atomic:operations"];
  if (!isUnknownArray(operations)) {
    throw new Error(`Expected atomic operations, got ${JSON.stringify(body)}`);
  }
  return operations.map(record);
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) =>
    Promise.resolve(
      url.includes("/events?")
        ? {
            data: {
              data: [
                {
                  id: "ev-1",
                  attributes: {
                    priority: 1,
                    event: "PUSH",
                    branch: "main",
                    path: "terraform/*",
                    pathType: "PATTERN",
                    templateId: "tpl-1",
                  },
                },
              ],
            },
          }
        : { data: { data: { id: "w-1", attributes: { remoteHookId: "4242", migratedV2: false } } } }
    )
  );
  jest.mocked(axiosInstance.post).mockResolvedValue({ status: 200 });
  jest.mocked(axiosInstance.delete).mockResolvedValue({ status: 204 });
});

describe("WorkspaceWebhook", () => {
  it("explains that webhooks need a VCS connection instead of offering the switch", () => {
    renderWebhook(workspace());

    expect(screen.getByText(/Webhooks need a VCS connection/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a VCS provider in General settings" })).toHaveAttribute(
      "href",
      "/organizations/org-1/workspaces/ws-1/settings/general"
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  it("summarizes each trigger in one row and labels every control", async () => {
    renderWebhook();

    expect(screen.getByRole("switch", { name: "Enable webhook" })).toBeChecked();
    expect(await screen.findByText("Triggers (1)")).toBeInTheDocument();
    expect(getUrls()).toEqual([
      "organization/org-1/workspace/ws-1/webhook/hook-1?fields[webhook]=remoteHookId,migratedV2,syncError",
      "organization/org-1/workspace/ws-1/webhook/hook-1/events?fields[webhook_event]=priority,event,branch,pathType,path,templateId,prWorkflowEnabled,prApplyEnabled",
    ]);
    expect(screen.getByLabelText("Webhook ID")).toHaveValue("hook-1");
    expect(screen.getByLabelText("Repository webhook ID")).toHaveValue("4242");
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Push · main · terraform/* → Plan and apply");

    const edit = within(row).getByRole("button", { name: "Edit trigger 1" });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(edit);
    expect(edit).toHaveAttribute("aria-expanded", "true");

    for (const label of ["Event", "Branches", "Paths", "Template"]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    expect(screen.getByRole("radio", { name: /^Wildcards/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Regex/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Any file/ })).toBeInTheDocument();
  });

  it("confirms a delete and sends it only when the webhook is saved", async () => {
    renderWebhook();
    await screen.findByText("Triggers (1)");

    fireEvent.click(screen.getByRole("button", { name: "Delete trigger 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete trigger")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("listitem")).not.toBeInTheDocument());
    expect(axiosInstance.delete).not.toHaveBeenCalled();

    // An empty list is not saveable: the error is shown inline.
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    expect(await screen.findByText("Add at least one trigger.")).toBeInTheDocument();
    expect(axiosInstance.delete).not.toHaveBeenCalled();
  });

  it("deletes removed triggers and saves the rest in one atomic request", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/events?")
          ? {
              data: {
                data: ["ev-1", "ev-2"].map((id, i) => ({
                  id,
                  attributes: {
                    priority: i + 1,
                    event: "PUSH",
                    branch: `b${i}`,
                    path: "x/*",
                    pathType: "PATTERN",
                    templateId: "tpl-1",
                  },
                })),
              },
            }
          : { data: { data: { id: "w-1", attributes: { remoteHookId: "4242" } } } }
      )
    );
    renderWebhook();
    await screen.findByText("Triggers (2)");

    fireEvent.click(screen.getByRole("button", { name: "Delete trigger 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
    expect(axiosInstance.delete).not.toHaveBeenCalled();
    const ops = postedOperations(0);
    // Events are linked by their href under the webhook; the webhook operation carries no linkage of its own.
    expect(ops).toEqual([
      { op: "remove", href: "/organization/org-1/workspace/ws-1/webhook/hook-1/events/ev-1" },
      { op: "update", href: "/organization/org-1/workspace/ws-1/webhook", data: { type: "webhook", id: "hook-1" } },
      {
        op: "update",
        href: "/organization/org-1/workspace/ws-1/webhook/hook-1/events/ev-2",
        data: {
          type: "webhook_event",
          id: "ev-2",
          attributes: {
            priority: 1,
            event: "PUSH",
            branch: "b1",
            path: "x/*",
            pathType: "PATTERN",
            templateId: "tpl-1",
            prWorkflowEnabled: false,
            prApplyEnabled: false,
          },
        },
      },
    ]);
  });

  it("keeps a deletion pending when the save fails, so the next save sends it again", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/events?")
          ? {
              data: {
                data: ["ev-1", "ev-2"].map((id, i) => ({
                  id,
                  attributes: {
                    priority: i + 1,
                    event: "PUSH",
                    branch: `b${i}`,
                    path: "x/*",
                    pathType: "PATTERN",
                    templateId: "tpl-1",
                  },
                })),
              },
            }
          : { data: { data: { id: "w-1", attributes: { remoteHookId: "4242" } } } }
      )
    );
    jest.mocked(axiosInstance.post).mockRejectedValueOnce(new Error("Invalid value"));
    renderWebhook();
    await screen.findByText("Triggers (2)");

    fireEvent.click(screen.getByRole("button", { name: "Delete trigger 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    expect(await screen.findByText("Couldn't save the webhook: Invalid value")).toBeInTheDocument();
    expect(axiosInstance.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(2));
    const ops = postedOperations(1);
    expect(ops[0]).toEqual({ op: "remove", href: "/organization/org-1/workspace/ws-1/webhook/hook-1/events/ev-1" });
  });

  it("shows required-field errors inline on a new trigger", async () => {
    renderWebhook(workspace({ vcs: { id: "vcs-1", vcsType: "GITHUB" } }));

    const toggle = screen.getByRole("switch", { name: "Enable webhook" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(await screen.findByText("Choose an event.")).toBeInTheDocument();
    expect(screen.getByText("Enter at least one branch regex.")).toBeInTheDocument();
    expect(screen.getByText("Choose a template.")).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  describe("shared webhook", () => {
    const patch = () => jest.mocked(axiosInstance.patch);
    const mockWebhook = (attributes: Record<string, unknown>) =>
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes("/events?")
            ? { data: { data: [] } }
            : { data: { data: { id: "w-1", attributes: { remoteHookId: "4242", ...attributes } } } }
        )
      );

    it("migrates a dedicated webhook to a shared one", async () => {
      patch().mockResolvedValue({ status: 200 });
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Migrate to shared webhook" }));
      fireEvent.click(await screen.findByRole("button", { name: "Migrate" }));

      await waitFor(() => expect(patch()).toHaveBeenCalledTimes(1));
      expect(attributesOf(patch().mock.calls[0]?.[1])).toEqual({ migratedV2: true });
      expect(await screen.findByText("Shared with every workspace on this repository.")).toBeInTheDocument();
      expect(screen.queryByLabelText("Repository webhook ID")).not.toBeInTheDocument();
    });

    it("switches a shared webhook back to one for the workspace and shows its new ID", async () => {
      mockWebhook({ migratedV2: true, remoteHookId: null });
      patch().mockResolvedValue({ status: 200 });
      renderWebhook();

      const revert = await screen.findByRole("button", { name: "Switch to a webhook for this workspace" });
      mockWebhook({ migratedV2: false, remoteHookId: "9001" });
      fireEvent.click(revert);
      fireEvent.click(await screen.findByRole("button", { name: "Switch" }));

      await waitFor(() => expect(patch()).toHaveBeenCalledTimes(1));
      expect(attributesOf(patch().mock.calls[0]?.[1])).toEqual({ migratedV2: false });
      expect(await screen.findByLabelText("Repository webhook ID")).toHaveValue("9001");
    });

    it("says why the shared repository webhook could not be synced", async () => {
      mockWebhook({ migratedV2: true, remoteHookId: null, syncError: "The VCS connection does not have permission." });
      renderWebhook();

      expect(await screen.findByText("The repository webhook is not working")).toBeInTheDocument();
      expect(screen.getByText(/The VCS connection does not have permission\./)).toBeInTheDocument();
    });

    it.each([
      [{ migratedV2: true, remoteHookId: null, syncError: null }],
      [{ migratedV2: false, remoteHookId: "1", syncError: "old" }],
    ])("shows no sync problem when the shared webhook works or the webhook is not shared (%p)", async (attributes) => {
      mockWebhook(attributes);
      renderWebhook();

      await screen.findByLabelText("Webhook ID");
      expect(screen.queryByText("The repository webhook is not working")).not.toBeInTheDocument();
    });

    it("creates a new webhook as a shared one when asked", async () => {
      renderWebhook(workspace({ vcs: { id: "vcs-1", vcsType: "GITHUB" } }));
      fireEvent.click(screen.getByRole("switch", { name: "Enable webhook" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Share one webhook across this repository" }));

      fireEvent.click(await screen.findByLabelText("Any branch"));
      fireEvent.mouseDown(screen.getByLabelText("Event"));
      fireEvent.click(await screen.findByTitle("Push"));
      fireEvent.mouseDown(screen.getByLabelText("Template"));
      fireEvent.click(await screen.findByTitle("Plan and apply"));
      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
      const ops = postedOperations(0);
      const webhookId = dataOf(ops[0]).id;
      expect(typeof webhookId).toBe("string");
      const eventData = dataOf(ops[1]);
      expect(typeof eventData.id).toBe("string");
      expect(isRecord(eventData.attributes)).toBe(true);
      expect(ops).toEqual([
        {
          op: "add",
          href: "/organization/org-1/workspace/ws-1/webhook",
          data: { type: "webhook", id: webhookId, attributes: { migratedV2: true } },
        },
        {
          op: "add",
          href: `/organization/org-1/workspace/ws-1/webhook/${String(webhookId)}/events`,
          data: { type: "webhook_event", id: eventData.id, attributes: eventData.attributes },
        },
      ]);
    });

    it("offers no shared webhook for a provider that can't share one", async () => {
      render(
        <MemoryRouter>
          <WorkspaceWebhook
            organizationId="org-1"
            workspace={withVcs}
            vcsProvider={VcsType.BITBUCKET}
            orgTemplates={templates}
            manageWorkspace
          />
        </MemoryRouter>
      );
      await screen.findByText("Triggers (1)");

      expect(screen.queryByRole("button", { name: /shared webhook/i })).not.toBeInTheDocument();
    });
  });

  describe("triggers", () => {
    const loadEvents = (events: Record<string, unknown>[]) =>
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes("/events?")
            ? { data: { data: events.map((attributes, i) => ({ id: `ev-${i + 1}`, attributes })) } }
            : { data: { data: { id: "w-1", attributes: { remoteHookId: "4242" } } } }
        )
      );
    const base = { event: "PUSH", templateId: "tpl-1", pathType: "REGEX", prWorkflowEnabled: false };
    const savedOps = () => postedOperations(0);

    it("shows each regex as its own chip and sends them back comma-separated", async () => {
      loadEvents([{ ...base, priority: 0, branch: "master", path: "^environments/.*$,^modules/.*$" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Edit trigger 1" }));
      expect(screen.getByText("^environments/.*$")).toBeInTheDocument();
      expect(screen.getByText("^modules/.*$")).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /^Regex/ })).toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
      expect(attributesOf(savedOps()[1])).toMatchObject({
        priority: 1,
        branch: "master",
        path: "^environments/.*$,^modules/.*$",
        pathType: "REGEX",
      });
    });

    it("rejects an invalid regex and says which one", async () => {
      loadEvents([{ ...base, priority: 0, branch: "main", path: "terraform/(" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      expect(await screen.findByText('"terraform/(" is not a valid regex.')).toBeInTheDocument();
      expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it("tests a sample against the whole value", async () => {
      loadEvents([{ ...base, priority: 0, branch: "release/.*", path: "modules/.*" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");
      fireEvent.click(screen.getByRole("button", { name: "Edit trigger 1" }));
      fireEvent.click(screen.getByText("Test patterns"));

      fireEvent.change(screen.getByLabelText("Try a branch name"), { target: { value: "release/1.2" } });
      expect(screen.getByText("Matches release/.*")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Try a file path"), { target: { value: "docs/modules/a.tf" } });
      expect(screen.getByText("No pattern matches.")).toBeInTheDocument();
    });

    it("warns, without blocking, when a wildcard is typed into a regex", async () => {
      loadEvents([{ ...base, priority: 0, branch: "main", path: "environments/*" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      expect(await screen.findByText(/means a slash repeated, not any file/)).toBeInTheDocument();
      expect(screen.getByText(/Use "environments\/\.\*"/)).toBeInTheDocument();
      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
    });

    it("saves 'any branch' and 'any file' as catch-all patterns and loads them back", async () => {
      loadEvents([{ ...base, priority: 0, branch: ".*", path: "**", pathType: "PATTERN" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");

      expect(screen.getByRole("listitem")).toHaveTextContent("Push · any branch · any file → Plan and apply");
      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
      expect(attributesOf(savedOps()[1])).toMatchObject({ branch: ".*", path: "**", pathType: "PATTERN" });
    });

    it("hides the path filter for a release", async () => {
      loadEvents([{ ...base, event: "RELEASE", priority: 0, branch: "v.*", path: "**", pathType: "PATTERN" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");
      fireEvent.click(screen.getByRole("button", { name: "Edit trigger 1" }));

      expect(screen.getByLabelText("Release tags")).toBeInTheDocument();
      expect(screen.queryByText("Changed files")).not.toBeInTheDocument();
    });

    it("saves the list order as the priority", async () => {
      loadEvents([
        { ...base, priority: 5, branch: "first", path: "a/*", pathType: "PATTERN" },
        { ...base, priority: 9, branch: "second", path: "b/*", pathType: "PATTERN" },
      ]);
      renderWebhook();
      await screen.findByText("Triggers (2)");

      fireEvent.click(screen.getByRole("button", { name: "Check trigger 2 earlier" }));
      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
      expect(
        savedOps()
          .slice(1)
          .map((op) => [dataOf(op).id, attributesOf(op).priority])
      ).toEqual([
        ["ev-2", 1],
        ["ev-1", 2],
      ]);
    });

    it("saves the event chosen in the select as the API's event type", async () => {
      loadEvents([{ ...base, priority: 0, branch: "main", path: "a/*", pathType: "PATTERN" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Edit trigger 1" }));
      fireEvent.mouseDown(screen.getByLabelText("Event"));
      fireEvent.click(await screen.findByTitle("Pull request"));
      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
      expect(attributesOf(savedOps()[1]).event).toBe("PULL_REQUEST");
    });

    it("keeps an event the select doesn't offer when saving", async () => {
      loadEvents([{ ...base, event: "PR_COMMENT", priority: 0, branch: "main", path: "a/*", pathType: "PATTERN" }]);
      renderWebhook();
      expect(await screen.findByText(/^New trigger/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledTimes(1));
      expect(attributesOf(savedOps()[1]).event).toBe("PR_COMMENT");
    });

    it("explains a 424 as missing webhook permissions on the VCS connection", async () => {
      loadEvents([{ ...base, priority: 0, branch: "main", path: "a/*", pathType: "PATTERN" }]);
      jest.mocked(axiosInstance.post).mockRejectedValueOnce({ response: { status: 424 } });
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));

      expect(await screen.findByText(/The VCS connection can't manage webhooks/)).toBeInTheDocument();
    });

    it("duplicates a trigger as a new unsaved one", async () => {
      loadEvents([{ ...base, priority: 0, branch: "main", path: "a/*", pathType: "PATTERN" }]);
      renderWebhook();
      await screen.findByText("Triggers (1)");

      fireEvent.click(screen.getByRole("button", { name: "Duplicate trigger 1" }));

      expect(await screen.findByText("Triggers (2)")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("Not saved");
    });
  });

  describe("on a workspace that restricts apply to its configured branch", () => {
    const restricted = (branch = "main") => {
      return { ...withVcs, branch, restrictApplyToConfiguredBranch: true };
    };
    const mockEvent = (attributes: Record<string, unknown>) =>
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes("/events?")
            ? {
                data: {
                  data: [{ id: "ev-1", attributes: { priority: 1, path: "*", templateId: "tpl-1", ...attributes } }],
                },
              }
            : { data: { data: { id: "w-1", attributes: { remoteHookId: "4242", migratedV2: false } } } }
        )
      );
    const openTrigger = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Edit trigger 1" }));
    };

    it("warns that a pull request trigger with a template that applies starts no run, and turns off apply by comment", async () => {
      mockEvent({ event: "PULL_REQUEST", branch: "main", prWorkflowEnabled: true, prApplyEnabled: true });
      renderWebhook(restricted());
      await openTrigger();

      expect(screen.getByText(/a pull request can only run a plan-only template/)).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: /Allow apply from a pull request comment/ })).toBeDisabled();
    });

    it("warns about a push trigger that matches other branches than the workspace branch", async () => {
      mockEvent({ event: "PUSH", branch: "main,develop" });
      renderWebhook(restricted());
      await openTrigger();

      expect(
        screen.getByText(/A push to any other branch this trigger matches will not start a run/)
      ).toBeInTheDocument();
    });

    it("says nothing for a push trigger on the workspace branch only", async () => {
      mockEvent({ event: "PUSH", branch: "main" });
      renderWebhook(restricted());
      await openTrigger();

      expect(screen.queryByText(/will not start a run/)).not.toBeInTheDocument();
    });

    it("says nothing for a release trigger", async () => {
      mockEvent({ event: "RELEASE", branch: "*" });
      renderWebhook(restricted());
      await openTrigger();

      expect(screen.queryByText(/will not start a run/)).not.toBeInTheDocument();
    });

    it("mentions PR source branch name in branch helper text for pull request trigger", async () => {
      mockEvent({ event: "PULL_REQUEST", branch: "main" });
      renderWebhook();
      await openTrigger();

      expect(screen.getByText(/Regexes matching the whole PR source branch name/)).toBeInTheDocument();
    });
  });
});
