import { recordOf } from "@/testUtils/readRequestBody";

type GraphQLBody = { query: string; variables: Record<string, unknown> };

/** Returns the query and variables of a GraphQL request body, failing the test when it is not one. */
export const graphqlBody = (body: unknown): GraphQLBody => {
  const { query, variables } = recordOf(body);
  if (typeof query !== "string") {
    throw new Error(`Expected a GraphQL query string, got ${JSON.stringify(query)}`);
  }
  return { query, variables: recordOf(variables) };
};

/** The arguments `graphqlRequest` passes to `axiosGraphQL.post`, for typing a mock of it. */
export type GraphQLPostArgs = [url: string, body: unknown, config?: unknown];

/**
 * The latest request in a mock's `mock.calls` of `axiosGraphQL.post`, failing the test when none was made or its
 * body is not GraphQL.
 */
export const lastGraphQLRequest = (calls: readonly GraphQLPostArgs[]) => {
  const call = calls[calls.length - 1];
  if (call === undefined) {
    throw new Error("Expected a GraphQL request, but none was made");
  }
  const [url, body, config] = call;
  return { url, ...graphqlBody(body), config };
};
