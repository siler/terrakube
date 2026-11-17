import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RunTriggers } from "../RunTriggers";

const getMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();
const deleteMock = jest.fn<Promise<unknown>, [url: string, config?: unknown]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (...args: Parameters<typeof getMock>) => getMock(...args),
    delete: (...args: Parameters<typeof deleteMock>) => deleteMock(...args),
    post: jest.fn(),
    patch: jest.fn(),
  },
  getErrorMessage: () => "error",
}));

const WORKSPACE = "ws-self";
const SOURCE = "ws-upstream";
const DESTINATION = "ws-downstream";

/**
 * One edge in each direction, as the API returns them: a single collection where this
 * workspace appears sometimes as source and sometimes as destination. Only the template
 * comes along as an include; the workspace ends arrive as linkage alone.
 */
const bothDirections = {
  data: {
    data: [
      {
        id: "edge-incoming",
        type: "runTrigger",
        attributes: { enabled: true },
        relationships: {
          sourceWorkspace: { data: { type: "workspace", id: SOURCE } },
          destinationWorkspace: { data: { type: "workspace", id: WORKSPACE } },
          template: { data: { type: "template", id: "tpl-1" } },
        },
      },
      {
        id: "edge-outgoing",
        type: "runTrigger",
        attributes: { enabled: false },
        relationships: {
          sourceWorkspace: { data: { type: "workspace", id: WORKSPACE } },
          destinationWorkspace: { data: { type: "workspace", id: DESTINATION } },
        },
      },
    ],
    included: [{ type: "template", id: "tpl-1", attributes: { name: "Plan and Apply" } }],
  },
};

/** The names read, as Elide answers it: one filtered collection, no `included`. */
const otherEndNames = {
  data: {
    data: [
      { id: SOURCE, type: "workspace", attributes: { name: "network" } },
      { id: DESTINATION, type: "workspace", attributes: { name: "vpn" } },
    ],
  },
};

const renderPage = (manageWorkspace = true) =>
  render(
    <MemoryRouter>
      <RunTriggers
        organizationId="org-1"
        workspaceId={WORKSPACE}
        workspaceName="platform"
        manageWorkspace={manageWorkspace}
      />
    </MemoryRouter>
  );

describe("RunTriggers", () => {
  beforeEach(() => {
    getMock.mockReset();
    deleteMock.mockReset();
    getMock.mockImplementation((url: string) => {
      if (url.startsWith("runTrigger?")) return Promise.resolve(bothDirections);
      if (url.includes("id%3Din")) return Promise.resolve(otherEndNames);
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it("asks for both directions in one request, then names the other ends in one more", async () => {
    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(getMock.mock.calls.map(([url]) => decodeURIComponent(url))).toEqual([
      "runTrigger?include=template&fields[runTrigger]=enabled,sourceWorkspace,destinationWorkspace,template" +
        "&fields[template]=name" +
        `&filter[runTrigger]=(sourceWorkspace.id=='${WORKSPACE}',destinationWorkspace.id=='${WORKSPACE}')`,
      `organization/org-1/workspace?fields[workspace]=name&filter[workspace]=id=in=('${SOURCE}','${DESTINATION}')`,
    ]);
  });

  it("loads the pickers with names only", async () => {
    renderPage();
    await screen.findByRole("link", { name: "network" });
    getMock.mockClear();
    getMock.mockResolvedValue({ data: { data: [] } });

    await userEvent.click(screen.getByRole("button", { name: /add source workspace/i }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(getMock.mock.calls.map(([url]) => decodeURIComponent(url))).toEqual([
      "organization/org-1/workspace?fields[workspace]=name",
      "organization/org-1/template?fields[template]=name",
    ]);
  });

  /**
   * The split is the whole point of the page: the same collection has to land in the right
   * table, or a dependency reads backwards.
   */
  it("separates incoming from outgoing edges", async () => {
    renderPage();

    const runsAfter = await screen.findByRole("link", { name: "network" });
    const triggers = await screen.findByRole("link", { name: "vpn" });

    const tables = screen.getAllByRole("table");
    expect(within(tables[0]).getByRole("link", { name: "network" })).toBe(runsAfter);
    expect(within(tables[1]).getByRole("link", { name: "vpn" })).toBe(triggers);
  });

  it("names the trigger's own template and falls back to the default", async () => {
    renderPage();

    expect(await screen.findByText("Plan and Apply")).toBeInTheDocument();
    expect(screen.getByText("Default template")).toBeInTheDocument();
  });

  /**
   * The outgoing table is read-only on purpose: removing one of those edges needs manage
   * rights on the other workspace, which is where the API enforces it.
   */
  it("offers no delete for edges this workspace only feeds", async () => {
    renderPage();

    await screen.findByRole("link", { name: "vpn" });
    const tables = screen.getAllByRole("table");
    expect(within(tables[0]).getAllByRole("button", { name: /delete/i })).toHaveLength(1);
    expect(within(tables[1]).queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("disables every control without manage rights", async () => {
    renderPage(false);

    await screen.findByRole("link", { name: "network" });
    expect(screen.getByRole("button", { name: /add source workspace/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();
  });

  /**
   * The unique constraint refuses a duplicate edge, so a source already wired to this
   * workspace must not be offered again - picking it could only end in a 409.
   */
  it("does not offer a source that is already wired", async () => {
    getMock.mockImplementation((url: string) => {
      if (url.startsWith("runTrigger?")) return Promise.resolve(bothDirections);
      if (url.includes("/template")) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({
        data: {
          data: [
            { id: SOURCE, attributes: { name: "network" } },
            { id: "ws-free", attributes: { name: "free-to-pick" } },
          ],
        },
      });
    });
    renderPage();
    await screen.findByRole("link", { name: "network" });

    await userEvent.click(screen.getByRole("button", { name: /add source workspace/i }));
    await userEvent.click(await screen.findByRole("combobox", { name: /source workspace/i }));

    expect(await screen.findByTitle("free-to-pick")).toBeInTheDocument();
    expect(screen.queryByTitle("network")).toBeNull();
  });

  it("says so when nothing depends on this workspace", async () => {
    getMock.mockResolvedValue({ data: { data: [], included: [] } });
    renderPage();

    expect(await screen.findByText("This workspace does not run after any other workspace.")).toBeInTheDocument();
    expect(screen.getByText("No workspace runs after this one.")).toBeInTheDocument();
  });
});
