import { API_SCHEMA, type ApiAttributes, type ApiTypeName } from "../generated/apiResources";
import { isRecord } from "@/modules/utils/guards";
import type { AttributeName, IsMany, RelationshipName, TargetOf } from "./schemaTypes";

/** Selects a relationship's linkage (`{ id }`) without including the related resource. */
export const ids: unique symbol = Symbol("ids");

/** What a selection may ask of one relationship. */
type RelationshipSelection<N extends ApiTypeName, R extends RelationshipName<N>> =
  Selection<TargetOf<N, R>> | Fragment<TargetOf<N, R>> | typeof ids;

/** The relationships a selection asks for, keyed by name. */
type RelationshipSelections<N extends ApiTypeName> = {
  readonly [R in RelationshipName<N>]?: RelationshipSelection<N, R>;
};

/** The attributes and relationships of a type a read asks for, relationships nesting their own selections. */
export type Selection<N extends ApiTypeName> = readonly (AttributeName<N> | RelationshipSelections<N>)[];

/** The arguments a read's selection is written as: at least one field, since an empty fieldset asks for nothing. */
export type SelectionArguments<N extends ApiTypeName> = readonly [Selection<N>[number], ...Selection<N>[number][]];

/** Marks a fragment, so a fragment passed to `select` is told apart from a selection's entries. */
const FRAGMENT: unique symbol = Symbol("fragment");

/** A selection bound to its type; only {@link fields} makes one and only {@link toQueryString} puts it in a URL. */
export type Fragment<N extends ApiTypeName, S extends Selection<N> = Selection<N>> = {
  readonly type: N;
  readonly selection: S;
  readonly [FRAGMENT]: true;
};

/** Every attribute, and every relationship as linkage. */
type AllSelection<N extends ApiTypeName> = readonly (
  AttributeName<N> | { readonly [R in RelationshipName<N>]: typeof ids }
)[];

/** Makes fragments of one type: called with a selection, or `all` for every field. */
type FragmentBuilder<N extends ApiTypeName> = (<const S extends SelectionArguments<N>>(
  ...selection: S
) => Fragment<N, S>) & {
  readonly all: Fragment<N, AllSelection<N>>;
};

/** The relationship entries of a selection. */
type RelationshipEntry<S extends readonly unknown[]> = Exclude<S[number], string>;

/** The relationships a selection names, across all of its entries. */
type SelectedRelationshipName<N extends ApiTypeName, S extends readonly unknown[]> = Extract<
  RelationshipEntry<S> extends infer E ? (E extends unknown ? keyof E : never) : never,
  RelationshipName<N>
>;

/** What a selection asks of relationship `R`. */
type SelectionOf<S extends readonly unknown[], R extends string> =
  RelationshipEntry<S> extends infer E ? (E extends { readonly [K in R]: infer V } ? V : never) : never;

/** One related resource as a selection yields it: bare linkage for `ids`, otherwise a nested row. */
type RelatedRow<N extends ApiTypeName, V> = V extends typeof ids
  ? { id: string }
  : V extends { readonly selection: infer S extends readonly unknown[] }
    ? RowOf<N, S>
    : V extends readonly unknown[]
      ? RowOf<N, V>
      : never;

/** By cardinality; to-ones stay nullable even when required: Elide withholds targets the reader can't read. */
type Related<N extends ApiTypeName, R extends RelationshipName<N>, T> = IsMany<N, R> extends true ? T[] : T | null;

/** Flattens an intersection so editors show one object. */
type Flat<T> = { [K in keyof T]: T[K] };

/** The row a selection of type `N` yields. */
type RowOf<N extends ApiTypeName, S extends readonly unknown[]> = Flat<
  { id: string } & Pick<ApiAttributes[N], Extract<S[number], keyof ApiAttributes[N]>> & {
      [R in SelectedRelationshipName<N, S>]: Related<N, R, RelatedRow<TargetOf<N, R>, SelectionOf<S, R>>>;
    }
>;

/** Carries a query's fragment, so {@link Row} can read a query as it reads a fragment. */
export const SELECTED: unique symbol = Symbol("selected");

/** A query's fragment, which {@link Row} reads the row type from. */
export type Selected<N extends ApiTypeName, S extends Selection<N>> = { readonly [SELECTED]: Fragment<N, S> };

/** The flat object one resource of a fragment's or query's read resolves to. JSON:API's `type` never appears. */
export type Row<F> =
  F extends Fragment<infer N, infer S> ? RowOf<N, S> : F extends { readonly [SELECTED]: infer G } ? Row<G> : never;

/** The fragment builders for every type the API serves, e.g. `fields.workspace("name", { vcs: ["vcsType"] })`. */
export type Fields = { readonly [N in ApiTypeName]: FragmentBuilder<N> };

