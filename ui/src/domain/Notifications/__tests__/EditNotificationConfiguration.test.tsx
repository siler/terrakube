import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import axiosInstance, { getErrorMessage } from "@/config/axiosConfig";
import { apiPost } from "@/modules/api/apiWrapper";
import { EditNotificationConfiguration } from "../EditNotificationConfiguration";
import { requestAttributes } from "@/testUtils/requestBody";

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  // get() defaults to resolving an empty template list - the component fetches templates for
  // the "3. Templates" filter unconditionally on mount, so an unconfigured jest.fn() (which
  // returns undefined, not a Promise) would throw synchronously on the .then() call.
  default: {
    post: jest.fn(),
    patch: jest.fn(),
    get: jest.fn().mockResolvedValue({ data: { data: [] } }),
    delete: jest.fn(),
  },
  getErrorMessage: jest.fn(() => "error"),
}));
jest.mock("@/modules/api/apiWrapper", () => ({ apiPost: jest.fn() }));

// ChannelPicker renders clickable cards (role="radio"), not an antd Select -
// clicking the card's visible label text bubbles up to its onClick handler.
const selectChannel = (label: string) => {
  fireEvent.click(screen.getByText(label));
};

describe("EditNotificationConfiguration", () => {
  beforeEach(() => {
    jest.mocked(axiosInstance.post).mockReset();
  });

  it("creates a workspace-scoped configuration with selected triggers", async () => {
    const onDone = jest.fn();
    jest.mocked(axiosInstance.post).mockResolvedValue({ status: 201, data: { data: { id: "new-config" } } });

    render(<EditNotificationConfiguration orgId="org-1" workspaceId="ws-1" mode="create" onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Prod Alerts" } });
    selectChannel("Slack");
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://hooks.slack.com/services/X" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Failed" }));

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    const [url, body] = jest.mocked(axiosInstance.post).mock.calls[0];
    expect(url).toBe("organization/org-1/workspace/ws-1/notificationConfiguration");
    expect(requestAttributes(body).name).toBe("Prod Alerts");
  });

  it("reports a create response without an id instead of saving triggers under an undefined configuration", async () => {
    const onDone = jest.fn();
    jest.mocked(axiosInstance.patch).mockClear();
    jest.mocked(getErrorMessage).mockClear();
    jest.mocked(axiosInstance.post).mockResolvedValue({ status: 201, data: {} });

    render(<EditNotificationConfiguration orgId="org-1" workspaceId="ws-1" mode="create" onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Prod Alerts" } });
    selectChannel("Slack");
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://hooks.slack.com/services/X" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Failed" }));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(getErrorMessage).toHaveBeenCalled());
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    expect(axiosInstance.patch).not.toHaveBeenCalledWith(
      expect.stringContaining("/relationships/templates"),
      expect.anything(),
      expect.anything()
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("'select all' toggles every checkbox in that trigger group", async () => {
    render(<EditNotificationConfiguration orgId="org-1" workspaceId="ws-1" mode="create" onDone={jest.fn()} />);

    const erroredGroup = within(screen.getByTestId("trigger-group-errored"));

    expect(erroredGroup.getByRole("checkbox", { name: "Failed" })).not.toBeChecked();
    expect(erroredGroup.getByRole("checkbox", { name: "Rejected" })).not.toBeChecked();
    expect(erroredGroup.getByRole("checkbox", { name: "Cancelled" })).not.toBeChecked();

    fireEvent.click(erroredGroup.getByRole("button", { name: "Select all" }));

    expect(erroredGroup.getByRole("checkbox", { name: "Failed" })).toBeChecked();
    expect(erroredGroup.getByRole("checkbox", { name: "Rejected" })).toBeChecked();
    expect(erroredGroup.getByRole("checkbox", { name: "Cancelled" })).toBeChecked();

    fireEvent.click(erroredGroup.getByRole("button", { name: "Clear" }));

    expect(erroredGroup.getByRole("checkbox", { name: "Failed" })).not.toBeChecked();
  });

  it("sends an ad-hoc test scoped to the organization before the configuration is saved", async () => {
    jest.mocked(axiosInstance.post).mockResolvedValue({ status: 200 });

    render(<EditNotificationConfiguration orgId="org-1" workspaceId="ws-1" mode="create" onDone={jest.fn()} />);

    selectChannel("Webhook");
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://example.com/hook" },
    });

    // The button's disabled state reads Form.useWatch's channelType/destinationUrl,
    // which lags a render behind the fireEvent calls above by one tick - wait for it
    // to actually become enabled instead of racing a click against a stale disabled prop.
    const sendTestButton = screen.getByRole("button", { name: /send test notification/i });
    await waitFor(() => expect(sendTestButton).not.toBeDisabled());
    fireEvent.click(sendTestButton);

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    const [url, body] = jest.mocked(axiosInstance.post).mock.calls[0];
    expect(url).toContain("/notification/v1/organization/org-1/configuration/test");
    expect(body).toMatchObject({ channelType: "WEBHOOK", destinationUrl: "https://example.com/hook" });

    expect(await screen.findByText("Test notification delivered successfully")).toBeInTheDocument();
  });

  it("blocks the test until Channel and Destination URL are filled in", async () => {
    render(<EditNotificationConfiguration orgId="org-1" workspaceId="ws-1" mode="create" onDone={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /send test notification/i }));

    await waitFor(() => expect(axiosInstance.post).not.toHaveBeenCalled());
  });

  it("shows the org-wide-default banner when editing a config with no workspace, regardless of the viewing context", async () => {
    // Regression test: the config being edited has no workspace (an org-wide default), even
    // though this render was opened with a workspaceId prop - as it would be if opened from a
    // workspace's merged list view. The banner must reflect the config's actual scope, not the
    // prop, or editing an org default from a workspace page looks exactly like a
    // workspace-only edit and silently changes behavior for every other workspace too.
    (apiPost as jest.Mock).mockResolvedValue({
      data: {
        notification_configuration: {
          edges: [
            {
              node: {
                name: "Org Default",
                channelType: "SLACK",
                destinationUrl: "https://hooks.slack.com/services/X",
                active: true,
                workspace: { edges: [] },
                triggers: { edges: [] },
              },
            },
          ],
        },
      },
    });

    render(
      <EditNotificationConfiguration
        orgId="org-1"
        workspaceId="ws-1"
        mode="edit"
        configId="config-1"
        onDone={jest.fn()}
      />
    );

    expect(await screen.findByText("Organization-wide default")).toBeInTheDocument();
    expect(screen.queryByText("This workspace only")).not.toBeInTheDocument();
  });

  it("shows the workspace-only banner when editing a config that does have a workspace", async () => {
    (apiPost as jest.Mock).mockResolvedValue({
      data: {
        notification_configuration: {
          edges: [
            {
              node: {
                name: "Team Alerts",
                channelType: "SLACK",
                destinationUrl: "https://hooks.slack.com/services/X",
                active: true,
                workspace: { edges: [{ node: { id: "ws-1" } }] },
                triggers: { edges: [] },
              },
            },
          ],
        },
      },
    });

    render(
      <EditNotificationConfiguration
        orgId="org-1"
        workspaceId="ws-1"
        mode="edit"
        configId="config-1"
        onDone={jest.fn()}
      />
    );

    expect(await screen.findByText("This workspace only")).toBeInTheDocument();
    expect(screen.queryByText("Organization-wide default")).not.toBeInTheDocument();
  });

  it("renders informational tooltips clarifying OPA policy reviews and violations on relevant triggers", async () => {
    render(<EditNotificationConfiguration orgId="org-1" mode="create" onDone={jest.fn()} />);

    const attentionGroup = within(await screen.findByTestId("trigger-group-needs-attention"));
    expect(attentionGroup.getByRole("checkbox", { name: "Waiting for approval" })).toBeInTheDocument();
    expect(attentionGroup.getByRole("img", { name: "info-circle" })).toBeInTheDocument();

    const erroredGroup = within(screen.getByTestId("trigger-group-errored"));
    expect(erroredGroup.getByRole("checkbox", { name: "Failed" })).toBeInTheDocument();
    expect(erroredGroup.getByRole("img", { name: "info-circle" })).toBeInTheDocument();
  });

  it("deletes an existing configuration from the danger zone after confirmation", async () => {
    (apiPost as jest.Mock).mockResolvedValue({
      data: {
        notification_configuration: {
          edges: [{ node: { name: "Prod", channelType: "SLACK", active: true, workspace: { edges: [] } } }],
        },
      },
    });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    const onDone = jest.fn();

    render(<EditNotificationConfiguration orgId="org-1" mode="edit" configId="config-1" onDone={onDone} />);

    expect(await screen.findByRole("button", { name: "Update notification" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete this notification" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete this notification" })
    );

    await waitFor(() =>
      expect(axiosInstance.delete).toHaveBeenCalledWith("notification_configuration/config-1", {
        headers: { "Content-Type": undefined },
      })
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  const editing = (workspace: { edges: { node: { id: string } }[] }) =>
    (apiPost as jest.Mock).mockResolvedValue({
      data: {
        notification_configuration: {
          edges: [{ node: { name: "Prod", channelType: "SLACK", active: true, workspace } }],
        },
      },
    });

  it("disables saving and deleting without the manage permission", async () => {
    editing({ edges: [] });
    render(
      <EditNotificationConfiguration
        orgId="org-1"
        mode="edit"
        configId="config-1"
        onDone={jest.fn()}
        managePermission={false}
      />
    );

    expect(await screen.findByRole("button", { name: "Update notification" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete this notification" })).toBeDisabled();
  });

  it("hides the danger zone for an organization-wide default opened from a workspace", async () => {
    editing({ edges: [] });
    render(
      <EditNotificationConfiguration
        orgId="org-1"
        workspaceId="ws-1"
        mode="edit"
        configId="config-1"
        onDone={jest.fn()}
      />
    );

    expect(await screen.findByText("Organization-wide default")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete this notification" })).not.toBeInTheDocument();
  });

  it("has no danger zone while creating", () => {
    render(<EditNotificationConfiguration orgId="org-1" mode="create" onDone={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Create notification" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete this notification" })).not.toBeInTheDocument();
  });

  it("leaves the stored signing secret alone when the field is cleared before updating", async () => {
    jest.mocked(axiosInstance.patch).mockReset().mockResolvedValue({ data: {} });
    (apiPost as jest.Mock).mockResolvedValue({
      data: {
        notification_configuration: {
          edges: [
            {
              node: {
                name: "Hook",
                channelType: "WEBHOOK",
                destinationUrl: "https://example.com/hook",
                active: true,
                workspace: { edges: [] },
                triggers: { edges: [{ node: { id: "trigger-1", jobStatus: "failed" } }] },
                templates: { edges: [] },
              },
            },
          ],
        },
      },
    });

    render(<EditNotificationConfiguration orgId="org-1" mode="edit" configId="config-1" onDone={jest.fn()} />);

    // The field appears only once Form.useWatch reports the loaded WEBHOOK channel, a render after the values land.
    const secret = await screen.findByLabelText("Signing secret (optional)");
    fireEvent.change(secret, { target: { value: "typed" } });
    fireEvent.change(secret, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Update notification" }));

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "notification_configuration/config-1",
        expect.anything(),
        expect.anything()
      )
    );
    const update = jest
      .mocked(axiosInstance.patch)
      .mock.calls.find(([url]) => url === "notification_configuration/config-1");
    expect(requestAttributes(JSON.parse(JSON.stringify(update?.[1])))).not.toHaveProperty("signingSecret");
  });
});
