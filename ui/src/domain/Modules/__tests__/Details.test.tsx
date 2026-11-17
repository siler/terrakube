import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { linkIncluded } from "../../../testUtils/fixtureLinkage";
import axiosInstance from "../../../config/axiosConfig";
import { ModuleDetails } from "../Details";

const permissions = { manageModule: false };
const mockModuleAttributes: Record<string, unknown> = {};
const mockPost = jest.fn(() => Promise.resolve({}));

jest.mock("@/modules/permissions/useOrgPermissions", () => ({
  useOrgPermissions: () => ({ permissions, loading: false }),
}));

const moduleDoc = {
  data: {
    data: {
      id: "m1",
      type: "module",
      attributes: {
        name: "network",
        provider: "aws",
        registryPath: "acme/network/aws",
        latestVersion: "1.0.0",
      },
      relationships: {
        version: {
          data: [
            { type: "module_version", id: "v1" },
            { type: "module_version", id: "v2" },
          ],
        },
      },
    },
    included: [
      { id: "vcs-1", type: "vcs", attributes: { vcsType: "GITHUB" } },
      {
        id: "v1",
        type: "module_version",
        attributes: { version: "1.0.0", status: "active", gitTag: "v1.0.0", commit: "abc123def456" },
      },
      { id: "v2", type: "module_version", attributes: { version: "0.9.0", status: "removed" } },
    ],
  },
};

let detailsBody: unknown = { submodules: [], variables: [], outputs: [], resources: [], readme: null };

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (url: string) =>
      Promise.resolve(
        url.includes("/details")
          ? { data: detailsBody }
          : linkIncluded(url, {
              data: {
                ...moduleDoc.data,
                data: {
                  ...moduleDoc.data.data,
                  attributes: { ...moduleDoc.data.data.attributes, ...mockModuleAttributes },
                },
              },
            })
      ),
    delete: jest.fn(),
    patch: jest.fn(),
    post: (...args: unknown[]) => mockPost(...(args as [])),
  },
  getErrorMessage: (error: Error) => error.message,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/registry/m1"]}>
      <Routes>
        <Route path="/organizations/:orgid/registry/:id" element={<ModuleDetails organizationName="acme" />} />
      </Routes>
    </MemoryRouter>
  );

describe("ModuleDetails delete action", () => {
  it.each([
    [false, "true"],
    [true, "false"],
  ])("is disabled without manageModule (manageModule=%s)", async (allowed, ariaDisabled) => {
    permissions.manageModule = allowed;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Manage module/ }));

    const item = await screen.findByRole("menuitem", { name: /Delete module/ });
    expect(item.getAttribute("aria-disabled")).toBe(ariaDisabled);
    fireEvent.click(item);
    if (allowed) expect(await screen.findByRole("dialog")).toBeInTheDocument();
    else expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ModuleDetails version refresh", () => {
  afterEach(() => {
    Object.keys(mockModuleAttributes).forEach((key) => delete mockModuleAttributes[key]);
    mockPost.mockClear();
  });

  it("shows why the last refresh failed", async () => {
    mockModuleAttributes.lastRefreshError = "auth: https://github.com/acme/network.git: not authorized";
    renderPage();

    expect(await screen.findByText("Could not read versions from the repository")).toBeInTheDocument();
    expect(screen.getByText("auth: https://github.com/acme/network.git: not authorized")).toBeInTheDocument();
  });

  it("shows no warning when the last refresh worked", async () => {
    mockModuleAttributes.lastRefresh = new Date().toISOString();
    renderPage();

    expect(await screen.findByText("Last checked")).toBeInTheDocument();
    expect(screen.queryByText("Could not read versions from the repository")).not.toBeInTheDocument();
  });

  it("queues a version check through the sync endpoint", async () => {
    permissions.manageModule = true;
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Check for new versions" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("https://terrakube-api.test/module/v1/organization/org-1/module/m1/sync")
    );
  });

  it("offers the version check only with manageModule", async () => {
    permissions.manageModule = false;
    renderPage();

    expect(await screen.findByText("Last checked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for new versions" })).not.toBeInTheDocument();
  });
});

describe("ModuleDetails version and VCS join", () => {
  it("selects the newest served version and shows its git tag from the joined versions", async () => {
    renderPage();

    // The version select and the rail both show the selected version; the rail also shows its git tag.
    expect((await screen.findAllByText("1.0.0")).length).toBeGreaterThan(0);
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();

    // The version menu lists the removed version with its status suffix.
    fireEvent.mouseDown(screen.getByLabelText("Version"));
    expect(await screen.findByText("0.9.0 (removed)")).toBeInTheDocument();
  });
});

describe("ModuleDetails details tabs", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    detailsBody = { submodules: [], variables: [], outputs: [], resources: [], readme: null };
  });

  it("shows the inputs the registry reports, treating omitted nullable fields as none", async () => {
    detailsBody = {
      submodules: [],
      variables: [{ name: "cidr", type: "string" }],
      outputs: [],
      resources: [],
    };
    renderPage();

    expect(await screen.findByRole("tab", { name: "Inputs (1)" })).toBeInTheDocument();
  });

  it("reports the details as unavailable when the registry response is malformed", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    detailsBody = { variables: "nope" };
    renderPage();

    expect(await screen.findAllByText("The module details could not be loaded.")).not.toHaveLength(0);
  });
});

describe("ModuleDetails version status", () => {
  beforeEach(() => {
    permissions.manageModule = true;
    jest.mocked(axiosInstance.patch).mockResolvedValue({});
  });

  it.each([
    ["Removed", "removed", null],
    ["Deprecated", "deprecated", "Use 2.x"],
  ])("patches the chosen status with %s (deprecationMessage %s)", async (radio, status, deprecationMessage) => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Manage module/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Change status of version 1\.0\.0/ }));

    fireEvent.click(await screen.findByRole("radio", { name: radio }));
    if (deprecationMessage !== null) {
      fireEvent.change(await screen.findByLabelText("Message"), { target: { value: deprecationMessage } });
    }
    fireEvent.click(
      await screen.findByRole("button", { name: status === "removed" ? "Remove version 1.0.0" : "Save" })
    );

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "organization/org-1/module/m1/version/v1",
        { data: { type: "module_version", id: "v1", attributes: { status, deprecationMessage } } },
        { headers: { "Content-Type": "application/vnd.api+json" } }
      )
    );
  });
});
