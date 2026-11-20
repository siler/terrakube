import type { WorkspaceTagRow } from "@/domain/Workspaces/workspaceTagFields";

/** A tag on a workspace. Key-only tags keep the value empty. */
export type WorkspaceTagBinding = Pick<WorkspaceTagRow, "tagId"> & Partial<Pick<WorkspaceTagRow, "value">>;

/** One row of the tag filter: a key, optionally narrowed to a value. */
export type WorkspaceTagFilter = {
  tagId: string;
  value?: string;
};

export type WorkspacePageRequest = {
  organizationId: string;
  first: number;
  after: number;
  search?: string;
  status?: string;
  policyStatus?: string;
  tagFilters?: WorkspaceTagFilter[];
  projectId?: string | null;
  sort:
    | "name_asc"
    | "name_desc"
    | "lastRun_desc"
    | "lastRun_asc"
    | "status"
    | "source_asc"
    | "source_desc"
    | "terraformVersion_asc"
    | "terraformVersion_desc";
};
