import axiosInstance from "@/config/axiosConfig";
import { and, type Filter, type FilterPaths, or } from "@/domain/api/rsqlFilter";
import { filterFor } from "@/domain/generated/apiPaths";
import type { RelationshipBody } from "@/domain/api/writeBodies";
import { JobStatus, PolicyComplianceStatus } from "@/domain/generated/apiResources";
import { graphql } from "@/domain/generated/graphql";
import type {
  WorkspaceListFieldsFragment,
  WorkspacePageQuery,
  WorkspacePageQueryVariables,
  WorkspacePageWithCountsQueryVariables,
} from "@/domain/generated/graphql/graphql";
import { apiGraphQL } from "@/modules/api/apiWrapper";
import { ConnectionNode, connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import { ApiFailure, ApiResponse } from "@/modules/api/types";
import { WorkspacePageRequest, WorkspaceTagFilter } from "@/modules/workspaces/types";
import formatSshUrl from "@/modules/workspaces/utils/formatSshUrl";

graphql(`
  fragment WorkspaceListFields on Workspace {
    id
    name
    description
    source
    branch
    terraformVersion
    iacType
    lastJobStatus
    lastJobDate
    locked
    policyComplianceStatus
    workspaceTag {
      edges {
        node {
          tagId
          value
        }
      }
    }
    project {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);

const WorkspaceList = graphql(`
  query WorkspaceList($organizationIds: [String]) {
    organization(ids: $organizationIds) {
      edges {
        node {
          id
          name
          workspace(sort: "name") {
            edges {
              node {
                ...WorkspaceListFields
              }
            }
          }
        }
      }
    }
  }
`);

const WorkspacePage = graphql(`
  query WorkspacePage(
    $organizationIds: [String]
    $first: StringOrInt
    $after: StringOrInt
    $filter: String!
    $sort: String
  ) {
    organization(ids: $organizationIds) {
      edges {
        node {
          name
          workspace(first: $first, after: $after, filter: $filter, sort: $sort) {
            edges {
              node {
                ...WorkspaceListFields
              }
            }
            pageInfo {
              endCursor
              hasNextPage
              totalRecords
            }
          }
        }
      }
    }
  }
`);

const WorkspacePageWithCounts = graphql(`
  query WorkspacePageWithCounts(
    $organizationIds: [String]
    $first: StringOrInt
    $after: StringOrInt
    $filter: String!
    $sort: String
    $statusAll: String!
    $status_waitingApproval: String!
    $status_failed: String!
    $status_pending: String!
    $status_queue: String!
    $status_running: String!
    $status_completed: String!
    $status_NeverExecuted: String!
    $policyAll: String!
    $policy_COMPLIANT: String!
    $policy_NON_COMPLIANT: String!
    $policy_EXEMPTED: String!
    $policy_UNKNOWN: String!
  ) {
    organization(ids: $organizationIds) {
      edges {
        node {
          name
          workspace(first: $first, after: $after, filter: $filter, sort: $sort) {
            edges {
              node {
                ...WorkspaceListFields
              }
            }
            pageInfo {
              endCursor
              hasNextPage
              totalRecords
            }
          }
          statusAll: workspace(first: "1", filter: $statusAll) {
            pageInfo {
              totalRecords
            }
          }
          status_waitingApproval: workspace(first: "1", filter: $status_waitingApproval) {
            pageInfo {
              totalRecords
            }
          }
          status_failed: workspace(first: "1", filter: $status_failed) {
            pageInfo {
              totalRecords
            }
          }
          status_pending: workspace(first: "1", filter: $status_pending) {
            pageInfo {
              totalRecords
            }
          }
          status_queue: workspace(first: "1", filter: $status_queue) {
            pageInfo {
              totalRecords
            }
          }
          status_running: workspace(first: "1", filter: $status_running) {
            pageInfo {
              totalRecords
            }
          }
          status_completed: workspace(first: "1", filter: $status_completed) {
            pageInfo {
              totalRecords
            }
          }
          status_NeverExecuted: workspace(first: "1", filter: $status_NeverExecuted) {
            pageInfo {
              totalRecords
            }
          }
          policyAll: workspace(first: "1", filter: $policyAll) {
            pageInfo {
              totalRecords
            }
          }
          policy_COMPLIANT: workspace(first: "1", filter: $policy_COMPLIANT) {
            pageInfo {
              totalRecords
            }
          }
          policy_NON_COMPLIANT: workspace(first: "1", filter: $policy_NON_COMPLIANT) {
            pageInfo {
              totalRecords
            }
          }
          policy_EXEMPTED: workspace(first: "1", filter: $policy_EXEMPTED) {
            pageInfo {
              totalRecords
            }
          }
          policy_UNKNOWN: workspace(first: "1", filter: $policy_UNKNOWN) {
            pageInfo {
              totalRecords
            }
          }
        }
      }
    }
  }
`);

const WorkspaceTagMatches = graphql(`
  query WorkspaceTagMatches($organizationIds: [String], $first: StringOrInt, $filter: String!) {
    organization(ids: $organizationIds) {
      edges {
        node {
          workspace(first: $first, filter: $filter) {
            edges {
              node {
                id
              }
            }
            pageInfo {
              totalRecords
            }
          }
        }
      }
    }
  }
`);

const toWorkspaceListItem = (node: WorkspaceListFieldsFragment) => {
  const project = connectionNodes(node.project)[0];
  return {
    id: node.id ?? "",
    name: node.name ?? "",
    description: node.description ?? undefined,
    source: node.source ?? "",
    normalizedSource: node.source ? formatSshUrl(node.source) : undefined,
    branch: node.branch ?? undefined,
    terraformVersion: node.terraformVersion ?? undefined,
    iacType: node.iacType ?? "terraform",
    lastStatus: node.lastJobStatus ?? undefined,
    lastRun: node.lastJobDate ?? undefined,
    locked: node.locked ?? undefined,
    policyComplianceStatus: node.policyComplianceStatus ?? undefined,
    tags: connectionNodes(node.workspaceTag).map(({ tagId, value }) => ({ tagId: tagId ?? "", value: value ?? null })),
    projectId: project?.id ?? undefined,
    projectName: project?.name ?? undefined,
  };
};

/** A workspace as the organization and project workspace lists show it. */
export type WorkspaceListItem = ReturnType<typeof toWorkspaceListItem>;

async function listWorkspaces(organizationId: string) {
  return apiGraphQL(async () => {
    const data = await graphqlRequest(WorkspaceList, { organizationIds: [organizationId] });
    const organization = connectionNodes(data.organization)[0];
    return {
      organizationId: organization?.id ?? "",
      organizationName: organization?.name ?? "",
      workspaces: connectionNodes(organization?.workspace).map(toWorkspaceListItem),
    };
  });
}

const workspaceSortMap: Record<WorkspacePageRequest["sort"], string> = {
  name_asc: "name,id",
  name_desc: "-name,-id",
  lastRun_asc: "lastJobDate,id",
  lastRun_desc: "-lastJobDate,-id",
  // Server pagination uses the stored status order, without prioritizing active runs.
  status: "lastJobStatus,id",
  source_asc: "source,id",
  source_desc: "-source,-id",
  terraformVersion_asc: "terraformVersion,id",
  terraformVersion_desc: "-terraformVersion,-id",
};

type WorkspaceFilter = Filter<"workspace">;
type WorkspacePaths = FilterPaths<"workspace">;

/** One tag filter. Elide puts both predicates on one join alias, so they match the same binding. */
function tagPair(w: WorkspacePaths, { tagId, value }: WorkspaceTagFilter): WorkspaceFilter {
  const key = w.workspaceTag.tagId.eq(tagId);
  return value ? and(key, w.workspaceTag.value.eq(value)) : key;
}

const isKeyOf = <T extends object>(values: T, value: string): value is Extract<keyof T, string> =>
  Object.prototype.hasOwnProperty.call(values, value);

// A status the API does not serialise matches no workspace, rather than being dropped from the filter.
function statusFilter(w: WorkspacePaths, status: string): WorkspaceFilter {
  if (!isKeyOf(JobStatus, status)) return w.id.isNull();
  if (status === JobStatus.NeverExecuted) return or(w.lastJobStatus.isNull(), w.lastJobStatus.eq(status));
  // lastJobStatus is the status of whichever run changed last, so a run waiting for approval is hidden by a
  // newer pending or completed run. Look at the runs themselves too.
  if (status === JobStatus.waitingApproval) return or(w.lastJobStatus.eq(status), w.job.status.eq(status));
  return w.lastJobStatus.eq(status);
}

function policyFilter(w: WorkspacePaths, policyStatus: string): WorkspaceFilter {
  if (!isKeyOf(PolicyComplianceStatus, policyStatus)) return w.id.isNull();
  const matches = w.policyComplianceStatus.eq(policyStatus);
  return policyStatus === PolicyComplianceStatus.UNKNOWN ? or(w.policyComplianceStatus.isNull(), matches) : matches;
}

type WorkspaceFilterOverrides = Pick<WorkspacePageRequest, "status" | "policyStatus">;
type TagClause = (w: WorkspacePaths) => WorkspaceFilter;

function workspaceFilter(
  request: WorkspacePageRequest,
  overrides: WorkspaceFilterOverrides = {},
  tagClause?: TagClause
): string {
  const status = overrides.status ?? request.status;
  const policyStatus = overrides.policyStatus ?? request.policyStatus;
  const search = request.search?.trim();
  return filterFor("workspace", (w) => {
    const clauses = [
      search ? or(w.name.containsIgnoreCase(search), w.description.containsIgnoreCase(search)) : undefined,
      tagClause?.(w),
      request.projectId === "__unassigned__"
        ? w.project.id.isNull()
        : request.projectId
          ? w.project.id.eq(request.projectId)
          : undefined,
      status && status !== "All" ? statusFilter(w, status) : undefined,
      policyStatus && policyStatus !== "All" ? policyFilter(w, policyStatus) : undefined,
    ].filter((clause) => clause !== undefined);
    // Elide rejects a filter argument whose variable has no value, so an unfiltered read still sends one.
    return clauses.length > 0 ? and(...clauses) : w.id.notNull();
  });
}

const STATUS_COUNT_KEYS = [
  "waitingApproval",
  "failed",
  "pending",
  "queue",
  "running",
  "completed",
  "NeverExecuted",
] as const;
const POLICY_COUNT_KEYS = ["COMPLIANT", "NON_COMPLIANT", "EXEMPTED", "UNKNOWN"] as const;

type FacetAlias =
  | "statusAll"
  | "policyAll"
  | `status_${(typeof STATUS_COUNT_KEYS)[number]}`
  | `policy_${(typeof POLICY_COUNT_KEYS)[number]}`;
type DocumentFacetAlias = Exclude<keyof WorkspacePageWithCountsQueryVariables, keyof WorkspacePageQueryVariables>;

// Collapses to never, failing tsc, when the count keys and WorkspacePageWithCounts' variables drift apart.
type FacetVariables = [FacetAlias, DocumentFacetAlias] extends [DocumentFacetAlias, FacetAlias]
  ? Record<FacetAlias, string>
  : never;

const hasEveryKey = <Key extends string>(
  record: Record<string, string>,
  keys: readonly Key[]
): record is Record<Key, string> => keys.every((key) => typeof record[key] === "string");

const prefixed = <P extends string, K extends string>(
  prefix: P,
  keys: readonly K[],
  value: (key: K) => string
): Record<`${P}${K}`, string> => {
  const names = keys.map((key): `${P}${K}` => `${prefix}${key}`);
  const record: Record<string, string> = Object.fromEntries(keys.map((key, i) => [names[i], value(key)]));
  if (!hasEveryKey(record, names)) {
    throw new Error(`Facet variables missing for ${prefix}`);
  }
  return record;
};

// Workspace is annotated @Paginate(maxPageSize = 10000) on the API side; asking for more is rejected.
const TAG_MATCH_PAGE_SIZE = 10000;

// The resolved ids are sent back once in the page query and once per facet count, and SQL Server allows at
// most 2100 parameters per statement.
const MAX_TAG_MATCH_IDS = 1000;

// Page turns and polling repeat the same request. Kept short, since tags also change outside this page.
const TAG_MATCH_CACHE_MS = 15000;
const TAG_MATCH_CACHE: { key: string; ids: string[]; resolvedAt: number } = { key: "", ids: [], resolvedAt: 0 };

/** Forgets the resolved tag filter, so a change to a workspace's tags shows in the next list request. */
function clearTagFilterCache() {
  TAG_MATCH_CACHE.key = "";
}

const TOO_MANY_TAG_MATCHES: ApiFailure = {
  isError: true,
  responseCode: 400,
  error: {
    status: "Too many matching workspaces",
    message: `These tag filters match more than ${MAX_TAG_MATCH_IDS} workspaces together. Add a filter to narrow them down.`,
  },
};

// Nothing has a null id. Still asking the server for an empty page keeps the facet counts and the
// organization name in the response.
const idClause =
  (ids: string[]): TagClause =>
  (w) =>
    ids.length === 0 ? w.id.isNull() : w.id.in(ids);

/**
 * The tag part of the workspace filter, or the response that stopped it.
 *
 * One tag filter is a plain RSQL predicate. Several are ANDed, which Elide cannot express in one RSQL
 * expression: predicates on the same to-many path share a join alias, so two key/value pairs would have to
 * match one binding row. Instead the ids each filter matches are fetched, one query per filter, and
 * intersected into an id filter, which keeps paging, sorting and the facet counts on the server. A failed
 * or truncated lookup fails the page rather than show a list that is quietly missing workspaces.
 */
async function tagFilterClause(request: WorkspacePageRequest): Promise<{ clause?: TagClause; failed?: ApiFailure }> {
  const filters = request.tagFilters ?? [];
  if (filters.length === 0) return {};
  if (filters.length === 1) return { clause: (w) => tagPair(w, filters[0]) };

  const cacheKey = JSON.stringify([request.organizationId, filters]);
  if (TAG_MATCH_CACHE.key === cacheKey && Date.now() - TAG_MATCH_CACHE.resolvedAt < TAG_MATCH_CACHE_MS) {
    return { clause: idClause(TAG_MATCH_CACHE.ids) };
  }

  const response = await apiGraphQL(() =>
    Promise.all(
      filters.map((tagFilter) =>
        graphqlRequest(WorkspaceTagMatches, {
          organizationIds: [request.organizationId],
          first: String(TAG_MATCH_PAGE_SIZE),
          filter: filterFor("workspace", (w) => tagPair(w, tagFilter)),
        })
      )
    )
  );
  if (response.isError) return { failed: response };

  let intersection: string[] | undefined;
  for (const data of response.data) {
    const page = connectionNodes(data.organization)[0]?.workspace;
    const ids = connectionNodes(page).map((node) => node.id ?? "");
    if ((page?.pageInfo?.totalRecords ?? 0) > ids.length) return { failed: TOO_MANY_TAG_MATCHES };
    const matched = new Set(ids);
    intersection = intersection === undefined ? ids : intersection.filter((id) => matched.has(id));
  }
  const ids = intersection ?? [];
  if (ids.length > MAX_TAG_MATCH_IDS) return { failed: TOO_MANY_TAG_MATCHES };

  Object.assign(TAG_MATCH_CACHE, { key: cacheKey, ids, resolvedAt: Date.now() });
  return { clause: idClause(ids) };
}

type PageOrganization = ConnectionNode<WorkspacePageQuery["organization"]>;

const toWorkspacePage = (organization: PageOrganization | undefined, counts: Record<string, number>) => {
  const pageInfo = organization?.workspace?.pageInfo;
  const count = (alias: FacetAlias) => counts[alias] ?? 0;
  return {
    organizationName: organization?.name ?? "",
    workspaces: connectionNodes(organization?.workspace).map(toWorkspaceListItem),
    pageInfo: {
      endCursor: pageInfo?.endCursor ?? undefined,
      hasNextPage: pageInfo?.hasNextPage ?? false,
      totalRecords: pageInfo?.totalRecords ?? 0,
    },
    statusCounts: Object.fromEntries([
      ["All", count("statusAll")],
      ...STATUS_COUNT_KEYS.map((key) => [key, count(`status_${key}`)] as const),
    ]),
    policyCounts: Object.fromEntries([
      ["All", count("policyAll")],
      ...POLICY_COUNT_KEYS.map((key) => [key, count(`policy_${key}`)] as const),
    ]),
  };
};

/** One server-side page of an organization's workspaces, with the filter facet counts. */
export type WorkspacePageResult = ReturnType<typeof toWorkspacePage>;

async function listWorkspacePage(
  request: WorkspacePageRequest,
  includeStatusCounts = true
): Promise<ApiResponse<WorkspacePageResult>> {
  const { clause: tagClause, failed } = await tagFilterClause(request);
  if (failed) {
    return failed;
  }
  const filterOf = (overrides: WorkspaceFilterOverrides = {}) => workspaceFilter(request, overrides, tagClause);
  const variables = {
    organizationIds: [request.organizationId],
    first: String(request.first),
    after: String(request.after),
    filter: filterOf(),
    sort: workspaceSortMap[request.sort],
  };

  const response = await apiGraphQL(async () => {
    if (!includeStatusCounts) {
      const data = await graphqlRequest(WorkspacePage, variables);
      return toWorkspacePage(connectionNodes(data.organization)[0], {});
    }
    // Facet counts: each dimension is counted with every other filter applied, but its own filter varied.
    const facetFilters: FacetVariables = {
      statusAll: filterOf({ status: "All" }),
      ...prefixed("status_", STATUS_COUNT_KEYS, (status) => filterOf({ status })),
      policyAll: filterOf({ policyStatus: "All" }),
      ...prefixed("policy_", POLICY_COUNT_KEYS, (policyStatus) => filterOf({ policyStatus })),
    };
    const data = await graphqlRequest(WorkspacePageWithCounts, { ...variables, ...facetFilters });
    const { workspace, name, ...facets } = connectionNodes(data.organization)[0] ?? {};
    const counts = Object.fromEntries(
      Object.entries(facets).map(([alias, page]) => [alias, page?.pageInfo?.totalRecords ?? 0])
    );
    return toWorkspacePage({ name, workspace }, counts);
  });

  return response;
}

async function assignWorkspaceToProject(orgId: string, workspaceId: string, projectId: string): Promise<void> {
  const body: RelationshipBody<"workspace", "project"> = { data: { type: "project", id: projectId } };
  await axiosInstance.patch(`organization/${orgId}/workspace/${workspaceId}/relationships/project`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

async function removeWorkspaceFromProject(orgId: string, workspaceId: string): Promise<void> {
  const body: RelationshipBody<"workspace", "project"> = { data: null };
  await axiosInstance.patch(`organization/${orgId}/workspace/${workspaceId}/relationships/project`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

const methods = {
  listWorkspaces,
  listWorkspacePage,
  clearTagFilterCache,
  assignWorkspaceToProject,
  removeWorkspaceFromProject,
};

export default methods;
