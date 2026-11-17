import axiosInstance from "@/config/axiosConfig";
import type { RelationshipBody } from "@/domain/api";
import type { JobStatus, PolicyComplianceStatus } from "@/domain/generated/apiResources";
import { apiPost } from "@/modules/api/apiWrapper";
import { ApiFailure, ApiResponse } from "@/modules/api/types";
import { WorkspacePageRequest, WorkspaceTagBinding, WorkspaceTagFilter } from "@/modules/workspaces/types";
import formatSshUrl from "@/modules/workspaces/utils/formatSshUrl";
import quoteRsql from "@/modules/workspaces/utils/quoteRsql";

/** A workspace as the organization and project workspace lists show it. */
export type WorkspaceListItem = {
  id: string;
  name: string;
  description?: string;
  source: string;
  normalizedSource?: string;
  branch?: string;
  terraformVersion?: string;
  iacType: string;
  lastStatus?: JobStatus;
  lastRun?: string;
  locked?: boolean;
  policyComplianceStatus?: PolicyComplianceStatus;
  tags: WorkspaceTagBinding[];
  projectId?: string;
  projectName?: string;
};

type ListWorkspacesResult = {
  organizationId: string;
  organizationName: string;
  workspaces: WorkspaceListItem[];
};

/** One server-side page of an organization's workspaces, with the filter facet counts. */
export type WorkspacePageResult = {
  organizationName: string;
  workspaces: WorkspaceListItem[];
  pageInfo: { endCursor?: string; hasNextPage: boolean; totalRecords: number };
  statusCounts: Record<string, number>;
  policyCounts: Record<string, number>;
};

// The GraphQL bodies are read field by field below, with every field optional.
const anyBody = (body: unknown): any => body;

