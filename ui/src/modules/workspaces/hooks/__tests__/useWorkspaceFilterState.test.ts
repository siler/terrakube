import { renderHook, act } from "@testing-library/react";
import { useWorkspaceFilterState } from "../useWorkspaceFilterState";

describe("useWorkspaceFilterState", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("defaults status to 'All', search to '', tagFilters to [], projectId to null, groupByProject to true", () => {
    const { result } = renderHook(() => useWorkspaceFilterState());
    expect(result.current.status).toBe("All");
    expect(result.current.search).toBe("");
    expect(result.current.tagFilters).toEqual([]);
    expect(result.current.projectId).toBeNull();
    expect(result.current.groupByProject).toBe(true);
  });

  it("initializes status/search from sessionStorage", () => {
    sessionStorage.setItem("filterValue", "running");
    sessionStorage.setItem("searchValue", "billing");
    const { result } = renderHook(() => useWorkspaceFilterState());
    expect(result.current.status).toBe("running");
    expect(result.current.search).toBe("billing");
  });

  it("accepts a stored 'All' and generated status values, and falls back to 'All' otherwise", () => {
    sessionStorage.setItem("filterValue", "All");
    sessionStorage.setItem("policyFilter", "COMPLIANT");
    const { result } = renderHook(() => useWorkspaceFilterState());
    expect(result.current.status).toBe("All");
    expect(result.current.policyStatus).toBe("COMPLIANT");
  });

  it("falls back to 'All' for stored statuses the API no longer serialises", () => {
    sessionStorage.setItem("filterValue", "bogus");
    sessionStorage.setItem("policyFilter", "ALWAYS_GREEN");
    const { result } = renderHook(() => useWorkspaceFilterState());
    expect(result.current.status).toBe("All");
    expect(result.current.policyStatus).toBe("All");
  });

  it("initializes projectId from sessionStorage and groupByProject from localStorage", () => {
    sessionStorage.setItem("projectFilter", "proj-1");
    localStorage.setItem("groupByProject", "false");
    const { result } = renderHook(() => useWorkspaceFilterState());
    expect(result.current.projectId).toBe("proj-1");
    expect(result.current.groupByProject).toBe(false);
  });

  it("setProjectId updates state and persists to sessionStorage", () => {
    const { result } = renderHook(() => useWorkspaceFilterState());
    act(() => result.current.setProjectId("proj-2"));
    expect(result.current.projectId).toBe("proj-2");
    expect(sessionStorage.getItem("projectFilter")).toBe("proj-2");
  });

  it("setGroupByProject updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useWorkspaceFilterState());
    act(() => result.current.setGroupByProject(false));
    expect(result.current.groupByProject).toBe(false);
    expect(localStorage.getItem("groupByProject")).toBe("false");
  });

  it("setTagFilters updates state", () => {
    const { result } = renderHook(() => useWorkspaceFilterState());
    act(() => result.current.setTagFilters([{ tagId: "tag-1", value: "prod" }, { tagId: "tag-2" }]));
    expect(result.current.tagFilters).toEqual([{ tagId: "tag-1", value: "prod" }, { tagId: "tag-2" }]);
  });
});
