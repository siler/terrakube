import { act, render, screen, waitFor } from "@testing-library/react";
import OrganizationsDetailPage from "../OrganizationDetailsPage";
import workspaceService from "@/modules/workspaces/workspaceService";
import projectService from "@/modules/projects/projectService";
import { message } from "antd";
import { useOrganizationJobStatusSubscription } from "@/hooks";
import type { ComponentProps } from "react";
import type WorkspaceTable from "@/modules/workspaces/components/WorkspaceTable/WorkspaceTable";
import type { WorkspacePageResult } from "@/modules/workspaces/workspaceService";
import type { ApiSuccess } from "@/modules/api/types";
import { workspaceListItem } from "@/testUtils/workspaceListItem";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "org-2" }),
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  useHref: (to: string) => to,
  useNavigate: () => jest.fn(),
}));
jest.mock("@/components/layout/PageWrapper/PageWrapper", () => ({
  __esModule: true,
  default: function PageWrapper({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode }) {
    return (
      <>
        {actions}
        {children}
      </>
    );
  },
}));
jest.mock("@/config/authConfig", () => ({ useAuth: () => ({ user: { profile: { sub: "user-1" } } }) }));
jest.mock("@/hooks", () => ({ usePolling: jest.fn(), useOrganizationJobStatusSubscription: jest.fn() }));
jest.mock("@/modules/workspaces/components/WorkspaceFilter", () => () => null);
let tableProps: ComponentProps<typeof WorkspaceTable> | undefined;
jest.mock(
  "@/modules/workspaces/components/WorkspaceTable/WorkspaceTable",
  () => (props: ComponentProps<typeof WorkspaceTable>) => {
    tableProps = props;
    return null;
  }
);
jest.mock("antd", () => ({ ...jest.requireActual<typeof import("antd")>("antd"), message: { error: jest.fn() } }));
jest.mock("@/modules/workspaces/workspaceService", () => ({ listWorkspacePage: jest.fn() }));
jest.mock("@/modules/projects/projectService", () => ({ listProjects: jest.fn() }));

const listWorkspacePage = jest.mocked(workspaceService.listWorkspacePage);
const listProjects = jest.mocked(projectService.listProjects);

const emptyPage: ApiSuccess<WorkspacePageResult> = {
  isError: false,
  responseCode: 200,
  data: {
    organizationName: "org",
    workspaces: [],
    pageInfo: { endCursor: undefined, hasNextPage: false, totalRecords: 0 },
    statusCounts: {},
    policyCounts: {},
  },
};

/** Fails the test when the value the page should have passed down is missing. */
const defined = <T,>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`Expected ${name} to be defined`);
  }
  return value;
};

const table = () => defined(tableProps, "WorkspaceTable props");

