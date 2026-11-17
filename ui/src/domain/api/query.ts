import axiosInstance from "@/config/axiosConfig";
import type { API_SCHEMA, ApiTypeName } from "../generated/apiResources";
import { filterWith, type Filter, type FilterPaths } from "./filter";
import { parseApiDocument } from "./document";
import { flattenItem, flattenList, type ApiDocument } from "./flatten";
import type { IsMany, IsRequired, RelationshipName, TargetOf } from "./schema";
import {
  buildQuery,
  fragment,
  isFragment,
  SELECTED,
  toQueryString,
  type Fragment,
  type QueryParts,
  type Row,
  type Selected,
  type Selection,
  type SelectionArguments,
} from "./selection";

/** The types the API serves at the top level; the rest are reached only through a parent's path. */
type RootTypeName = {
  [N in ApiTypeName]: (typeof API_SCHEMA)[N]["root"] extends true ? N : never;
}[ApiTypeName];

/** What every query offers besides being awaited; `Q` is the query's own type. */
interface QueryBase<N extends ApiTypeName, S extends Selection<N>, R, Q> extends PromiseLike<R>, Selected<N, S> {
  /** Cancels the request when `signal` aborts; the awaited query then rejects with axios's cancel error. */
  signal(signal: AbortSignal): Q;
  /** The request path and query string, relative to the API base URL. */
  url(): string;
}

/** One resource's selected fields, sent when awaited; `Empty` is `null` when the path may point at nothing. */
type ItemQuery<N extends ApiTypeName, S extends Selection<N>, Empty extends null = never> = QueryBase<
  N,
  S,
  Row<Fragment<N, S>> | Empty,
  ItemQuery<N, S, Empty>
>;

/** A list of resources' selected fields, sent when awaited. */
interface ListQuery<N extends ApiTypeName, S extends Selection<N>> extends QueryBase<
  N,
  S,
  Row<Fragment<N, S>>[],
  ListQuery<N, S>
> {
  /** Keeps the resources `build` matches; a second `where` must match as well. */
  where(build: (paths: FilterPaths<N>) => Filter<N>): ListQuery<N, S>;
}

/** A to-many relationship: one related resource by id, or all of them. */
type ToManyPath<N extends ApiTypeName> = {
  (id: string): ItemPath<N>;
  (): CollectionPath<N>;
};

/** A to-one relationship: selecting it ends the path, but its id lets the path continue, as Elide's URLs allow. */
type ToOnePath<N extends ApiTypeName, Empty extends null> = {
  (id: string): ItemPath<N, Empty>;
  (): TerminalPath<N, Empty>;
};

/** The relationships a resource's path continues through; a to-one without an id ends the path, as Elide's URLs do. */
type RelationshipPaths<N extends ApiTypeName> = {
  readonly [R in RelationshipName<N>]: IsMany<N, R> extends true
    ? ToManyPath<TargetOf<N, R>>
    : ToOnePath<TargetOf<N, R>, IsRequired<N, R> extends true ? never : null>;
};

/** A path that can only be selected; `Empty` is `null` when it may point at nothing. */
type TerminalPath<N extends ApiTypeName, Empty extends null = never> = {
  select<const S extends Selection<N>>(fragment: Fragment<N, S>): ItemQuery<N, S, Empty>;
  select<const S extends SelectionArguments<N>>(...selection: S): ItemQuery<N, S, Empty>;
};

/** The path to one resource by id; nothing is sent until it is selected and awaited. */
type ItemPath<N extends ApiTypeName, Empty extends null = never> = RelationshipPaths<N> & TerminalPath<N, Empty>;

/** The path to a list of resources; nothing is sent until it is selected and awaited. */
type CollectionPath<N extends ApiTypeName> = {
  select<const S extends Selection<N>>(fragment: Fragment<N, S>): ListQuery<N, S>;
  select<const S extends SelectionArguments<N>>(...selection: S): ListQuery<N, S>;
};

/** Every root type's item and collection paths, e.g. `api.organization(id).workspace()`. */
export type Api = { readonly [N in RootTypeName]: ToManyPath<N> };

/** What the generated schema knows of one type: its relationships as paths and its filterable paths. */
export type TypeNode<N extends ApiTypeName> = {
  readonly type: N;
  readonly relationships: (path: string) => RelationshipPaths<N>;
  readonly filters: () => FilterPaths<N>;
};

/** How a query sends its request; one per query, carried through `signal` and `where`. */
type Request<N extends ApiTypeName, S extends Selection<N>> = {
  node: TypeNode<N>;
  path: string;
  fragment: Fragment<N, S>;
  parts: QueryParts;
  filter?: string;
  signal?: AbortSignal;
};

const urlOf = <N extends ApiTypeName, S extends Selection<N>>(request: Request<N, S>) =>
  `${request.path}?${toQueryString(request.parts, request.filter)}`;

