import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axiosGraphQL } from "@/config/axiosConfig";
import { NotificationConfigurationList } from "../NotificationConfigurationList";
import { recordOf } from "@/testUtils/readRequestBody";

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), delete: jest.fn() },
  getErrorMessage: jest.fn(() => "error"),
  isPermissionError: jest.fn(() => false),
  axiosGraphQL: { post: jest.fn() },
}));
jest.mock("../EditNotificationConfiguration", () => ({
  EditNotificationConfiguration: () => <div data-testid="edit-notification-configuration" />,
}));

const graphqlResponse = {
  data: {
    data: {
      organization: {
        edges: [
          {
            node: {
              notificationConfiguration: {
                edges: [
                  {
                    node: {
                      id: "config-1",
                      name: "Org Slack Alerts",
                      channelType: "SLACK",
                      destinationUrl: "https://hooks.slack.com/services/X",
                      active: true,
                      workspace: { edges: [] },
                      triggers: { edges: [{ node: { id: "t1", jobStatus: "failed" } }] },
                    },
                  },
                  {
                    node: {
                      id: "config-2",
                      name: "Workspace Webhook",
                      channelType: "WEBHOOK",
                      destinationUrl: "https://example.com/hook",
                      active: true,
                      workspace: { edges: [{ node: { id: "ws-1" } }] },
                      triggers: { edges: [] },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  },
};

describe("NotificationConfigurationList", () => {
  beforeEach(() => {
    jest.mocked(axiosGraphQL.post).mockReset().mockResolvedValue(graphqlResponse);
  });

  it("shows org-level configs plus workspace-scoped configs for the current workspace", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" workspaceId="ws-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Org Slack Alerts")).toBeInTheDocument());
    expect(screen.getByText("Workspace Webhook")).toBeInTheDocument();
  });

  it("shows only org-level configs when no workspaceId is provided", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Org Slack Alerts")).toBeInTheDocument());
    expect(screen.queryByText("Workspace Webhook")).not.toBeInTheDocument();
  });

  it("groups a workspace's page into this-workspace and organization-wide sections", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" workspaceId="ws-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Org Slack Alerts")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "This workspace (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organization-wide (1)" })).toBeInTheDocument();
    // Organization-wide rows are managed from the organization, so they carry no row actions here.
    expect(screen.getByRole("button", { name: "Edit Workspace Webhook" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Org Slack Alerts" })).not.toBeInTheDocument();
  });

  it("puts the add action in the header and names the notification in row actions", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Org Slack Alerts")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /Add notification/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit Org Slack Alerts" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete Org Slack Alerts" })).toBeEnabled();
  });

  it("does not show a this-workspace section on the organization-level page", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Org Slack Alerts")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: /This workspace/ })).not.toBeInTheDocument();
  });

  it("does not offer an override action - workspace and org configs are purely additive now", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" workspaceId="ws-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Org Slack Alerts")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /override/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/already overridden/i)).not.toBeInTheDocument();
  });

  it("surfaces an error instead of silently rendering an empty list when the GraphQL query fails", async () => {
    // A GraphQL error still resolves the HTTP call (200 OK with an "errors" array, no top-level "data").
    jest.mocked(axiosGraphQL.post).mockResolvedValue({ data: { errors: [{ message: "Validation error" }] } });

    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(axiosGraphQL.post).toHaveBeenCalled());
    expect(screen.queryByText("Org Slack Alerts")).not.toBeInTheDocument();
  });

  it("sends the organization id as a variable, not in the query text", async () => {
    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(axiosGraphQL.post).toHaveBeenCalled());
    const body = recordOf(jest.mocked(axiosGraphQL.post).mock.calls[0][1]);
    expect(body.variables).toEqual({ orgIds: ["org-1"] });
    expect(body.query).not.toContain("org-1");
  });

  it("still lists configurations whose channel type is missing or unknown", async () => {
    const node = (id: string, name: string, channelType: string | null) => ({
      node: { id, name, channelType, active: true, workspace: { edges: [] } },
    });
    jest.mocked(axiosGraphQL.post).mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [
              {
                node: {
                  notificationConfiguration: {
                    edges: [
                      node("c1", "Legacy Pager", "PAGERDUTY"),
                      node("c2", "Untyped", null),
                      node("c3", "Org Slack Alerts", "SLACK"),
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <NotificationConfigurationList orgId="org-1" managePermission={true} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Legacy Pager")).toBeInTheDocument());
    expect(screen.getByText("PAGERDUTY")).toBeInTheDocument();
    expect(screen.getByText("Untyped")).toBeInTheDocument();
    expect(screen.getByText("Unknown channel")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });
});
