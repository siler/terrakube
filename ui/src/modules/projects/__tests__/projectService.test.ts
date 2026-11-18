import projectService from "../projectService";
import { failure, successData } from "@/testUtils/apiResponse";
import { type GraphQLPostArgs, lastGraphQLRequest } from "@/testUtils/graphqlPost";

const mockPost = jest.fn<Promise<{ data: unknown }>, GraphQLPostArgs>();
jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  axiosGraphQL: { post: (...args: Parameters<typeof mockPost>) => mockPost(...args) },
}));
jest.mock("@/config/authConfig", () => ({ mgr: { removeUser: jest.fn() } }));

const lastBody = () => lastGraphQLRequest(mockPost.mock.calls);

describe("projectService GraphQL reads", () => {
  beforeEach(() => mockPost.mockReset());

  it("lists an organization's projects with the id sent as a variable", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [{ node: { project: { edges: [{ node: { id: "p-1", name: "Platform", description: null } }] } } }],
          },
        },
      },
    });

    const result = await projectService.listProjects("org-1");

    expect(lastBody().query).not.toContain("org-1");
    expect(lastBody().variables).toEqual({ organizationIds: ["org-1"] });
    expect(result).toEqual({
      isError: false,
      responseCode: 200,
      data: [{ id: "p-1", name: "Platform", description: undefined }],
    });
  });

  it("reads one project with both ids sent as variables", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          organization: {
            edges: [{ node: { project: { edges: [{ node: { id: "p-1", name: "Platform", description: "d" } }] } } }],
          },
        },
      },
    });

    const result = await projectService.getProject("org-1", "p-1");

    expect(lastBody().query).not.toMatch(/org-1|p-1/);
    expect(lastBody().variables).toEqual({ organizationIds: ["org-1"], projectIds: ["p-1"] });
    expect(successData(result)).toEqual({ id: "p-1", name: "Platform", description: "d" });
  });

  it("reads a project that is not visible as an empty one", async () => {
    mockPost.mockResolvedValue({ data: { data: { organization: { edges: [] } } } });

    const result = await projectService.getProject("org-1", "p-1");

    expect(result).toEqual({ isError: false, responseCode: 200, data: { id: "", name: "" } });
  });

  it("lists project access with the permission defaults", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          project: {
            edges: [
              {
                node: {
                  projectAccess: {
                    edges: [
                      {
                        node: {
                          id: "a-1",
                          name: "TEAM",
                          role: null,
                          manageWorkspace: null,
                          manageState: true,
                          manageJob: null,
                          planJob: null,
                          approveJob: null,
                          destroyJob: null,
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

    const result = await projectService.listProjectAccess("org-1", "p-1");

    expect(lastBody().variables).toEqual({ projectIds: ["p-1"] });
    expect(successData(result)).toEqual([
      {
        id: "a-1",
        name: "TEAM",
        role: "custom",
        manageWorkspace: false,
        manageState: true,
        manageJob: false,
        planJob: false,
        approveJob: false,
        destroyJob: true,
      },
    ]);
  });

  it("reports GraphQL errors as a failed response", async () => {
    mockPost.mockResolvedValue({ data: { errors: [{ message: "Forbidden" }] } });

    const result = await projectService.listProjects("org-1");

    expect(result.isError).toBe(true);
    expect(failure(result).error?.message).toBe("Forbidden");
  });
});