describe("OrganizationDetailsPage project filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    listWorkspacePage.mockResolvedValue(emptyPage);
  });

  it("drops a project filter left over from another organization", async () => {
    sessionStorage.setItem("projectFilter", "project-from-org-1");
    listProjects.mockResolvedValue({
      isError: false,
      responseCode: 200,
      data: [{ id: "project-2", name: "P2", description: undefined }],
    });

    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);

    await waitFor(() =>
      expect(listWorkspacePage).toHaveBeenLastCalledWith(
        expect.objectContaining({ organizationId: "org-2", projectId: null }),
        expect.anything()
      )
    );
    expect(sessionStorage.getItem("projectFilter")).toBe("");
  });

  it("keeps a project filter that belongs to the organization", async () => {
    sessionStorage.setItem("projectFilter", "project-2");
    listProjects.mockResolvedValue({
      isError: false,
      responseCode: 200,
      data: [{ id: "project-2", name: "P2", description: undefined }],
    });

    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);

    await waitFor(() => expect(listProjects).toHaveBeenCalled());
    await waitFor(() => expect(listWorkspacePage).toHaveBeenCalled());
    expect(listWorkspacePage.mock.calls.every(([request]) => request.projectId === "project-2")).toBe(true);
  });

  it("reuses facet counts on page turns and surfaces later failures", async () => {
    listProjects.mockResolvedValue({ isError: false, responseCode: 200, data: [] });
    listWorkspacePage.mockResolvedValue({
      ...emptyPage,
      data: { ...emptyPage.data, pageInfo: { endCursor: undefined, hasNextPage: true, totalRecords: 40 } },
    });
    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);
    await waitFor(() => expect(listWorkspacePage).toHaveBeenCalledWith(expect.anything(), true));
    expect(tableProps).toBeDefined();

    listWorkspacePage.mockClear();
    await act(async () => defined(table().onPageChange, "onPageChange")(2, defined(table().pageSize, "pageSize")));
    await waitFor(() =>
      expect(listWorkspacePage).toHaveBeenLastCalledWith(expect.objectContaining({ after: table().pageSize }), false)
    );
    expect(message.error).not.toHaveBeenCalled();

    listWorkspacePage.mockResolvedValue({
      isError: true,
      responseCode: 500,
      error: { status: "500", message: "boom" },
    });
    await act(async () => defined(table().onPageChange, "onPageChange")(3, defined(table().pageSize, "pageSize")));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith("boom"));
  });

  it("lets the header actions wrap so New workspace stays reachable on narrow screens", async () => {
    listProjects.mockResolvedValue({ isError: false, responseCode: 200, data: [] });

    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);

    const create = await screen.findByRole("link", { name: /New workspace/ });
    expect(create.closest(".ant-space")).toHaveStyle({ flexWrap: "wrap" });
  });

  it("keeps project group choices per user and organization and passes them to the table", async () => {
    listProjects.mockResolvedValue({ isError: false, responseCode: 200, data: [] });
    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);
    await waitFor(() => expect(tableProps).toBeDefined());
    expect(defined(table().collapsedGroups, "collapsedGroups").size).toBe(0);
    expect(table().groupsForcedOpen).toBe(false);

    await act(async () => defined(table().onToggleGroup, "onToggleGroup")("proj-1"));
    expect(defined(table().collapsedGroups, "collapsedGroups").has("proj-1")).toBe(true);
    expect(sessionStorage.getItem("terrakube.workspaceCollapsedGroups:user-1:org-2")).toBe('["proj-1"]');

    await act(async () =>
      defined(table().onSetGroupsCollapsed, "onSetGroupsCollapsed")(["proj-1", "__unassigned__"], false)
    );
    expect(defined(table().collapsedGroups, "collapsedGroups").size).toBe(0);
  });

  it("forces the groups open while a search is active", async () => {
    sessionStorage.setItem("searchValue", "billing");
    listProjects.mockResolvedValue({ isError: false, responseCode: 200, data: [] });
    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);
    await waitFor(() => expect(tableProps?.groupsForcedOpen).toBe(true));
  });

  it("applies job status events to the matching workspace and ignores statuses it does not know", async () => {
    listProjects.mockResolvedValue({ isError: false, responseCode: 200, data: [] });
    listWorkspacePage.mockResolvedValue({
      ...emptyPage,
      data: {
        ...emptyPage.data,
        workspaces: [
          workspaceListItem({ id: "ws-1", name: "one", lastStatus: "completed", tags: [] }),
          workspaceListItem({ id: "ws-2", name: "two", lastStatus: "completed", tags: [] }),
        ],
      },
    });
    render(<OrganizationsDetailPage organizationName="org" setOrganizationName={jest.fn()} />);
    await waitFor(() => expect(tableProps?.workspaces).toHaveLength(2));
    const subscription = jest.mocked(useOrganizationJobStatusSubscription).mock.lastCall?.[0];
    const statusOf = (workspaceId: string) =>
      table().workspaces.find((workspace) => workspace.id === workspaceId)?.lastStatus;

    await act(async () => subscription?.onEvent({ workspaceId: "ws-1", jobId: 1, status: "running" }));
    expect(statusOf("ws-1")).toBe("running");
    expect(statusOf("ws-2")).toBe("completed");

    const latest = jest.mocked(useOrganizationJobStatusSubscription).mock.lastCall?.[0];
    await act(async () => latest?.onEvent({ workspaceId: "ws-1", jobId: 1, status: "somethingNew" }));
    expect(statusOf("ws-1")).toBe("running");
  });
});
