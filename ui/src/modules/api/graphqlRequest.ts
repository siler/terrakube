import { axiosGraphQL } from "@/config/axiosConfig";
import { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";
import { isRecord } from "@/modules/utils/typeGuards";

/** The `errors` of a GraphQL response, joined into one message. */
export class GraphQLRequestError extends Error {
  constructor(messages: string[]) {
    super(messages.join("\n") || "GraphQL request failed");
    this.name = "GraphQLRequestError";
  }
}

type GraphQLResponse<R> = { data?: R | null; errors?: { message: string }[] };

/**
 * Runs a typed GraphQL document through {@link axiosGraphQL}, resolving its `data` and rejecting with a
 * {@link GraphQLRequestError} when the server reports errors.
 */
export const graphqlRequest = async <R, V>(
  document: TypedDocumentNode<R, V>,
  variables: V,
  signal?: AbortSignal
): Promise<R> => {
  const response = await axiosGraphQL.post<GraphQLResponse<R>>(
    "",
    { query: print(document), variables },
    { headers: { "Content-Type": "application/json" }, signal }
  );
  const body: unknown = response.data;
  if (!isRecord(body)) {
    throw new GraphQLRequestError(["Expected a GraphQL response body"]);
  }
  const errors = Array.isArray(body.errors) ? body.errors : [];
  // Elide can answer with partial data next to errors; a partial read is never resolved.
  if (errors.length > 0 || !isRecord(body.data)) {
    throw new GraphQLRequestError(
      errors.map((error: unknown) => (isRecord(error) && typeof error.message === "string" ? error.message : ""))
    );
  }
  // The envelope is checked above; the payload's shape is the generated document's, as codegen typed it.
  const { data } = response.data;
  if (!data) {
    throw new GraphQLRequestError([]);
  }
  return data;
};

type Connection<N> = { edges?: ReadonlyArray<{ node?: N | null } | null> | null } | null | undefined;

/** The nodes of an Elide connection; every edge and node is nullable in its schema. */
export const connectionNodes = <N>(connection: Connection<N>): N[] =>
  (connection?.edges ?? []).flatMap((edge) => (edge?.node ? [edge.node] : []));

/** The node type of a generated connection type. */
export type ConnectionNode<C extends Connection<unknown>> = NonNullable<
  NonNullable<NonNullable<NonNullable<C>["edges"]>[number]>["node"]
>;
