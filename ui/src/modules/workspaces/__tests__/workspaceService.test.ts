import { axiosGraphQL } from "@/config/axiosConfig";
import workspaceService from "../workspaceService";
import { Kind, parse } from "graphql";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { failure, successData } from "@/testUtils/apiResponse";
import { graphqlBody } from "@/testUtils/graphqlPost";

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { patch: jest.fn() },
  axiosGraphQL: { post: jest.fn() },
}));
jest.mock("@/config/authConfig", () => ({ mgr: { removeUser: jest.fn() } }));

const mockApiPost = jest.mocked(axiosGraphQL.post);
const postedBody = (call: number) => graphqlBody(mockApiPost.mock.calls[call][1]);

describe("workspaceService.listWorkspaces", () => {
  beforeEach(() => mockApiPost.mockReset());

  it("maps the locked field from the GraphQL response", async () => {
    mockApiPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [
              {
                node: {
                  id: "org-1",
                  name: "acme",
                  workspace: {
                    edges: [
                      {
                        node: {
                          id: "ws-1",
                          name: "locked-ws",
                          description: null,
                          source: "",
                          branch: "main",
                          terraformVersion: "1.9.2",
                          iacType: "terraform",
                          lastJobStatus: null,
                          lastJobDate: null,
                          locked: true,
                          policyComplianceStatus: "COMPLIANT",
                          workspaceTag: { edges: [] },
                          project: { edges: [] },
                        },
                      },
                      {
                        node: {
                          id: "ws-2",
                          name: "unlocked-ws",
                          description: null,
                          source: "",
                          branch: "main",
                          terraformVersion: "1.9.2",
                          iacType: "terraform",
                          lastJobStatus: null,
                          lastJobDate: null,
                          locked: false,
                          policyComplianceStatus: "NON_COMPLIANT",
                          workspaceTag: { edges: [] },
                          project: { edges: [] },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    });

    const result = await workspaceService.listWorkspaces("org-1");

    expect(postedBody(0).variables).toEqual({ organizationIds: ["org-1"] });
    expect(postedBody(0).query).not.toContain("org-1");
    expect(successData(result).workspaces.find((w) => w.id === "ws-1")?.locked).toBe(true);
    expect(successData(result).workspaces.find((w) => w.id === "ws-1")?.policyComplianceStatus).toBe("COMPLIANT");
    expect(successData(result).workspaces.find((w) => w.id === "ws-2")?.locked).toBe(false);
    expect(successData(result).workspaces.find((w) => w.id === "ws-2")?.policyComplianceStatus).toBe("NON_COMPLIANT");
  });
});

describe("workspaceService.listWorkspacePage", () => {
  beforeEach(() => mockApiPost.mockReset());

  it("matches the full request exercised by the API integration test", async () => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage({
      organizationId: "d9b58bd3-f3fc-4056-a026-1163297e80a8",
      first: 20,
      after: 0,
      sort: "name_asc",
      status: "All",
    });
    const fixture: unknown = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../../api/src/test/resources/workspace-page-request.json"), "utf8")
    );
    expect(JSON.parse(JSON.stringify(mockApiPost.mock.calls[0][1]))).toEqual(fixture);
  });

  // Elide rejects a filter argument whose variable is null or missing.
  it.each([true, false])("sends a value for every filter with status counts %s", async (includeStatusCounts) => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage(
      { organizationId: "org-1", first: 20, after: 0, sort: "name_asc", status: "All" },
      includeStatusCounts
    );
    const { query, variables } = graphqlBody(JSON.parse(JSON.stringify(mockApiPost.mock.calls[0][1])));
    const document = parse(query);
    const filterVariables = [...query.matchAll(/filter: \$(\w+)/g)].map(([, name]) => name);
    expect(document.definitions[0].kind).toBe(Kind.OPERATION_DEFINITION);
    expect(filterVariables).toContain("filter");
    expect(filterVariables.includes("statusAll")).toBe(includeStatusCounts);
    for (const name of filterVariables) {
      expect(typeof variables[name]).toBe("string");
    }
    expect(variables.filter).toBe("id=isnull=false");
  });

  it("finds workspaces with a run waiting for approval even when a newer run changed lastJobStatus", async () => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage({
      organizationId: "org-1",
      first: 20,
      after: 0,
      sort: "name_asc",
      status: "waitingApproval",
    });
    const { variables } = graphqlBody(JSON.parse(JSON.stringify(mockApiPost.mock.calls[0][1])));
    const waiting = "(lastJobStatus=='waitingApproval',job.status=='waitingApproval')";
    expect(variables.filter).toBe(waiting);
    expect(variables.status_waitingApproval).toBe(waiting);
    // Every other status still filters on lastJobStatus alone.
    expect(variables.status_pending).toBe("lastJobStatus=='pending'");
  });

  it("counts a missing lastJobStatus as never executed and a missing project as unassigned", async () => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage(
      {
        organizationId: "org-1",
        first: 20,
        after: 0,
        sort: "name_asc",
        status: "NeverExecuted",
        projectId: "__unassigned__",
      },
      false
    );
    expect(postedBody(0).variables.filter).toBe(
      "project.id=isnull=true;(lastJobStatus=isnull=true,lastJobStatus=='NeverExecuted')"
    );
  });

  it("keeps a search with quotes and commas inside one value", async () => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage(
      { organizationId: "org-1", first: 20, after: 0, sort: "name_asc", search: ` o'neil, "x" ` },
      false
    );
    expect(postedBody(0).variables.filter).toBe("(name=ini='*o\\'neil, \"x\"*',description=ini='*o\\'neil, \"x\"*')");
  });

  // A status the API does not serialise (e.g. a stale session value) matches no workspace.
  it("matches nothing for an unknown status", async () => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage(
      { organizationId: "org-1", first: 20, after: 0, sort: "name_asc", status: "bogus", policyStatus: "MAYBE" },
      false
    );
    expect(postedBody(0).variables.filter).toBe("id=isnull=true;id=isnull=true");
  });

  it("omits status count queries during polling but keeps the page total", async () => {
    mockApiPost.mockResolvedValue({ data: { data: {} } });
    await workspaceService.listWorkspacePage({ organizationId: "org-1", first: 20, after: 0, sort: "status" }, false);
    const { query, variables } = postedBody(0);
    const document = parse(query);
    expect(document.definitions[0].kind).toBe(Kind.OPERATION_DEFINITION);
    expect(query).toMatch(/pageInfo \{\s+endCursor\s+hasNextPage\s+totalRecords\s+\}/);
    expect(query).not.toMatch(/\w+: workspace/);
    expect(query).not.toContain("$statusAll");
    expect(variables.sort).toBe("lastJobStatus,id");
  });

  it("uses Elide pagination, RSQL filtering, sorting, and page totals", async () => {
    mockApiPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [
              {
                node: {
                  name: "Acme",
                  workspace: {
                    edges: [
                      {
                        node: {
                          id: "ws-1",
                          name: "platform",
                          source: "git@github.com:acme/platform.git",
                          iacType: "terraform",
                          lastJobStatus: "running",
                          lastJobDate: "2026-09-03T12:00:00Z",
                          locked: false,
                          workspaceTag: { edges: [{ node: { tagId: "tag-1", value: "prod" } }] },
                          project: { edges: [{ node: { id: "project-1", name: "Platform" } }] },
                        },
                      },
                    ],
                    pageInfo: { endCursor: "40", hasNextPage: true, totalRecords: 42 },
                  },
                  statusAll: { pageInfo: { totalRecords: 42 } },
                  status_waitingApproval: { pageInfo: { totalRecords: 1 } },
                  status_failed: { pageInfo: { totalRecords: 2 } },
                  status_pending: { pageInfo: { totalRecords: 3 } },
                  status_queue: { pageInfo: { totalRecords: 4 } },
                  status_running: { pageInfo: { totalRecords: 5 } },
                  status_completed: { pageInfo: { totalRecords: 6 } },
                  status_NeverExecuted: { pageInfo: { totalRecords: 7 } },
                  policyAll: { pageInfo: { totalRecords: 5 } },
                  policy_COMPLIANT: { pageInfo: { totalRecords: 3 } },
                  policy_NON_COMPLIANT: { pageInfo: { totalRecords: 1 } },
                  policy_EXEMPTED: { pageInfo: { totalRecords: 0 } },
                  policy_UNKNOWN: { pageInfo: { totalRecords: 1 } },
                },
              },
            ],
          },
        },
      },
    });

    const result = await workspaceService.listWorkspacePage({
      organizationId: "org-1",
      first: 20,
      after: 20,
      search: "platform",
      status: "running",
      policyStatus: "NON_COMPLIANT",
      tagFilters: [{ tagId: "tag-1", value: "prod" }],
      projectId: "project-1",
      sort: "lastRun_desc",
    });

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    const [url, , config] = mockApiPost.mock.calls[0];
    expect(url).toBe("");
    expect(postedBody(0).variables).toMatchObject({
      organizationIds: ["org-1"],
      first: "20",
      after: "20",
      filter:
        "(name=ini='*platform*',description=ini='*platform*');workspaceTag.tagId=='tag-1';workspaceTag.value=='prod';project.id=='project-1';lastJobStatus=='running';policyComplianceStatus=='NON_COMPLIANT'",
      sort: "-lastJobDate,-id",
      statusAll:
        "(name=ini='*platform*',description=ini='*platform*');workspaceTag.tagId=='tag-1';workspaceTag.value=='prod';project.id=='project-1';policyComplianceStatus=='NON_COMPLIANT'",
      policyAll:
        "(name=ini='*platform*',description=ini='*platform*');workspaceTag.tagId=='tag-1';workspaceTag.value=='prod';project.id=='project-1';lastJobStatus=='running'",
      policy_UNKNOWN:
        "(name=ini='*platform*',description=ini='*platform*');workspaceTag.tagId=='tag-1';workspaceTag.value=='prod';project.id=='project-1';lastJobStatus=='running';(policyComplianceStatus=isnull=true,policyComplianceStatus=='UNKNOWN')",
    });
    expect(config).toBeDefined();
    expect(config).not.toBeNull();
    expect(successData(result).organizationName).toBe("Acme");
    expect(postedBody(0).query).toContain("filter: $filter");
    expect(postedBody(0).query).toContain("filter: $statusAll");
    expect(postedBody(0).query).toContain("policy_COMPLIANT: workspace");
    expect(successData(result).pageInfo).toEqual({ endCursor: "40", hasNextPage: true, totalRecords: 42 });
    expect(successData(result).statusCounts.running).toBe(5);
    expect(successData(result).statusCounts.NeverExecuted).toBe(7);
    expect(successData(result).policyCounts).toEqual({
      All: 5,
      COMPLIANT: 3,
      NON_COMPLIANT: 1,
      EXEMPTED: 0,
      UNKNOWN: 1,
    });
    expect(successData(result).workspaces[0]).toEqual(
      expect.objectContaining({
        id: "ws-1",
        normalizedSource: "https://github.com/acme/platform",
        tags: [{ tagId: "tag-1", value: "prod" }],
        projectId: "project-1",
      })
    );
  });

  // Elide resolves every predicate on workspaceTag against one join alias, so an AND of two tag filters
  // cannot be written as a single RSQL expression. The service resolves the ids of each filter first.
  function tagMatchResponse(ids: string[], totalRecords = ids.length) {
    return {
      data: {
        data: {
          organization: {
            edges: [
              { node: { workspace: { edges: ids.map((id) => ({ node: { id } })), pageInfo: { totalRecords } } } },
            ],
          },
        },
      },
    };
  }

  function mockTagMatches(matches: string[][]) {
    for (const ids of matches) {
      mockApiPost.mockResolvedValueOnce(tagMatchResponse(ids));
    }
  }

  const emptyPageResponse = {
    data: {
      data: {
        organization: {
          edges: [
            { node: { name: "Acme", workspace: { edges: [], pageInfo: { hasNextPage: false, totalRecords: 0 } } } },
          ],
        },
      },
    },
  };

  it("ands several tag filters by intersecting the ids each one matches", async () => {
    mockTagMatches([
      ["ws-1", "ws-2"],
      ["ws-2", "ws-3"],
    ]);
    mockApiPost.mockResolvedValueOnce(emptyPageResponse);

    await workspaceService.listWorkspacePage(
      {
        organizationId: "org-and",
        first: 20,
        after: 0,
        tagFilters: [{ tagId: "tag-env", value: "prod" }, { tagId: "tag-team" }],
        sort: "name_asc",
      },
      false
    );

    const [envQuery, teamQuery, pageQuery] = [0, 1, 2].map(postedBody);
    expect(envQuery.variables).toEqual({
      organizationIds: ["org-and"],
      first: "10000",
      filter: "workspaceTag.tagId=='tag-env';workspaceTag.value=='prod'",
    });
    expect(teamQuery.variables.filter).toBe("workspaceTag.tagId=='tag-team'");
    expect(pageQuery.variables.filter).toBe("id=in=('ws-2')");
  });

  it("asks for nothing when the tag filters have no workspace in common", async () => {
    mockTagMatches([["ws-1"], ["ws-2"]]);
    mockApiPost.mockResolvedValueOnce(emptyPageResponse);

    const result = await workspaceService.listWorkspacePage(
      {
        organizationId: "org-disjoint",
        first: 20,
        after: 0,
        search: "api",
        tagFilters: [
          { tagId: "tag-env", value: "prod" },
          { tagId: "tag-team", value: "infra" },
        ],
        sort: "name_asc",
      },
      false
    );

    const pageQuery = postedBody(2);
    expect(pageQuery.variables.filter).toBe("(name=ini='*api*',description=ini='*api*');id=isnull=true");
    expect(successData(result).workspaces).toEqual([]);
    expect(successData(result).organizationName).toBe("Acme");
  });

  it("reuses the resolved ids across page turns instead of resolving them again", async () => {
    mockTagMatches([["ws-1", "ws-2"], ["ws-2"]]);
    mockApiPost.mockResolvedValue(emptyPageResponse);

    const request = {
      organizationId: "org-cache",
      first: 20,
      after: 0,
      tagFilters: [{ tagId: "tag-env", value: "prod" }, { tagId: "tag-team" }],
      sort: "name_asc" as const,
    };
    await workspaceService.listWorkspacePage(request, false);
    await workspaceService.listWorkspacePage({ ...request, after: 20 }, false);

    // One resolution of two filters, two page requests.
    expect(mockApiPost).toHaveBeenCalledTimes(4);
    expect(postedBody(3).variables.filter).toBe("id=in=('ws-2')");
  });

  const andRequest = (organizationId: string) => ({
    organizationId,
    first: 20,
    after: 0,
    tagFilters: [{ tagId: "tag-env", value: "prod" }, { tagId: "tag-team" }],
    sort: "name_asc" as const,
  });

  it("fails the page instead of showing no workspaces when resolving the ids fails", async () => {
    mockApiPost.mockResolvedValueOnce({ data: { errors: [{ message: "boom" }] } });
    mockApiPost.mockResolvedValueOnce(tagMatchResponse(["ws-1"]));

    const result = await workspaceService.listWorkspacePage(andRequest("org-error"), false);

    expect(result.isError).toBe(true);
    expect(failure(result).error?.message).toBe("boom");
    // The page itself is not requested with a filter that would match nothing
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed resolution, so the next request tries again", async () => {
    mockApiPost.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    mockApiPost.mockResolvedValueOnce(tagMatchResponse(["ws-1"]));
    mockTagMatches([["ws-1"], ["ws-1"]]);
    mockApiPost.mockResolvedValueOnce(emptyPageResponse);

    await workspaceService.listWorkspacePage(andRequest("org-retry"), false);
    await workspaceService.listWorkspacePage(andRequest("org-retry"), false);

    expect(postedBody(4).variables.filter).toBe("id=in=('ws-1')");
  });

  it("refuses an AND of tag filters that matches more workspaces than can be sent back", async () => {
    const many = Array.from({ length: 1001 }, (_, index) => `ws-${index}`);
    mockTagMatches([many, many]);

    const result = await workspaceService.listWorkspacePage(andRequest("org-many"), false);

    expect(result.isError).toBe(true);
    expect(failure(result).error?.status).toBe("Too many matching workspaces");
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it("refuses to intersect a tag filter whose matches did not fit in one page", async () => {
    mockApiPost.mockResolvedValueOnce(tagMatchResponse(["ws-1"], 10001));
    mockApiPost.mockResolvedValueOnce(tagMatchResponse(["ws-1"]));

    const result = await workspaceService.listWorkspacePage(andRequest("org-truncated"), false);

    expect(result.isError).toBe(true);
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it("resolves the ids again once the cache is cleared", async () => {
    mockTagMatches([["ws-1"], ["ws-1"]]);
    mockApiPost.mockResolvedValueOnce(emptyPageResponse);
    mockTagMatches([["ws-2"], ["ws-2"]]);
    mockApiPost.mockResolvedValueOnce(emptyPageResponse);

    await workspaceService.listWorkspacePage(andRequest("org-clear"), false);
    workspaceService.clearTagFilterCache();
    await workspaceService.listWorkspacePage(andRequest("org-clear"), false);

    expect(postedBody(5).variables.filter).toBe("id=in=('ws-2')");
  });

  it("sends a single tag filter as one query, without resolving ids", async () => {
    mockApiPost.mockResolvedValueOnce(emptyPageResponse);

    await workspaceService.listWorkspacePage(
      {
        organizationId: "org-single",
        first: 20,
        after: 0,
        tagFilters: [{ tagId: "tag-env", value: "prod" }],
        sort: "name_asc",
      },
      false
    );

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(postedBody(0).variables.filter).toBe("workspaceTag.tagId=='tag-env';workspaceTag.value=='prod'");
  });
});
