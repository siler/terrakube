import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { message } from "antd";
import { isValidElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { CreateModule } from "../Create";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

const mockGet = jest.mocked(axiosInstance.get);
const mockPost = jest.mocked(axiosInstance.post);

const axiosError = (status: number) => {
  const headers = new AxiosHeaders();
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", { headers }, undefined, {
    status,
    statusText: "",
    headers,
    config: { headers },
    data: {},
  });
};

const postedBody = () => mockPost.mock.calls[0][1];
jest.mock("@/hooks/useOrganizationName", () => ({ useOrganizationName: () => "acme" }));

const vcs = [{ id: "vcs-1", type: "vcs", attributes: { name: "github-main", vcsType: "GITHUB" } }];

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/registry/create"]}>
      <Routes>
        <Route path="/organizations/:orgid/registry/create" element={<CreateModule />} />
        <Route path="/organizations/:orgid/registry/:id" element={<p>Module page</p>} />
        <Route path="/organizations/:orgid/registry" element={<p>Registry page</p>} />
      </Routes>
    </MemoryRouter>
  );

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CreateModule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation((url: string) => Promise.resolve({ data: { data: url.includes("/vcs") ? vcs : [] } }));
    mockPost.mockResolvedValue({ status: 201, data: { data: { id: "m-1" } } });
  });

  const fillModule = () => {
    fill("Repository URL", "https://github.com/acme/terraform-aws-vpc.git");
    fireEvent.blur(screen.getByLabelText("Repository URL"));
    fill("Description", "VPC module");
  };

  it("fills name and provider from the repository and posts the same payload as before", async () => {
    renderCreate();
    fillModule();
    expect(screen.getByLabelText("Name")).toHaveValue("vpc");
    expect(screen.getByLabelText("Provider")).toHaveValue("aws");

    fireEvent.click(screen.getByRole("button", { name: "Publish module" }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe("organization/org-1/module");
    expect(postedBody()).toEqual({
      data: {
        type: "module",
        attributes: {
          name: "vpc",
          description: "VPC module",
          provider: "aws",
          source: "https://github.com/acme/terraform-aws-vpc.git",
          folder: null,
          tagPrefix: null,
        },
      },
    });
    expect(await screen.findByText("Module page")).toBeInTheDocument();
  });

  it("reads a multi-word module name and a repository URL with regex characters", () => {
    renderCreate();
    fill("Repository URL", "https://example.com/acme/terraform-a(b-vpc-endpoints.git");
    fireEvent.blur(screen.getByLabelText("Repository URL"));

    expect(screen.getByLabelText("Provider")).toHaveValue("a(b");
    expect(screen.getByLabelText("Name")).toHaveValue("vpc-endpoints");
  });

  it("links the chosen VCS connection", async () => {
    renderCreate();
    fireEvent.click(await screen.findByRole("radio", { name: "github-main" }));
    fillModule();

    fireEvent.click(screen.getByRole("button", { name: "Publish module" }));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    expect(postedBody()).toMatchObject({
      data: { relationships: { vcs: { data: { type: "vcs", id: "vcs-1" } } } },
    });
  });

  it("returns to the registry when the create response names no module id", async () => {
    mockPost.mockResolvedValue({ status: 201, data: {} });
    renderCreate();
    fillModule();

    fireEvent.click(screen.getByRole("button", { name: "Publish module" }));

    expect(await screen.findByText("Registry page")).toBeInTheDocument();
  });

  it("explains a missing permission when the server answers 403", async () => {
    const errorSpy = jest.spyOn(message, "error");
    mockPost.mockRejectedValue(axiosError(403));
    renderCreate();
    fillModule();

    fireEvent.click(screen.getByRole("button", { name: "Publish module" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(isValidElement(errorSpy.mock.calls[0][0])).toBe(true);
    errorSpy.mockRestore();
  });

  it("shows the error message for other failures", async () => {
    const errorSpy = jest.spyOn(message, "error");
    mockPost.mockRejectedValue(axiosError(500));
    renderCreate();
    fillModule();

    fireEvent.click(screen.getByRole("button", { name: "Publish module" }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith("Request failed"));
    errorSpy.mockRestore();
  });
});
