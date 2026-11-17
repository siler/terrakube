import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axiosInstance from "../../../config/axiosConfig";
import { VariableCollectionsSettings } from "../VariableCollections";
import { CreateEditCollection } from "../CreateEditCollection";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Error"),
}));

const collection = { id: "col-1", attributes: { name: "aws-credentials", description: "AWS settings", priority: 20 } };
const variable = {
  id: "item-1",
  attributes: { key: "AWS_REGION", value: "eu-west-1", category: "ENV", hcl: false, sensitive: false },
};

const COLLECTION_LIST = "organization/org-1/collection?fields[collection]=name,description,priority";
const WORKSPACES = "organization/org-1/workspace?fields[workspace]=name";
const collectionUrl = (id: string) =>
  `organization/org-1/collection/${id}?fields[collection]=name,description,priority`;
const itemsUrl = (id: string) =>
  `organization/org-1/collection/${id}/item?fields[item]=key,value,category,description,hcl,sensitive`;
const referencesUrl = (id: string) => `organization/org-1/collection/${id}/reference?fields[reference]=workspace`;
// The delete sweep and the list's counts read linkage only, so their fieldsets name just one relationship.
const itemIdsUrl = (id: string) => `organization/org-1/collection/${id}/item?fields[item]=collection`;
const referenceIdsUrl = (id: string) => `organization/org-1/collection/${id}/reference?fields[reference]=collection`;

// Answers only the exact URLs given, so a request that drops a field fails the test.
const respondTo = (routes: Record<string, unknown>) =>
  jest
    .mocked(axiosInstance.get)
    .mockImplementation((url: string) =>
      url in routes ? Promise.resolve({ data: routes[url] }) : Promise.reject(new Error(`Unexpected GET ${url}`))
    );

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/organizations/:orgid/settings/collection" element={<VariableCollectionsSettings />} />
        <Route path="/organizations/:orgid/settings/collection/new" element={<CreateEditCollection mode="create" />} />
        <Route
          path="/organizations/:orgid/settings/collection/edit/:collectionid"
          element={<CreateEditCollection mode="edit" />}
        />
      </Routes>
    </MemoryRouter>
  );

