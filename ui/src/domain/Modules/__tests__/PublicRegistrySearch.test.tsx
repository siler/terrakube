import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { message } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicRegistrySearch } from "../PublicRegistrySearch";

const getMock = jest.fn<Promise<unknown>, unknown[]>();
const postMock = jest.fn<Promise<unknown>, unknown[]>();
const registryGetMock = jest.fn<Promise<unknown>, unknown[]>();

jest.mock("../../../config/axiosConfig", () => ({
  ...jest.requireActual<typeof import("../../../config/axiosConfig")>("../../../config/axiosConfig"),
  __esModule: true,
  default: { get: (...args: unknown[]) => getMock(...args), post: (...args: unknown[]) => postMock(...args) },
  axiosRegistry: { get: (...args: unknown[]) => registryGetMock(...args) },
}));

const axiosError = (status: number, data: unknown) => {
  const headers = new AxiosHeaders();
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", { headers }, undefined, {
    status,
    statusText: "",
    headers,
    config: { headers },
    data,
  });
};

const renderSearch = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/registry/search?tab=modules&q=vpc"]}>
      <Routes>
        <Route
          path="/organizations/:orgid/registry/search"
          element={<PublicRegistrySearch organizationName="acme" />}
        />
      </Routes>
    </MemoryRouter>
  );

jest.mock("../../Providers/providerService", () => ({
  listProviders: () => Promise.resolve([]),
}));

jest.mock("@/modules/permissions/useOrgPermissions", () => ({
  useOrgPermissions: () => ({ permissions: { manageModule: true }, loading: false }),
}));

const registryModule = (name: string, provider: string) => ({
  id: `hashicorp/${name}/${provider}`,
  namespace: "hashicorp",
  name,
  provider,
  version: "1.0.0",
  description: "",
  source: "",
  published_at: "",
  downloads: 10,
  verified: true,
});

describe("PublicRegistrySearch", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    registryGetMock.mockReset();
    getMock.mockResolvedValue({
      data: { data: [{ id: "mod-1", type: "module", attributes: { name: "VPC", provider: "aws" } }] },
    });
    registryGetMock.mockResolvedValue({
      data: { modules: [registryModule("vpc", "aws"), registryModule("network", "azurerm")], meta: {} },
    });
  });

  it("marks search results the organization already has, from only their names and providers", async () => {
    renderSearch();

    expect(await screen.findByText(/In your registry/)).toBeInTheDocument();
    expect(screen.getAllByText(/In your registry/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add hashicorp/network" })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("organization/org-1/module?fields[module]=name,provider", expect.anything());
  });

  it.each([
    ["the server's error detail", { errors: [{ detail: "Module already exists" }] }, "Module already exists"],
    ["a generic message without a detail", { errors: [{ detail: "  " }] }, "Failed to add module"],
  ])("shows %s when adding a module fails", async (_case, body, expected) => {
    const errorSpy = jest.spyOn(message, "error");
    postMock.mockRejectedValue(axiosError(400, body));
    renderSearch();

    fireEvent.click(await screen.findByRole("button", { name: "Add hashicorp/network" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(expected));
    expect(postMock).toHaveBeenCalledWith("organization/org-1/module", expect.anything(), expect.anything());
    errorSpy.mockRestore();
  });
});