async function listWorkspaces(organizationId: string): Promise<ApiResponse<ListWorkspacesResult>> {
  const body = {
    query: `{
          organization(ids: ["${organizationId}"]) {
            edges {
              node {
                id
                name
                workspace(sort: "name") {
                  edges {
                    node {
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
                            id
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
                  }
                }
              }
            }
          }
        }`,
  };

  const tempData = await apiPost("/graphql/api/v1", body, anyBody, {
    dataWrapped: true,
    contentType: "application/json",
  });

  if (tempData.isError) {
    return tempData;
  }
  const organization = tempData.data.organization.edges[0].node;
  const includes = tempData.data.organization.edges[0].node.workspace.edges;

  const workspaces = includes.map((element: any) => {
    const lastStatus = element.node.lastJobStatus;
    const lastJobDate = element.node.lastJobDate;
    const ws: WorkspaceListItem = {
      id: element.node.id,
      lastRun: lastJobDate,
      lastStatus,
      name: element.node.name,
      description: element.node.description,
      branch: element.node.branch,
      iacType: element.node.iacType,
      source: element.node.source,
      normalizedSource: formatSshUrl(element.node.source),
      terraformVersion: element.node.terraformVersion,
      locked: element.node.locked,
      policyComplianceStatus: element.node.policyComplianceStatus,
      tags: toTagBindings(element.node?.workspaceTag?.edges),
      projectId: element.node?.project?.edges?.[0]?.node?.id,
      projectName: element.node?.project?.edges?.[0]?.node?.name,
    };
    return ws;
  });

  return {
    isError: false,
    responseCode: tempData.responseCode,
    originResponseCode: tempData.originResponseCode,
    data: {
      organizationId: organization?.id,
      organizationName: organization?.name,
      workspaces,
    },
  };
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

function combineFilters(...filters: (string | undefined)[]): string | undefined {
  return filters.filter(Boolean).join(";") || undefined;
}

function toTagBindings(edges: any): WorkspaceTagBinding[] {
  return edges?.map(({ node }: any) => ({ tagId: node.tagId, value: node.value ?? null })) ?? [];
}

/** One tag filter as RSQL. Elide puts both predicates on one join alias, so they match the same binding. */
function tagPairExpression({ tagId, value }: WorkspaceTagFilter): string {
  const key = `workspaceTag.tagId==${quoteRsql(tagId)}`;
  return value ? `${key};workspaceTag.value==${quoteRsql(value)}` : key;
}

type WorkspaceFilterOverrides = Pick<WorkspacePageRequest, "status" | "policyStatus">;

function workspaceFilter(
  request: WorkspacePageRequest,
  overrides: WorkspaceFilterOverrides = {},
  tagExpression?: string
): string | undefined {
  const status = overrides.status ?? request.status;
  const policyStatus = overrides.policyStatus ?? request.policyStatus;
  const search = request.search?.trim();
  return combineFilters(
    search ? `(name=ini=${quoteRsql(`*${search}*`)},description=ini=${quoteRsql(`*${search}*`)})` : undefined,
    tagExpression,
    request.projectId === "__unassigned__"
      ? "project.id=isnull=true"
      : request.projectId
        ? `project.id==${quoteRsql(request.projectId)}`
        : undefined,
    status && status !== "All"
      ? status === "NeverExecuted"
        ? "(lastJobStatus=isnull=true,lastJobStatus==NeverExecuted)"
        : status === "waitingApproval"
          ? // lastJobStatus is the status of whichever run changed last, so a run waiting for approval is
            // hidden by a newer pending or completed run. Look at the runs themselves too.
            `(lastJobStatus==${quoteRsql(status)},job.status==${quoteRsql(status)})`
          : `lastJobStatus==${quoteRsql(status)}`
      : undefined,
    policyStatus && policyStatus !== "All"
      ? policyStatus === "UNKNOWN"
        ? "(policyComplianceStatus=isnull=true,policyComplianceStatus==UNKNOWN)"
        : `policyComplianceStatus==${quoteRsql(policyStatus)}`
      : undefined
  );
}

const STATUS_COUNT_KEYS = ["waitingApproval", "failed", "pending", "queue", "running", "completed", "NeverExecuted"];
const POLICY_COUNT_KEYS = ["COMPLIANT", "NON_COMPLIANT", "EXEMPTED", "UNKNOWN"];

// Workspace is annotated @Paginate(maxPageSize = 10000) on the API side; asking for more is rejected.
const TAG_MATCH_PAGE_SIZE = 10000;

// The resolved ids are sent back once in the page query and once per facet count, and SQL Server allows at
// most 2100 parameters per statement.
const MAX_TAG_MATCH_IDS = 1000;

// Nothing has a null id. Still asking the server for an empty page keeps the facet counts and the
// organization name in the response.
const MATCHES_NOTHING = "id=isnull=true";

// Page turns and polling repeat the same request. Kept short, since tags also change outside this page.
const TAG_MATCH_CACHE_MS = 15000;
const TAG_MATCH_CACHE = { key: "", expression: "", resolvedAt: 0 };

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

/**
 * The tag part of the workspace filter, or the response that stopped it.
 *
 * One tag filter is a plain RSQL predicate. Several are ANDed, which Elide cannot express in one RSQL
 * expression: predicates on the same to-many path share a join alias, so two key/value pairs would have to
 * match one binding row. Instead the ids each filter matches are fetched in one aliased query and
 * intersected into `id=in=(...)`, which keeps paging, sorting and the facet counts on the server. A failed
 * or truncated lookup fails the page rather than show a list that is quietly missing workspaces.
 */
async function tagFilterExpression(
  request: WorkspacePageRequest
): Promise<{ expression?: string; failed?: ApiFailure }> {
  const filters = request.tagFilters ?? [];
  if (filters.length <= 1) return { expression: filters[0] && tagPairExpression(filters[0]) };

  const cacheKey = JSON.stringify([request.organizationId, filters]);
  if (TAG_MATCH_CACHE.key === cacheKey && Date.now() - TAG_MATCH_CACHE.resolvedAt < TAG_MATCH_CACHE_MS) {
    return { expression: TAG_MATCH_CACHE.expression };
  }

  const aliases = filters.map((_, index) => `p${index}`);
  const body = {
    query: `query WorkspaceTagMatches($organizationIds: [String], ${aliases
      .map((alias) => `$${alias}: String`)
      .join(", ")}) {
      organization(ids: $organizationIds) {
        edges {
          node {
            ${aliases
              .map(
                (alias) =>
                  `${alias}: workspace(first: "${TAG_MATCH_PAGE_SIZE}", filter: $${alias}) { edges { node { id } } pageInfo { totalRecords } }`
              )
              .join("\n            ")}
          }
        }
      }
    }`,
    variables: {
      organizationIds: [request.organizationId],
      ...Object.fromEntries(aliases.map((alias, index) => [alias, tagPairExpression(filters[index])])),
    },
  };

  const response = await apiPost("/graphql/api/v1", body, anyBody, {
    dataWrapped: true,
    contentType: "application/json",
  });
  if (response.isError) return { failed: response };

  const organization = response.data?.organization?.edges?.[0]?.node;
  let intersection: string[] | undefined;
  for (const alias of aliases) {
    const page = organization?.[alias];
    const ids: string[] = page?.edges?.map(({ node }: any) => node.id) ?? [];
    if ((page?.pageInfo?.totalRecords ?? 0) > ids.length) return { failed: TOO_MANY_TAG_MATCHES };
    const matched = new Set(ids);
    intersection = intersection === undefined ? ids : intersection.filter((id) => matched.has(id));
  }
  const ids = intersection ?? [];
  if (ids.length > MAX_TAG_MATCH_IDS) return { failed: TOO_MANY_TAG_MATCHES };

  const expression = ids.length === 0 ? MATCHES_NOTHING : `id=in=(${ids.map(quoteRsql).join(",")})`;
  Object.assign(TAG_MATCH_CACHE, { key: cacheKey, expression, resolvedAt: Date.now() });
  return { expression };
}

async function listWorkspacePage(
  request: WorkspacePageRequest,
  includeStatusCounts = true
): Promise<ApiResponse<WorkspacePageResult>> {
  const { expression: tagExpression, failed } = await tagFilterExpression(request);
  if (failed) {
    return failed;
  }
  const filter = workspaceFilter(request, {}, tagExpression);
  // Facet counts: each dimension is counted with every other filter applied, but its own filter varied.
  const countFilters: Record<string, string | undefined> = includeStatusCounts
    ? {
        statusAll: workspaceFilter(request, { status: "All" }, tagExpression),
        ...Object.fromEntries(
          STATUS_COUNT_KEYS.map((key) => [`status_${key}`, workspaceFilter(request, { status: key }, tagExpression)])
        ),
        policyAll: workspaceFilter(request, { policyStatus: "All" }, tagExpression),
        ...Object.fromEntries(
          POLICY_COUNT_KEYS.map((key) => [
            `policy_${key}`,
            workspaceFilter(request, { policyStatus: key }, tagExpression),
          ])
        ),
      }
    : {};
  const countAliases = Object.keys(countFilters);
  const body = {
    query: `query WorkspacePage(
      $organizationIds: [String]
      $first: StringOrInt
      $after: StringOrInt
      ${filter ? "$filter: String" : ""}
      $sort: String
      ${countAliases
        .filter((alias) => countFilters[alias])
        .map((alias) => `$${alias}: String`)
        .join("\n      ")}
    ) {
      organization(ids: $organizationIds) {
        edges {
          node {
            name
            workspace(first: $first, after: $after, ${filter ? "filter: $filter," : ""} sort: $sort) {
              edges {
                node {
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
                  workspaceTag { edges { node { tagId value } } }
                  project { edges { node { id name } } }
                }
              }
              pageInfo { endCursor hasNextPage totalRecords }
            }
            ${countAliases
              .map(
                (alias) =>
                  `${alias}: workspace(first: "1"${countFilters[alias] ? `, filter: $${alias}` : ""}) { pageInfo { totalRecords } }`
              )
              .join("\n            ")}
          }
        }
      }
    }`,
    variables: {
      organizationIds: [request.organizationId],
      first: String(request.first),
      after: String(request.after),
      filter,
      sort: workspaceSortMap[request.sort],
      ...countFilters,
    },
  };

  const response = await apiPost("/graphql/api/v1", body, anyBody, {
    dataWrapped: true,
    contentType: "application/json",
  });

  if (response.isError) {
    return response;
  }

  const organization = response.data?.organization?.edges?.[0]?.node;
  const page = organization?.workspace ?? { edges: [], pageInfo: { hasNextPage: false, totalRecords: 0 } };
  const workspaces: WorkspaceListItem[] = page.edges.map(({ node }: any) => ({
    id: node.id,
    name: node.name,
    description: node.description,
    source: node.source ?? "",
    normalizedSource: node.source ? formatSshUrl(node.source) : undefined,
    branch: node.branch,
    terraformVersion: node.terraformVersion,
    iacType: node.iacType ?? "terraform",
    lastStatus: node.lastJobStatus,
    lastRun: node.lastJobDate,
    locked: node.locked,
    policyComplianceStatus: node.policyComplianceStatus,
    tags: toTagBindings(node.workspaceTag?.edges),
    projectId: node.project?.edges?.[0]?.node?.id,
    projectName: node.project?.edges?.[0]?.node?.name,
  }));
  const count = (alias: string) => organization?.[alias]?.pageInfo?.totalRecords ?? 0;

  return {
    isError: false,
    responseCode: response.responseCode,
    data: {
      organizationName: organization?.name ?? "",
      workspaces,
      pageInfo: page.pageInfo,
      statusCounts: {
        All: count("statusAll"),
        ...Object.fromEntries(STATUS_COUNT_KEYS.map((key) => [key, count(`status_${key}`)])),
      },
      policyCounts: {
        All: count("policyAll"),
        ...Object.fromEntries(POLICY_COUNT_KEYS.map((key) => [key, count(`policy_${key}`)])),
      },
    },
  };
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
