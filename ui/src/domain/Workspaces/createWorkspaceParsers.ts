import { isRecord } from "@/modules/utils/typeGuards";
import type { VcsRepositoryGroup, VcsRepositoryPage, VcsRepositorySummary } from "../types";
import { compareVersions } from "./Workspaces";

const tofuReleaseTags = (index: unknown): string[] => {
  if (!Array.isArray(index)) {
    return [];
  }
  const releases: unknown[] = index;
  return releases.flatMap((release) =>
    isRecord(release) && typeof release.tag_name === "string" ? [release.tag_name] : []
  );
};

const terraformVersionKeys = (index: unknown): string[] =>
  isRecord(index) && isRecord(index.versions) ? Object.keys(index.versions) : [];

/**
 * Lists the stable versions in an IaC version index, newest first: OpenTofu's is an array of releases,
 * Terraform's an object keyed by version. A malformed index yields no versions rather than throwing.
 */
export const parseVersionIndex = (iacTypeId: string, index: unknown): string[] => {
  const versions =
    iacTypeId === "tofu"
      ? tofuReleaseTags(index)
          .filter((tag) => !tag.includes("-"))
          .map((tag) => tag.replace("v", ""))
      : terraformVersionKeys(index).filter((version) => !version.includes("-"));
  return versions.sort(compareVersions).reverse();
};

const isVcsRepositoryGroup = (value: unknown): value is VcsRepositoryGroup =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string";

const isVcsRepositorySummary = (value: unknown): value is VcsRepositorySummary =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.fullName === "string" &&
  typeof value.group === "string" &&
  typeof value.url === "string" &&
  typeof value.privateRepo === "boolean" &&
  (value.defaultBranch === undefined || typeof value.defaultBranch === "string");

/** Reads the VCS discovery groups response, keeping only well-formed groups. */
export const parseVcsRepositoryGroups = (data: unknown): VcsRepositoryGroup[] => {
  if (!Array.isArray(data)) {
    return [];
  }
  const groups: unknown[] = data;
  return groups.filter(isVcsRepositoryGroup);
};

/** Reads one page of the VCS discovery repositories response, or `null` when it is not a page. */
export const parseVcsRepositoryPage = (data: unknown): VcsRepositoryPage | null => {
  if (
    !isRecord(data) ||
    !Array.isArray(data.items) ||
    typeof data.hasMore !== "boolean" ||
    typeof data.page !== "number"
  ) {
    return null;
  }
  const items: unknown[] = data.items;
  return { items: items.filter(isVcsRepositorySummary), hasMore: data.hasMore, page: data.page };
};

/** Returns the id of the first resource in a JSON:API atomic operations response, if there is one. */
export const firstAtomicResultId = (data: unknown): string | undefined => {
  if (!isRecord(data) || !Array.isArray(data["atomic:results"])) {
    return undefined;
  }
  const results: unknown[] = data["atomic:results"];
  const first = results[0];
  if (!isRecord(first) || !isRecord(first.data) || typeof first.data.id !== "string") {
    return undefined;
  }
  return first.data.id;
};
