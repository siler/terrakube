import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { message } from "antd";
import axiosInstance from "../../../config/axiosConfig";
import { EditFederatedCredential } from "../EditFederatedCredential";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

const get = jest.mocked(axiosInstance.get);
const post = jest.mocked(axiosInstance.post);

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "AUTOMATION" } });
  fireEvent.change(screen.getByLabelText("Issuer URL"), { target: { value: "https://issuer.example" } });
  fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "terrakube" } });
  fireEvent.change(screen.getByLabelText("Claim key"), { target: { value: "repository_owner" } });
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "terrakube-org" } });
  fireEvent.click(screen.getByRole("button", { name: /Add condition/ }));
  fireEvent.click(screen.getByRole("button", { name: /Add federated credential/ }));
};

const renderCreate = (setMode = jest.fn()) =>
  render(<EditFederatedCredential mode="create" setMode={setMode} loadFederated={jest.fn()} />);

describe("EditFederatedCredential", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    get.mockResolvedValue({ data: { data: [] } });
  });

  it("adds the claim conditions to the credential the server created", async () => {
    post.mockResolvedValueOnce({ data: { data: { id: "fed-1" } } }).mockResolvedValue({ data: {} });
    const setMode = jest.fn();
    renderCreate(setMode);

    fillAndSubmit();

    await waitFor(() => expect(setMode).toHaveBeenCalledWith("list"));
    expect(post).toHaveBeenCalledWith(
      "federated/fed-1/claims",
      { data: { type: "federated_claim", attributes: { claimKey: "repository_owner", claimValue: "terrakube-org" } } },
      expect.anything()
    );
  });

  it("reports a create response without an id instead of saving claims under an undefined credential", async () => {
    const error = jest.spyOn(message, "error");
    post.mockResolvedValue({ data: {} });
    const setMode = jest.fn();
    renderCreate(setMode);

    fillAndSubmit();

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Could not save the federated credential: the server did not return the new credential's id"
      )
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(setMode).not.toHaveBeenCalled();
  });
});
