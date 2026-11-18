import organizationService from "../organizationService";
import { type GraphQLPostArgs, lastGraphQLRequest } from "@/testUtils/graphqlPost";

const mockPost = jest.fn<Promise<{ data: unknown }>, GraphQLPostArgs>();
jest.mock("@/config/axiosConfig", () => ({
  axiosGraphQL: { post: (...args: Parameters<typeof mockPost>) => mockPost(...args) },
}));

describe("organizationService.listOrganizationSummaries", () => {
  it("maps the organization GraphQL response to the picker model", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [
              {
                node: {
                  id: "org-1",
                  name: "acme",
                  description: "desc",
                  executionMode: "remote",
                  icon: "FaBuilding:#000000",
                },
              },
            ],
          },
        },
      },
    });

    const result = await organizationService.listOrganizationSummaries();

    expect(result).toEqual([
      { id: "org-1", name: "acme", description: "desc", executionMode: "remote", icon: "FaBuilding:#000000" },
    ]);
  });

  it("does not list the workspaces of every organization", async () => {
    mockPost.mockResolvedValue({ data: { data: { organization: { edges: [] } } } });

    await organizationService.listOrganizationSummaries();

    const { query } = lastGraphQLRequest(mockPost.mock.calls);
    expect(query).not.toContain("workspace");
  });

  it("throws a useful error when GraphQL returns errors", async () => {
    mockPost.mockResolvedValue({
      data: { errors: [{ message: "Forbidden" }] },
    });

    await expect(organizationService.listOrganizationSummaries()).rejects.toThrow("Forbidden");
  });
});

describe("organizationService.listOrganizationWorkspaceCounts", () => {
  it("counts each organization's workspaces by last run status", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [
              {
                node: {
                  id: "org-1",
                  workspace: {
                    edges: [
                      { node: { id: "workspace-1", lastJobStatus: "failed" } },
                      { node: { id: "workspace-2", lastJobStatus: "completed" } },
                      { node: { id: "workspace-3" } },
                    ],
                  },
                },
              },
              { node: { id: "org-2", workspace: { edges: [] } } },
            ],
          },
        },
      },
    });

    const result = await organizationService.listOrganizationWorkspaceCounts();

    const { url, query, config } = lastGraphQLRequest(mockPost.mock.calls);
    expect(url).toBe("");
    expect(query).toContain("lastJobStatus");
    expect(config).toEqual({ headers: { "Content-Type": "application/json" } });
    expect(result).toEqual({
      "org-1": { workspaceCount: 3, workspaceStatusCounts: { failed: 1, completed: 1, NeverExecuted: 1 } },
      "org-2": { workspaceCount: 0, workspaceStatusCounts: {} },
    });
  });

  it("throws when the GraphQL response contains errors", async () => {
    mockPost.mockResolvedValue({ data: { errors: [{ message: "Forbidden" }] } });

    await expect(organizationService.listOrganizationWorkspaceCounts()).rejects.toThrow("Forbidden");
  });
});

describe("organizationService.listOrganizationTags", () => {
  it("flattens the organization's tag edges into a plain list", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [
              {
                node: {
                  tag: {
                    edges: [{ node: { id: "tag-1", name: "billing" } }, { node: { id: "tag-2", name: "platform" } }],
                  },
                },
              },
            ],
          },
        },
      },
    });

    const result = await organizationService.listOrganizationTags("org-1");

    const { query, variables } = lastGraphQLRequest(mockPost.mock.calls);
    expect(query).not.toContain("org-1");
    expect(variables).toEqual({ ids: ["org-1"] });
    expect(result).toEqual([
      { id: "tag-1", name: "billing" },
      { id: "tag-2", name: "platform" },
    ]);
  });

  it("returns an empty array when the organization has no tags", async () => {
    mockPost.mockResolvedValue({
      data: { data: { organization: { edges: [{ node: { tag: { edges: [] } } }] } } },
    });

    const result = await organizationService.listOrganizationTags("org-1");

    expect(result).toEqual([]);
  });

  it("throws when the GraphQL response contains errors", async () => {
    mockPost.mockResolvedValue({
      data: { errors: [{ message: "Organization not found" }] },
    });

    await expect(organizationService.listOrganizationTags("org-1")).rejects.toThrow("Organization not found");
  });
});

describe("organizationService.getOrganizationNameGraphQL", () => {
  const orgId = "d9b58bd3-f3fc-4056-a026-1163297e80a8";

  it("reads the name with the id sent as a variable", async () => {
    mockPost.mockResolvedValue({
      data: { data: { organization: { edges: [{ node: { id: orgId, name: "acme" } }] } } },
    });

    const result = await organizationService.getOrganizationNameGraphQL(orgId);

    const { query, variables } = lastGraphQLRequest(mockPost.mock.calls);
    expect(query).not.toContain(orgId);
    expect(variables).toEqual({ ids: [orgId] });
    expect(result).toBe("acme");
  });

  it("does not ask for an id that is not an organization id", async () => {
    mockPost.mockClear();

    expect(await organizationService.getOrganizationNameGraphQL("new")).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("returns null when no organization is visible", async () => {
    mockPost.mockResolvedValue({ data: { data: { organization: { edges: [] } } } });

    expect(await organizationService.getOrganizationNameGraphQL(orgId)).toBeNull();
  });
});
