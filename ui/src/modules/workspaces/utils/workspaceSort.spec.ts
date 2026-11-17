import { getStoredWorkspaceSortOption, setStoredWorkspaceSortOption, WORKSPACE_SORT_OPTIONS } from "./workspaceSort";

describe("stored workspace sort option", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to name ascending when nothing is stored", () => {
    expect(getStoredWorkspaceSortOption()).toBe("name_asc");
  });

  it.each(WORKSPACE_SORT_OPTIONS.map(({ value }) => value))("round-trips %s", (option) => {
    setStoredWorkspaceSortOption(option);
    expect(getStoredWorkspaceSortOption()).toBe(option);
  });

  it("falls back to name ascending for a value it does not recognise", () => {
    sessionStorage.setItem("workspaceSortValue", "createdAt_desc");
    expect(getStoredWorkspaceSortOption()).toBe("name_asc");
  });
});
