import { isOneOf } from "@/modules/utils/guards";

const WORKSPACE_SORT_VALUES = [
  "name_asc",
  "name_desc",
  "lastRun_desc",
  "lastRun_asc",
  "status",
  "source_asc",
  "source_desc",
  "terraformVersion_asc",
  "terraformVersion_desc",
] as const;

/** Combined sort option: field + direction in one value for the UI */
export type WorkspaceSortOption = (typeof WORKSPACE_SORT_VALUES)[number];

const SORT_STORAGE_KEY = "workspaceSortValue";

/** Reads the persisted sort option, falling back to name ascending when absent or unrecognised. */
export function getStoredWorkspaceSortOption(): WorkspaceSortOption {
  const stored = sessionStorage.getItem(SORT_STORAGE_KEY);
  if (isOneOf(WORKSPACE_SORT_VALUES, stored)) {
    return stored;
  }
  return "name_asc";
}

export function setStoredWorkspaceSortOption(option: WorkspaceSortOption): void {
  sessionStorage.setItem(SORT_STORAGE_KEY, option);
}

/** Options for the Sort by dropdown (combined field + direction) */
export const WORKSPACE_SORT_OPTIONS: { label: string; value: WorkspaceSortOption }[] = [
  { label: "Name (A → Z)", value: "name_asc" },
  { label: "Name (Z → A)", value: "name_desc" },
  { label: "Last run (newest first)", value: "lastRun_desc" },
  { label: "Last run (oldest first)", value: "lastRun_asc" },
  { label: "Job status (grouped)", value: "status" },
  { label: "Repository (A → Z)", value: "source_asc" },
  { label: "Repository (Z → A)", value: "source_desc" },
  { label: "Terraform version (A → Z)", value: "terraformVersion_asc" },
  { label: "Terraform version (Z → A)", value: "terraformVersion_desc" },
];
