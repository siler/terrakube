import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { message } from "antd";
import { WorkspaceSSHKey } from "../SSHKey";
import { WorkspaceLocking } from "../Locking";
import { WorkspaceStateShared } from "../StateShared";
import axiosInstance from "../../../../config/axiosConfig";
import type { WorkspacePageRow } from "../../workspaceQuery";
import { workspacePageRow } from "@/testUtils/workspacePageRow";
import { recordOf, requestAttributes } from "@/testUtils/readRequestBody";

jest.mock("../../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: [] } }),
    post: jest.fn(),
    patch: jest.fn(),
  },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
}));

const workspace = (attributes: Partial<WorkspacePageRow> = {}) =>
  workspacePageRow({
    id: "ws-1",
    name: "prod",
    locked: false,
    organization: { id: "org-1", name: "acme" },
    ...attributes,
  });

const firstOperationAttributes = (body: unknown) => {
  const operations = recordOf(body)["atomic:operations"];
  if (!Array.isArray(operations)) {
    throw new Error(`Expected atomic operations, got ${JSON.stringify(body)}`);
  }
  return requestAttributes(operations[0]);
};

beforeEach(() => jest.clearAllMocks());

describe("WorkspaceSSHKey", () => {
  it("lists the organization keys as options and links to the organization SSH keys page", async () => {
    jest.mocked(axiosInstance.get).mockResolvedValueOnce({
      data: { data: [{ id: "key-1", attributes: { name: "deploy-key" } }] },
    });
    render(
      <MemoryRouter>
        <WorkspaceSSHKey organizationId="org-1" workspace={workspace()} manageWorkspace={true} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Manage organization SSH keys" })).toHaveAttribute(
      "href",
      "/organizations/org-1/settings/ssh"
    );

    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(await screen.findByText("deploy-key")).toBeInTheDocument();
    expect(jest.mocked(axiosInstance.get).mock.calls[0][0]).toBe("organization/org-1/ssh?fields[ssh]=name");
    // One dropdown, not a Select nested per option.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("shows the server error when saving fails", async () => {
    const errorSpy = jest.spyOn(message, "error");
    jest.mocked(axiosInstance.post).mockRejectedValueOnce(new Error("key not found"));
    render(
      <MemoryRouter>
        <WorkspaceSSHKey organizationId="org-1" workspace={workspace()} manageWorkspace={true} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Update SSH key" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith("Could not update the SSH key: key not found"));
  });
});

describe("WorkspaceLocking", () => {
  it("locks with the given reason from a primary button", async () => {
    jest.mocked(axiosInstance.patch).mockResolvedValueOnce({});
    const onUpdate = jest.fn();
    render(
      <WorkspaceLocking
        organizationId="org-1"
        workspace={workspace()}
        manageWorkspace={true}
        onWorkspaceUpdate={onUpdate}
      />
    );

    fireEvent.change(screen.getByLabelText("Lock reason"), { target: { value: "maintenance" } });
    const lock = screen.getByRole("button", { name: "Lock workspace" });
    expect(lock).toHaveClass("ant-btn-primary");
    fireEvent.click(lock);

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(requestAttributes(jest.mocked(axiosInstance.patch).mock.calls[0][1])).toEqual({
      locked: true,
      lockDescription: "maintenance",
    });
  });

  it("shows the lock as a warning and confirms unlock truthfully", async () => {
    jest.mocked(axiosInstance.patch).mockResolvedValueOnce({});
    const onUpdate = jest.fn();
    render(
      <WorkspaceLocking
        organizationId="org-1"
        workspace={workspace({ locked: true, lockDescription: "maintenance" })}
        manageWorkspace={true}
        onWorkspaceUpdate={onUpdate}
      />
    );

    expect(screen.getByText(/This workspace is locked/).closest(".ant-alert")).toHaveClass("ant-alert-warning");
    expect(screen.getByText("Reason: maintenance")).toBeInTheDocument();
    const unlock = screen.getByRole("button", { name: "Unlock workspace" });
    expect(unlock).not.toHaveClass("ant-btn-primary");
    fireEvent.click(unlock);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("You can lock the workspace again at any time.");
    expect(dialog).not.toHaveTextContent("cannot be undone");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock workspace" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(requestAttributes(jest.mocked(axiosInstance.patch).mock.calls[0][1])).toEqual({
      locked: false,
      lockDescription: "",
    });
  });
});

