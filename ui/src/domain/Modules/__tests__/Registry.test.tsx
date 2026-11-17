import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { Registry } from "../Registry";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

const mockGet = jest.mocked(axiosInstance.get);

const moduleItem = (id: string, name: string, description = "") => ({
  id,
  type: "module",
  attributes: { name, description, provider: "aws", latestVersion: "1.0.0", downloadQuantity: 3 },
});

let permissions = { manageModule: true };
jest.mock("@/modules/permissions/useOrgPermissions", () => ({
  useOrgPermissions: () => ({ permissions, loading: false }),
}));

const BackButton = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      back
    </button>
  );
};

const LocationProbe = () => <p data-testid="location">{useLocation().pathname}</p>;

const renderRegistry = (modules: unknown[], initialEntries = ["/organizations/org-1/registry"]) => {
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.includes("/module")
        ? { data: modules }
        : url.includes("/provider")
          ? { data: [{ id: "p-1", type: "provider", attributes: { name: "random" } }] }
          : { data: { attributes: { name: "acme" } } },
    })
  );
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <BackButton />
      <LocationProbe />
      <Routes>
        <Route
          path="/organizations/:orgid/registry"
          element={<Registry organizationName="acme" setOrganizationName={jest.fn()} />}
        />
      </Routes>
    </MemoryRouter>
  );
};

describe("Registry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permissions = { manageModule: true };
    localStorage.clear();
  });

  it("counts the modules that match the search", async () => {
    renderRegistry([moduleItem("m-1", "vpc", "Network"), moduleItem("m-2", "eks")]);

    expect(await screen.findByRole("heading", { name: "Modules (2)" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search modules"), { target: { value: "network" } });
    expect(screen.getByRole("heading", { name: "Modules (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "vpc" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search modules"), { target: { value: "nothing" } });
    expect(screen.getByText('No modules match "nothing".')).toBeInTheDocument();
  });

  it("offers to publish a module when the registry is empty", async () => {
    renderRegistry([]);

    expect(await screen.findByText(/There are no modules in acme yet/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Modules \(/ })).not.toBeInTheDocument();
  });

  it("loads providers when Back returns to the providers tab", async () => {
    renderRegistry(
      [moduleItem("m-1", "vpc")],
      ["/organizations/org-1/registry?tab=providers", "/organizations/org-1/registry"]
    );
    expect(await screen.findByRole("heading", { name: "Modules (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(await screen.findByRole("heading", { name: "Providers (1)" })).toBeInTheDocument();
  });

  it("requests only the fields the module and provider lists show", async () => {
    renderRegistry(
      [moduleItem("m-1", "vpc")],
      ["/organizations/org-1/registry?tab=providers", "/organizations/org-1/registry"]
    );
    expect(await screen.findByRole("heading", { name: "Modules (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(await screen.findByRole("heading", { name: "Providers (1)" })).toBeInTheDocument();

    expect(mockGet.mock.calls.map(([url]) => url)).toEqual([
      "organization/org-1/module?fields[module]=name,description,provider,latestVersion,downloadQuantity,updatedDate",
      "organization/org-1/provider?include=version&fields[provider]=name,description,registryNamespace,version&fields[version]=versionNumber,provider",
    ]);
  });

  it("shows each provider's newest version from the included versions", async () => {
    const versions = ["3.1.0", "3.10.0", "3.2.0"].map((versionNumber, i) => ({
      id: `v-${i}`,
      type: "version",
      attributes: { versionNumber },
      relationships: { provider: { data: { type: "provider", id: "p-1" } } },
    }));
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: "p-1",
            type: "provider",
            attributes: { name: "random" },
            relationships: {
              version: { data: versions.map(({ id }) => ({ type: "version", id })) },
            },
          },
        ],
        included: versions,
      },
    });
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/registry?tab=providers"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/registry"
            element={<Registry organizationName="acme" setOrganizationName={jest.fn()} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("3.10.0")).toBeInTheDocument();
  });

  it("offers publishing only to members who can manage modules", async () => {
    permissions = { manageModule: false };
    renderRegistry([]);

    expect(await screen.findByText(/There are no modules in acme yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Publish module/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Search public registry/ }).length).toBeGreaterThan(0);
  });

  it("pages the module cards", async () => {
    localStorage.setItem("terrakube.listViewMode", "cards");
    renderRegistry(Array.from({ length: 12 }, (_, i) => moduleItem(`m-${i}`, `mod-${String(i).padStart(2, "0")}`)));

    expect(await screen.findByRole("heading", { name: "Modules (12)" })).toBeInTheDocument();
    expect(screen.getByText("mod-00")).toBeInTheDocument();
    expect(screen.queryByText("mod-10")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("mod-10")).toBeInTheDocument();
    expect(screen.queryByText("mod-00")).not.toBeInTheDocument();
  });

  it("shows providers in the compact table after switching tabs", async () => {
    renderRegistry([moduleItem("m-1", "vpc")]);
    expect(await screen.findByRole("heading", { name: "Modules (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Providers"));

    expect(await screen.findByRole("heading", { name: "Providers (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "random" })).toBeInTheDocument();
  });

  it("opens a module when its compact row is clicked", async () => {
    renderRegistry([moduleItem("m-1", "vpc", "Network")]);

    fireEvent.click(await screen.findByText("Network"));

    expect(screen.getByTestId("location")).toHaveTextContent("/organizations/org-1/registry/m-1");
  });
});