describe("VariableCollectionsSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows an empty state with one create action", async () => {
    respondTo({ [COLLECTION_LIST]: { data: [] } });
    renderAt("/organizations/org-1/settings/collection");

    expect(await screen.findByText(/no variable collections in this organization/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Create variable collection/ })).toHaveLength(1);
  });

  it("lists collections with a count and confirms deletion", async () => {
    respondTo({
      [COLLECTION_LIST]: { data: [collection] },
      [referencesUrl("col-1")]: { data: [] },
      [itemIdsUrl("col-1")]: { data: [] },
      [referenceIdsUrl("col-1")]: { data: [] },
    });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    renderAt("/organizations/org-1/settings/collection");

    expect(await screen.findByRole("heading", { name: "Collections (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "aws-credentials" })).toHaveAttribute(
      "href",
      "/organizations/org-1/settings/collection/edit/col-1"
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete variable collection aws-credentials" }));
    expect(axiosInstance.delete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete variable collection" }));

    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/collection/col-1"));
  });
});

describe("CreateEditCollection", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["create", "/organizations/org-1/settings/collection/new"],
    ["edit", "/organizations/org-1/settings/collection/edit/col-1"],
  ])("asks only for workspace names for the picker in %s mode", async (_mode, path) => {
    respondTo({
      [WORKSPACES]: { data: [] },
      [collectionUrl("col-1")]: { data: collection },
      [itemsUrl("col-1")]: { data: [] },
      [referencesUrl("col-1")]: { data: [] },
    });
    renderAt(path);

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(WORKSPACES, expect.anything()));
    expect(axiosInstance.get).not.toHaveBeenCalledWith("organization/org-1/workspace", expect.anything());
  });

  it("opens the new collection after creating it", async () => {
    respondTo({
      [WORKSPACES]: { data: [] },
      [collectionUrl("col-9")]: { data: collection },
      [itemsUrl("col-9")]: { data: [] },
      [referencesUrl("col-9")]: { data: [] },
    });
    jest.mocked(axiosInstance.post).mockResolvedValue({ data: { data: { id: "col-9" } } });
    renderAt("/organizations/org-1/settings/collection/new");

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "datadog" } });
    fireEvent.click(screen.getByRole("button", { name: "Create variable collection" }));

    await waitFor(() =>
      expect(axiosInstance.post).toHaveBeenCalledWith(
        "organization/org-1/collection",
        { data: { type: "collection", attributes: { name: "datadog", description: "", priority: 10 } } },
        expect.anything()
      )
    );
    expect(await screen.findByRole("heading", { name: "Edit variable collection" })).toBeInTheDocument();
  });

  it("reports an error instead of opening a collection when the create response has no id", async () => {
    respondTo({ [WORKSPACES]: { data: [] } });
    jest.mocked(axiosInstance.post).mockResolvedValue({ data: { data: {} } });
    renderAt("/organizations/org-1/settings/collection/new");

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "datadog" } });
    fireEvent.click(screen.getByRole("button", { name: "Create variable collection" }));

    expect(await screen.findByText(/did not return the new collection's id/)).toBeInTheDocument();
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Create a variable collection" })).toBeInTheDocument();
  });

  it("does not submit a description longer than the API accepts", async () => {
    respondTo({ [WORKSPACES]: { data: [] } });
    renderAt("/organizations/org-1/settings/collection/new");

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "collection" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "x".repeat(513) } });
    fireEvent.click(screen.getByRole("button", { name: "Create variable collection" }));

    expect(await screen.findByText(/512 characters/)).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it("confirms before deleting a variable", async () => {
    respondTo({
      [WORKSPACES]: { data: [] },
      [collectionUrl("col-1")]: { data: collection },
      [itemsUrl("col-1")]: { data: [variable] },
      [referencesUrl("col-1")]: { data: [] },
    });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    renderAt("/organizations/org-1/settings/collection/edit/col-1");

    expect(await screen.findByRole("heading", { name: "Variables (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete variable AWS_REGION" }));
    expect(axiosInstance.delete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete variable" }));
    await waitFor(() =>
      expect(axiosInstance.delete).toHaveBeenCalledWith("organization/org-1/collection/col-1/item/item-1")
    );
  });

  it("deletes the collection from the edit page after the name is typed, then returns to the list", async () => {
    respondTo({
      [WORKSPACES]: { data: [] },
      [collectionUrl("col-1")]: { data: collection },
      [itemsUrl("col-1")]: { data: [variable] },
      [referencesUrl("col-1")]: { data: [] },
      [itemIdsUrl("col-1")]: {
        data: [{ ...variable, relationships: { collection: { data: { type: "collection", id: "col-1" } } } }],
      },
      [referenceIdsUrl("col-1")]: { data: [] },
    });
    jest.mocked(axiosInstance.delete).mockResolvedValue({});
    renderAt("/organizations/org-1/settings/collection/edit/col-1");

    fireEvent.click(await screen.findByRole("button", { name: "Delete this variable collection" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("its workspaces stop receiving these variables");
    const confirm = within(dialog).getByRole("button", { name: "Delete this variable collection" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type the name to confirm"), {
      target: { value: "aws-credentials" },
    });
    fireEvent.click(confirm);

    expect(await screen.findByRole("heading", { name: "Variable collections" })).toBeInTheDocument();
    expect(jest.mocked(axiosInstance.delete).mock.calls.map(([url]) => url)).toEqual([
      "organization/org-1/collection/col-1/item/item-1",
      "organization/org-1/collection/col-1",
    ]);
  });

  it("disables the collection delete without the manage collections permission", async () => {
    respondTo({
      [WORKSPACES]: { data: [] },
      [collectionUrl("col-1")]: { data: collection },
      [itemsUrl("col-1")]: { data: [] },
      [referencesUrl("col-1")]: { data: [] },
    });
    render(
      <MemoryRouter initialEntries={["/organizations/org-1/settings/collection/edit/col-1"]}>
        <Routes>
          <Route
            path="/organizations/:orgid/settings/collection/edit/:collectionid"
            element={<CreateEditCollection mode="edit" managePermission={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Delete this variable collection" })).toBeDisabled();
  });

  const sensitiveVariable = {
    id: "item-2",
    attributes: { key: "SECRET_TOKEN", value: null, category: "ENV", hcl: false, sensitive: true },
  };
  const renderEditWithSensitiveVariable = async () => {
    respondTo({
      [WORKSPACES]: { data: [] },
      [collectionUrl("col-1")]: { data: collection },
      [itemsUrl("col-1")]: { data: [sensitiveVariable] },
      [referencesUrl("col-1")]: { data: [] },
    });
    renderAt("/organizations/org-1/settings/collection/edit/col-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit variable SECRET_TOKEN" }));
    return await screen.findByRole("dialog");
  };

  it("does not send the value of a sensitive variable the user did not re-enter", async () => {
    const dialog = await renderEditWithSensitiveVariable();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    // The value write-only field is required, so saving without re-entering it is rejected in the form.
    expect(await within(dialog).findByText("Enter a value")).toBeInTheDocument();
    expect(axiosInstance.patch).not.toHaveBeenCalled();
  });

  it("sends the re-entered value when editing a sensitive variable", async () => {
    const dialog = await renderEditWithSensitiveVariable();

    fireEvent.change(within(dialog).getByLabelText("Value"), { target: { value: "new-secret" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        "organization/org-1/collection/col-1/item/item-2",
        {
          data: {
            type: "item",
            id: "item-2",
            attributes: {
              key: "SECRET_TOKEN",
              value: "new-secret",
              sensitive: true,
              hcl: false,
              category: "ENV",
            },
          },
        },
        expect.anything()
      )
    );
  });
});