describe("WorkspaceStateShared", () => {
  const shared = () => workspace({ globalRemoteState: false, sharedIds: "ws-a,ws-b" });
  const named = (...ids: string[]) => ({
    data: { data: ids.map((id) => ({ id, attributes: { name: `name-${id}` } })) },
  });
  const getUrls = () => jest.mocked(axiosInstance.get).mock.calls.map(([url]) => decodeURIComponent(url));

  it("loads every shared workspace name in one request, in sharedIds order", async () => {
    jest.mocked(axiosInstance.get).mockResolvedValue(named("ws-b", "ws-a"));
    render(<WorkspaceStateShared organizationId="org-1" workspace={shared()} manageWorkspace={true} />);

    await screen.findByText("name-ws-a");
    const rows = screen.getAllByRole("row");
    expect(getUrls()).toEqual([
      "organization/org-1/workspace?fields[workspace]=name&filter[workspace]=id=in=('ws-a','ws-b')",
    ]);
    expect(rows.slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "name-ws-a",
      "name-ws-b",
    ]);
  });

  it("keeps a shared workspace the API no longer returns, so its access can still be removed", async () => {
    jest.mocked(axiosInstance.get).mockResolvedValue(named("ws-b"));
    render(<WorkspaceStateShared organizationId="org-1" workspace={shared()} manageWorkspace={true} />);

    expect(await screen.findByText("name-ws-b")).toBeInTheDocument();
    expect(screen.getByText("Unknown workspace")).toBeInTheDocument();
    expect(screen.getByText("ws-a")).toBeInTheDocument();
  });

  it("labels every shared workspace unknown when the name lookup fails", async () => {
    jest.mocked(axiosInstance.get).mockRejectedValue(new Error("boom"));
    render(<WorkspaceStateShared organizationId="org-1" workspace={shared()} manageWorkspace={true} />);

    expect(await screen.findAllByText("Unknown workspace")).toHaveLength(2);
  });

  it("makes no request when nothing is shared", () => {
    render(
      <WorkspaceStateShared
        organizationId="org-1"
        workspace={workspace({ globalRemoteState: false, sharedIds: "" })}
        manageWorkspace={true}
      />
    );

    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  it("asks for confirmation before revoking access", async () => {
    jest.mocked(axiosInstance.get).mockResolvedValue(named("ws-a", "ws-b"));
    jest.mocked(axiosInstance.post).mockResolvedValueOnce({ status: 200 });
    render(<WorkspaceStateShared organizationId="org-1" workspace={shared()} manageWorkspace={true} />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove access for name-ws-a" }));
    expect(axiosInstance.post).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    expect(firstOperationAttributes(jest.mocked(axiosInstance.post).mock.calls[0][1])).toEqual({ sharedIds: "ws-b" });
  });

  describe("workspace search", () => {
    const unshared = () => workspace({ globalRemoteState: false });
    const type = (text: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("waits for typing to pause, then sends one names-only request with the text quoted", async () => {
      jest.mocked(axiosInstance.get).mockResolvedValue(named("ws-x"));
      render(<WorkspaceStateShared organizationId="org-1" workspace={unshared()} manageWorkspace={true} />);

      type("o'n");
      type("o'ne");
      type("o'ne,(x);");
      // The GET leaves the timer callback one microtask later, so the check only bites once act flushes.
      await act(async () => {
        jest.advanceTimersByTime(299);
      });
      expect(axiosInstance.get).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      expect(await screen.findByTitle("name-ws-x")).toBeInTheDocument();
      expect(getUrls()).toEqual([
        "organization/org-1/workspace?fields[workspace]=name&filter[workspace]=name=='*o\\'ne,(x);*'",
      ]);
    });

    it("drops a response that arrives after a newer search was sent", async () => {
      const responses: Record<string, (value: unknown) => void> = {};
      jest.mocked(axiosInstance.get).mockImplementation(
        (url: string) =>
          new Promise((resolve) => {
            responses[decodeURIComponent(url).includes("*old*") ? "old" : "new"] = resolve;
          })
      );
      render(<WorkspaceStateShared organizationId="org-1" workspace={unshared()} manageWorkspace={true} />);

      type("old");
      act(() => jest.advanceTimersByTime(300));
      type("new");
      act(() => jest.advanceTimersByTime(300));
      await act(async () => {});
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);

      await act(async () => responses.new(named("ws-new")));
      await act(async () => responses.old(named("ws-old")));

      expect(screen.getByTitle("name-ws-new")).toBeInTheDocument();
      expect(screen.queryByTitle("name-ws-old")).toBeNull();
    });

    it("sends nothing once the search is cleared before the pause", async () => {
      render(<WorkspaceStateShared organizationId="org-1" workspace={unshared()} manageWorkspace={true} />);

      type("prod");
      type("");
      // The GET leaves the timer callback one microtask later, so the check only bites once act flushes.
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(axiosInstance.get).not.toHaveBeenCalled();
    });
  });
});
