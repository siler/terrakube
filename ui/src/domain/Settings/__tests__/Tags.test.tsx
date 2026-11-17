import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { TagsSettings } from "../Tags";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error && err.message) || "Error",
  isPermissionError: () => false,
}));

const get = jest.mocked(axiosInstance.get);

const TAG_LIST = "organization/org-1/tag?fields[tag]=name";
const TAG_EDIT = "organization/org-1/tag/tag-1?fields[tag]=name";

// Answers only the exact URLs given, so a request that drops a field or filter fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
  );

const renderTags = () =>
  render(
    <MemoryRouter initialEntries={["/organizations/org-1/settings/tags"]}>
      <Routes>
        <Route path="/organizations/:orgid/settings/tags" element={<TagsSettings />} />
      </Routes>
    </MemoryRouter>
  );

describe("TagsSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows an empty state with one create action", async () => {
    respondTo({ [TAG_LIST]: { data: [] } });
    renderTags();

    expect(await screen.findByText(/No tag keys yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists tags with a count and confirms deletion", async () => {
    respondTo({ [TAG_LIST]: { data: [{ id: "tag-1", attributes: { name: "production" } }] } });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    renderTags();

    expect(await screen.findByRole("heading", { name: "Tags (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete tag production" }));
    expect(axiosInstance.delete).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Delete tag" }));
    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/tag/tag-1"));
  });

  it("creates a tag from the modal", async () => {
    respondTo({ [TAG_LIST]: { data: [{ id: "tag-1", attributes: { name: "production" } }] } });
    jest.mocked(axiosInstance.post).mockResolvedValue({});
    renderTags();

    await screen.findByRole("heading", { name: "Tags (1)" });
    fireEvent.click(screen.getByRole("button", { name: /Create tag key/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "staging" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create tag key" }));

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith(
        "organization/org-1/tag",
        { data: { type: "tag", attributes: { name: "staging" } } },
        expect.anything()
      )
    );
  });

  it("sends the typed update body when renaming a tag", async () => {
    respondTo({
      [TAG_LIST]: { data: [{ id: "tag-1", attributes: { name: "production" } }] },
      [TAG_EDIT]: { data: { id: "tag-1", attributes: { name: "production" } } },
    });
    jest.mocked(axiosInstance.patch).mockResolvedValue({});
    renderTags();

    await screen.findByRole("heading", { name: "Tags (1)" });
    fireEvent.click(screen.getByRole("button", { name: "Edit tag production" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByLabelText("Key")).toHaveValue("production"));
    fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "prod" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "organization/org-1/tag/tag-1",
        { data: { type: "tag", id: "tag-1", attributes: { name: "prod" } } },
        expect.anything()
      )
    );
  });
});
