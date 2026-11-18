import type { AxiosRequestConfig } from "axios";
import { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { parse } from "graphql";
import { connectionNodes, graphqlRequest, GraphQLRequestError } from "../graphqlRequest";

type GraphQLBody = { query: string; variables: unknown };

const mockPost = jest.fn<Promise<{ data: unknown }>, [path: string, body: GraphQLBody, config?: AxiosRequestConfig]>();

jest.mock("@/config/axiosConfig", () => ({
  axiosGraphQL: { post: (...args: Parameters<typeof mockPost>) => mockPost(...args) },
}));

type NameResult = { organization?: { edges: { node: { name: string } }[] } };
type NameVariables = { ids: string[] };

const OrganizationName: TypedDocumentNode<NameResult, NameVariables> = parse(
  "query OrganizationName($ids: [String]) { organization(ids: $ids) { edges { node { name } } } }"
);

describe("graphqlRequest", () => {
  beforeEach(() => mockPost.mockReset());

  it("sends variables, not interpolated ids", async () => {
    mockPost.mockResolvedValue({ data: { data: { organization: { edges: [{ node: { name: "acme" } }] } } } });

    const result = await graphqlRequest(OrganizationName, { ids: ["org-1"] });

    const [path, body] = mockPost.mock.calls[0];
    expect(path).toBe("");
    expect(body.variables).toEqual({ ids: ["org-1"] });
    expect(body.query).toContain("organization(ids: $ids)");
    expect(body.query).not.toContain("org-1");
    expect(result).toEqual({ organization: { edges: [{ node: { name: "acme" } }] } });
  });

  it("rejects on errors", async () => {
    mockPost.mockResolvedValue({ data: { data: null, errors: [{ message: "Forbidden" }, { message: "No org" }] } });

    const request = graphqlRequest(OrganizationName, { ids: ["org-1"] });

    await expect(request).rejects.toThrow(GraphQLRequestError);
    await expect(request).rejects.toThrow("Forbidden\nNo org");
  });

  it("rejects when the response carries no data", async () => {
    mockPost.mockResolvedValue({ data: {} });

    await expect(graphqlRequest(OrganizationName, { ids: ["org-1"] })).rejects.toThrow(GraphQLRequestError);
  });

  it("rejects a body that is not a GraphQL response, such as an HTML error page", async () => {
    mockPost.mockResolvedValue({ data: "<html>Bad gateway</html>" });

    await expect(graphqlRequest(OrganizationName, { ids: ["org-1"] })).rejects.toThrow(
      "Expected a GraphQL response body"
    );
  });

  it("keeps the readable messages of malformed errors", async () => {
    mockPost.mockResolvedValue({ data: { errors: [{ message: "Forbidden" }, "oops", { code: 1 }] } });

    await expect(graphqlRequest(OrganizationName, { ids: ["org-1"] })).rejects.toThrow("Forbidden\n\n");
  });

  it("passes the abort signal to the request", async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    const controller = new AbortController();

    await graphqlRequest(OrganizationName, { ids: ["org-1"] }, controller.signal);

    const [, , config] = mockPost.mock.calls[0];
    expect(config).toMatchObject({ signal: controller.signal });
  });
});

describe("connectionNodes", () => {
  it("unwraps the nodes of a connection, skipping null edges and nodes", () => {
    expect(connectionNodes({ edges: [{ node: { id: "a" } }, null, { node: null }, { node: { id: "b" } }] })).toEqual([
      { id: "a" },
      { id: "b" },
    ]);
  });

  it("reads an absent connection as empty", () => {
    expect(connectionNodes(null)).toEqual([]);
    expect(connectionNodes({ edges: null })).toEqual([]);
  });
});
