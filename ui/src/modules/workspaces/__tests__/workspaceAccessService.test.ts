import { axiosGraphQL } from "@/config/axiosConfig";
import workspaceAccessService from "../workspaceAccessService";
import { graphqlBody } from "@/testUtils/graphqlPost";

jest.mock("@/config/axiosConfig", () => ({
  __esModule: true,
  default: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  axiosGraphQL: { post: jest.fn() },
}));
jest.mock("@/config/authConfig", () => ({ mgr: { removeUser: jest.fn() } }));

const mockPost = jest.mocked(axiosGraphQL.post);

describe("workspaceAccessService.listWorkspaceAccess", () => {
  beforeEach(() => mockPost.mockReset());

  it("lists the workspace's team access with the id sent as a variable", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          workspace: {
            edges: [
              {
                node: {
                  access: {
                    edges: [
                      {
                        node: {
                          id: "a-1",
                          name: "TEAM",
                          role: null,
                          manageWorkspace: true,
                          manageState: null,
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

    const result = await workspaceAccessService.listWorkspaceAccess("org-1", "ws-1");

    const { query, variables } = graphqlBody(mockPost.mock.calls[0][1]);
    expect(query).not.toContain("ws-1");
    expect(variables).toEqual({ workspaceIds: ["ws-1"] });
    expect(result).toEqual({
      isError: false,
      responseCode: 200,
      data: [
        {
          id: "a-1",
          name: "TEAM",
          role: "custom",
          manageWorkspace: true,
          manageState: false,
          planJob: false,
          approveJob: false,
          destroyJob: true,
        },
      ],
    });
  });

  it("reports GraphQL errors as a failed response", async () => {
    mockPost.mockResolvedValue({ data: { errors: [{ message: "Forbidden" }] } });

    const result = await workspaceAccessService.listWorkspaceAccess("org-1", "ws-1");

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("data");
  });
});
