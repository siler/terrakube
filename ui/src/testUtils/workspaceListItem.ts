import type { WorkspaceListItem } from "@/modules/workspaces/workspaceService";

/** A workspace list row as the service maps an empty node, with `fields` laid over it. */
export const workspaceListItem = (
  fields: Pick<WorkspaceListItem, "id" | "name"> & Partial<WorkspaceListItem>
): WorkspaceListItem => ({
  description: undefined,
  source: "",
  normalizedSource: undefined,
  branch: undefined,
  terraformVersion: undefined,
  iacType: "terraform",
  lastStatus: undefined,
  lastRun: undefined,
  locked: undefined,
  policyComplianceStatus: undefined,
  tags: [],
  projectId: undefined,
  projectName: undefined,
  ...fields,
});