// A fragment dropped straight into a template literal would otherwise send "[object Object]".
const refuseInterpolation = () => {
  throw new Error("A fragment becomes part of a URL only through toQueryString");
};

/** A selection as the runtime walks it; the public types have already checked it against the schema. */
export type LooseSelection = readonly (string | object)[];

/** A fragment as the runtime walks it. */
type LooseFragment = { readonly type: string; readonly selection: LooseSelection };

/** Binds a selection to its type. */
export const fragment = <N extends ApiTypeName, const S extends Selection<N>>(type: N, selection: S): Fragment<N, S> =>
  Object.defineProperties(
    { type, selection, [FRAGMENT]: true as const },
    { toString: { value: refuseInterpolation }, [Symbol.toPrimitive]: { value: refuseInterpolation } }
  );

/** Whether a value is a fragment rather than one entry of a selection. */
export const isFragment = (value: unknown): boolean => isRecord(value) && FRAGMENT in value;

/** The fragment builder of one type; `all` is every attribute and every relationship as linkage, as generated. */
export const fragmentBuilder = <N extends ApiTypeName>(type: N, all: AllSelection<N>): FragmentBuilder<N> =>
  Object.assign(<const S extends SelectionArguments<N>>(...selection: S) => fragment(type, selection), {
    all: fragment(type, all),
  });

/** The include paths and per-type field lists a selection asks for. */
export type QueryParts = { include: string[]; fields: Map<string, string[]> };

/** What a selection asks of one relationship, as the runtime walks it. */
type LooseRelationshipValue = LooseSelection | LooseFragment | typeof ids;

const isLooseSelection = (value: unknown): value is LooseSelection =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string" || isRecord(entry));

const isLooseFragment = (value: unknown): value is LooseFragment =>
  isRecord(value) && typeof value.type === "string" && isLooseSelection(value.selection);

/**
 * The relationships one selection entry names, with what each asks for. The public types only let valid entries
 * through, so anything else is a bug and throws rather than being skipped.
 */
export const relationshipEntries = (entry: object): [string, LooseRelationshipValue][] =>
  Object.entries(entry).map(([name, value]: [string, unknown]): [string, LooseRelationshipValue] => {
    if (value === ids || isLooseFragment(value) || isLooseSelection(value)) {
      return [name, value];
    }
    throw new Error(`Invalid selection for relationship ${name}`);
  });

/** Unwraps a fragment a caller handed in where the schema expects a bare selection. */
export const nestedSelection = (value: LooseSelection | LooseFragment): LooseSelection =>
  isLooseFragment(value) ? value.selection : value;

/**
 * Turns a selection into include paths (depth first, in selection order) and one field list per type: its
 * attributes, then the relationships it names. Throws when two paths ask one type for different fields, since a
 * request carries one `fields[type]` per type.
 */
export const buildQuery = (type: ApiTypeName, selection: LooseSelection): QueryParts => {
  const query: QueryParts = { include: [], fields: new Map() };
  const visit = (current: ApiTypeName, currentSelection: LooseSelection, path: string) => {
    const attributes = currentSelection.filter((entry): entry is string => typeof entry === "string");
    const related = currentSelection.flatMap((entry) => (typeof entry === "string" ? [] : relationshipEntries(entry)));
    const list = [...attributes, ...related.map(([name]) => name)];
    const existing = query.fields.get(current);
    if (existing !== undefined && existing.join(",") !== list.join(",")) {
      throw new Error(`Conflicting selections for ${current}: ${existing.join(",")} vs ${list.join(",")}`);
    }
    query.fields.set(current, list);
    related.forEach(([name, value]) => {
      if (value === ids) {
        return;
      }
      const relationships: Readonly<Record<string, { type: ApiTypeName }>> = API_SCHEMA[current].relationships;
      const nestedPath = path ? `${path}.${name}` : name;
      query.include.push(nestedPath);
      visit(relationships[name].type, nestedSelection(value), nestedPath);
    });
  };
  visit(type, selection, "");
  return query;
};

/**
 * The query string for {@link buildQuery}'s result: `include`, each type's `fields` in first-seen order, then
 * `filter`, an RSQL expression on the primary type, encoded.
 */
export const toQueryString = (q: ReturnType<typeof buildQuery>, filter?: string): string => {
  const [primary] = q.fields.keys();
  return [
    ...(q.include.length > 0 ? [`include=${q.include.join(",")}`] : []),
    ...[...q.fields].map(([type, list]) => `fields[${type}]=${list.join(",")}`),
    ...(filter ? [`filter[${primary}]=${encodeURIComponent(filter)}`] : []),
  ].join("&");
};
