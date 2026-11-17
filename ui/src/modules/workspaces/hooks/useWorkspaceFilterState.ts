import { useState } from "react";
import { JobStatus, PolicyComplianceStatus } from "@/domain/generated/apiResources";
import { WorkspaceTagFilter } from "@/modules/workspaces/types";

// A stored value from an older enum would silently filter every workspace out, so unknown values fall back to "All".
const storedStatus = (key: string, values: Record<string, string>): string => {
  const value = sessionStorage.getItem(key);
  return value === "All" || (value !== null && Object.prototype.hasOwnProperty.call(values, value)) ? value : "All";
};

export function useWorkspaceFilterState() {
  const [status, setStatus] = useState<string>(storedStatus("filterValue", JobStatus));
  const [policyStatus, setPolicyStatusState] = useState<string>(storedStatus("policyFilter", PolicyComplianceStatus));
  const [search, setSearch] = useState<string>(sessionStorage.getItem("searchValue") || "");
  const [tagFilters, setTagFilters] = useState<WorkspaceTagFilter[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(sessionStorage.getItem("projectFilter") || null);
  const [groupByProject, setGroupByProjectState] = useState<boolean>(
    localStorage.getItem("groupByProject") !== "false"
  );

  const setPolicyStatus = (value: string) => {
    setPolicyStatusState(value);
    sessionStorage.setItem("policyFilter", value);
  };

  const setProjectId = (value: string | null) => {
    setProjectIdState(value);
    sessionStorage.setItem("projectFilter", value ?? "");
  };

  const setGroupByProject = (value: boolean) => {
    setGroupByProjectState(value);
    localStorage.setItem("groupByProject", String(value));
  };

  return {
    status,
    setStatus,
    policyStatus,
    setPolicyStatus,
    search,
    setSearch,
    tagFilters,
    setTagFilters,
    projectId,
    setProjectId,
    groupByProject,
    setGroupByProject,
  };
}