const fetchDocument = <N extends ApiTypeName, S extends Selection<N>>(request: Request<N, S>) =>
  axiosInstance.get<unknown>(urlOf(request), { signal: request.signal }).then(({ data }) => parseApiDocument(data));

/** What item and list queries share: the fragment, the URL and sending on await, `read` shaping the document. */
const sentQuery = <N extends ApiTypeName, S extends Selection<N>, R>(
  request: Request<N, S>,
  read: (document: ApiDocument) => R
): Omit<QueryBase<N, S, R, never>, "signal"> => ({
  [SELECTED]: request.fragment,
  url: () => urlOf(request),
  then: (onFulfilled, onRejected) => fetchDocument(request).then(read).then(onFulfilled, onRejected),
});

const listQuery = <N extends ApiTypeName, S extends Selection<N>>(request: Request<N, S>): ListQuery<N, S> => ({
  ...sentQuery(request, (document) => flattenList(request.node.type, request.fragment.selection, document)),
  signal: (signal) => listQuery({ ...request, signal }),
  where: (build) => {
    const added = filterWith(request.node.filters(), build);
    return listQuery({ ...request, filter: request.filter ? `${request.filter};${added}` : added });
  },
});

const itemQuery = <N extends ApiTypeName, S extends Selection<N>, Empty extends null>(
  request: Request<N, S>,
  empty: () => Empty
): ItemQuery<N, S, Empty> => ({
  ...sentQuery(request, (document) => flattenItem(request.node.type, request.fragment.selection, document) ?? empty()),
  signal: (signal) => itemQuery({ ...request, signal }, empty),
});

/** Whether `select` was handed one fragment rather than a selection's entries, which are never fragments. */
const isFragmentArgument = <N extends ApiTypeName, S extends Selection<N>>(
  args: readonly [Fragment<N, S>] | S
): args is readonly [Fragment<N, S>] => args.length === 1 && isFragment(args[0]);

// Built at select time so conflicting selections throw where the query is written, not where it is awaited.
const request = <N extends ApiTypeName, S extends Selection<N>>(
  node: TypeNode<N>,
  path: string,
  args: readonly [Fragment<N, S>] | S
): Request<N, S> => {
  const selected = isFragmentArgument(args) ? args[0] : fragment(node.type, args);
  return { node, path, fragment: selected, parts: buildQuery(node.type, selected.selection) };
};

const collectionPath = <N extends ApiTypeName>(node: TypeNode<N>, path: string): CollectionPath<N> => ({
  select: <const S extends Selection<N>>(...args: readonly [Fragment<N, S>] | S) =>
    listQuery(request(node, path, args)),
});

const terminalPath = <N extends ApiTypeName, Empty extends null>(
  node: TypeNode<N>,
  path: string,
  empty: () => Empty
): TerminalPath<N, Empty> => ({
  select: <const S extends Selection<N>>(...args: readonly [Fragment<N, S>] | S) =>
    itemQuery(request(node, path, args), empty),
});

const itemPath = <N extends ApiTypeName, Empty extends null>(
  node: TypeNode<N>,
  path: string,
  empty: () => Empty
): ItemPath<N, Empty> => ({ ...node.relationships(path), ...terminalPath(node, path, empty) });

// Elide answers a missing resource by id with 404, so an empty document here means the API broke its contract.
const missing = (path: string) => (): never => {
  throw new Error(`${path} returned no resource`);
};

const absent = (): null => null;

/** A to-many relationship's path, or a root type's when `path` is the type name. */
export const toMany = <N extends ApiTypeName>(node: TypeNode<N>, path: string): ToManyPath<N> => {
  function to(id: string): ItemPath<N>;
  function to(): CollectionPath<N>;
  function to(id?: string): ItemPath<N> | CollectionPath<N> {
    if (id === undefined) {
      return collectionPath(node, path);
    }
    const itemUrl = `${path}/${encodeURIComponent(id)}`;
    return itemPath(node, itemUrl, missing(itemUrl));
  }
  return to;
};

const toOne = <N extends ApiTypeName, Empty extends null>(
  node: TypeNode<N>,
  path: string,
  empty: () => Empty
): ToOnePath<N, Empty> => {
  function to(id: string): ItemPath<N, Empty>;
  function to(): TerminalPath<N, Empty>;
  function to(id?: string): ItemPath<N, Empty> | TerminalPath<N, Empty> {
    return id === undefined
      ? terminalPath(node, path, empty)
      : itemPath(node, `${path}/${encodeURIComponent(id)}`, empty);
  }
  return to;
};

/** A to-one relationship whose join column is NOT NULL. */
export const requiredOne = <N extends ApiTypeName>(node: TypeNode<N>, path: string): ToOnePath<N, never> =>
  toOne(node, path, missing(path));

/** A to-one relationship that may point at nothing. */
export const optionalOne = <N extends ApiTypeName>(node: TypeNode<N>, path: string): ToOnePath<N, null> =>
  toOne(node, path, absent);
