import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { message } from "antd";
import { MemoryRouter } from "react-router-dom";
import axiosInstance from "@/config/axiosConfig";
import { ORGANIZATION_ARCHIVE, ORGANIZATION_NAME } from "@/config/actionTypes";
import { useOrganizationSummaries } from "@/modules/organizations/useOrganizationSummaries";
import { CreateOrganization } from "../Create";
import { parseCreatedOrganization } from "../parseCreatedOrganization";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual<typeof import("react-router-dom")>("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("@/config/axiosConfig", () => ({
  ...jest.requireActual<typeof import("@/config/axiosConfig")>("@/config/axiosConfig"),
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock("@/modules/organizations/useOrganizationSummaries");

const mockPost = jest.mocked(axiosInstance.post);
const upsertOrganization = jest.fn();

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

const submit = async (name: string) => {
  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: /create organization/i }));
  await waitFor(() => expect(mockPost).toHaveBeenCalled());
};

describe("parseCreatedOrganization", () => {
  it("reads the id and attributes of the created organization", () => {
    expect(
      parseCreatedOrganization({
        data: {
          id: "org-1",
          type: "organization",
          attributes: { name: "acme", description: null, executionMode: "remote", icon: "FaBuilding:#000000" },
        },
      })
    ).toEqual({
      id: "org-1",
      name: "acme",
      description: undefined,
      executionMode: "remote",
      icon: "FaBuilding:#000000",
    });
  });

  it("drops an unknown execution mode", () => {
    expect(
      parseCreatedOrganization({ data: { id: "org-1", attributes: { name: "acme", executionMode: "hybrid" } } })
    ).toMatchObject({ executionMode: undefined });
  });

  it("rejects a document without an id or name", () => {
    expect(parseCreatedOrganization({ data: { attributes: { name: "acme" } } })).toBeUndefined();
    expect(parseCreatedOrganization({ data: { id: "org-1", attributes: {} } })).toBeUndefined();
    expect(parseCreatedOrganization("")).toBeUndefined();
  });
});

describe("CreateOrganization", () => {
  const setOrganizationName = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    jest.mocked(useOrganizationSummaries).mockReturnValue({
      organizations: [],
      loading: false,
      refresh: jest.fn(),
      upsertOrganization,
      updateOrganization: jest.fn(),
      removeOrganization: jest.fn(),
    });
    jest.spyOn(message, "success").mockImplementation(jest.fn());
    jest.spyOn(message, "error").mockImplementation(jest.fn());
    render(
      <MemoryRouter>
        <CreateOrganization setOrganizationName={setOrganizationName} />
      </MemoryRouter>
    );
  });

  it("selects the created organization and opens its team settings", async () => {
    mockPost.mockResolvedValue({ data: { data: { id: "org-1", attributes: { name: "acme" } } } });

    await submit("acme");

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/organizations/org-1/settings/teams"));
    expect(sessionStorage.getItem(ORGANIZATION_ARCHIVE)).toBe("org-1");
    expect(sessionStorage.getItem(ORGANIZATION_NAME)).toBe("acme");
    expect(setOrganizationName).toHaveBeenCalledWith("acme");
    expect(upsertOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ id: "org-1", name: "acme", workspaceCount: 0, workspaceStatusCounts: {} })
    );
  });

  it("returns to the organization list when the created organization cannot be read", async () => {
    jest.spyOn(console, "error").mockImplementation(jest.fn());
    mockPost.mockResolvedValue({ data: "" });

    await submit("acme");

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    expect(message.success).toHaveBeenCalled();
    expect(sessionStorage.getItem(ORGANIZATION_ARCHIVE)).toBeNull();
    expect(upsertOrganization).not.toHaveBeenCalled();
  });

  it("shows the API's error detail when creation fails", async () => {
    jest.spyOn(console, "error").mockImplementation(jest.fn());
    mockPost.mockRejectedValue(axiosError(400, { errors: [{ detail: "Name already taken" }] }));

    await submit("acme");

    await waitFor(() => expect(message.error).toHaveBeenCalledWith("Name already taken"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("explains the administrator group when the user may not create organizations", async () => {
    jest.spyOn(console, "error").mockImplementation(jest.fn());
    mockPost.mockRejectedValue(axiosError(403, {}));

    await submit("acme");

    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(message.error).not.toHaveBeenCalledWith("Failed to create organization");
  });
});
