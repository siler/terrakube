import type { ApiAttributes, ApiTypeName } from "../generated/apiResources";
import type { RelationshipName, TargetOf } from "./schemaTypes";

const FILTER: unique symbol = Symbol("filter");

/** An RSQL expression on type `N`, made only by the filter paths and by {@link and} and {@link or}. */
export type Filter<N extends ApiTypeName> = { readonly [FILTER]: N; readonly rsql: string };

const filter = <N extends ApiTypeName>(type: N, rsql: string): Filter<N> => ({ [FILTER]: type, rsql });

/** The values an attribute compares against, `null` excluded since `isNull` covers it. */
type Value<N extends ApiTypeName, A extends keyof ApiAttributes[N]> = NonNullable<ApiAttributes[N][A]>;

/** What a filter can compare: lists and maps have no RSQL comparison. */
type Scalar = string | number | boolean;

/** The attributes of a type that hold a scalar. */
type ScalarAttribute<N extends ApiTypeName> = {
  [A in keyof ApiAttributes[N]]-?: Value<N, A> extends Scalar ? A : never;
}[keyof ApiAttributes[N]];

/** The comparisons every scalar attribute offers. */
type Comparisons<N extends ApiTypeName, V> = {
  eq(value: V): Filter<N>;
  ne(value: V): Filter<N>;
  in(values: readonly V[]): Filter<N>;
  isNull(): Filter<N>;
  notNull(): Filter<N>;
};

/** An attribute's comparisons, with the searches only on free-text attributes (not enums). */
type AttributeFilter<N extends ApiTypeName, V> = Comparisons<N, V> &
  (string extends V ? { contains(text: string): Filter<N>; containsIgnoreCase(text: string): Filter<N> } : unknown);

/** Type `T`'s scalar attributes, as filters on type `N`. */
export type AttributeFilters<N extends ApiTypeName, T extends ApiTypeName> = {
  readonly [A in ScalarAttribute<T>]: AttributeFilter<N, Value<T, A>>;
};

/** A related resource filters on its id and its own attributes, stopping there rather than following its relationships. */
type RelationshipFilter<N extends ApiTypeName, T extends ApiTypeName> = AttributeFilters<N, T> & {
  readonly id: {
    eq(id: string): Filter<N>;
    in(ids: readonly string[]): Filter<N>;
    isNull(): Filter<N>;
  };
};

/** A collection filters on its own members' ids: exactly, never searched. */
type PrimaryIdFilter<N extends ApiTypeName> = {
  eq(id: string): Filter<N>;
  in(ids: readonly string[]): Filter<N>;
  isNull(): Filter<N>;
  notNull(): Filter<N>;
};

/**
 * The filterable paths of a type, e.g. `w.name.contains("prod")`, `w.id.in(ids)`, `w.vcs.id.eq(id)` or
 * `w.workspaceTag.tagId.eq(id)`.
 */
export type FilterPaths<N extends ApiTypeName> = AttributeFilters<N, N> & { readonly id: PrimaryIdFilter<N> } & {
  readonly [R in RelationshipName<N>]: RelationshipFilter<N, TargetOf<N, R>>;
};

const quote = (value: Scalar): string => `'${String(value).replace(/[\\']/g, (char) => `\\${char}`)}'`;

const list = (values: readonly Scalar[]): string => {
  if (values.length === 0) {
    throw new Error("An RSQL =in= list needs at least one value");
  }
  return `(${values.map(quote).join(",")})`;
};

// Elide picks a wildcard match from the first value after ==, !=, =in= or =out=; range comparisons never wildcard.
const hasWildcardEdge = (value: Scalar): boolean => /^\*|\*$/.test(String(value));

const literalEq = (path: string, value: Scalar) => `(${path}=ge=${quote(value)};${path}=le=${quote(value)})`;

const literalNe = (path: string, value: Scalar) => `(${path}=lt=${quote(value)},${path}=gt=${quote(value)})`;

/** The comparisons on one attribute path, each a filter on the root type `N`. */
export const comparisons = <N extends ApiTypeName>(root: N, path: string) => ({
  eq: (value: Scalar) => filter(root, hasWildcardEdge(value) ? literalEq(path, value) : `${path}==${quote(value)}`),
  ne: (value: Scalar) => filter(root, hasWildcardEdge(value) ? literalNe(path, value) : `${path}!=${quote(value)}`),
  in: (values: readonly Scalar[]) => {
    const plain = values.findIndex((value) => !hasWildcardEdge(value));
    if (plain === -1 && values.length > 0) {
      const ranges = values.map((value) => literalEq(path, value));
      return filter(root, ranges.length > 1 ? `(${ranges.join(",")})` : ranges[0]);
    }
    const ordered = plain > 0 ? [values[plain], ...values.filter((_, i) => i !== plain)] : values;
    return filter(root, `${path}=in=${list(ordered)}`);
  },
  contains: (text: string) => filter(root, `${path}==${quote(`*${text}*`)}`),
  containsIgnoreCase: (text: string) => filter(root, `${path}=ini=${quote(`*${text}*`)}`),
  isNull: () => filter(root, `${path}=isnull=true`),
  notNull: () => filter(root, `${path}=isnull=false`),
});

/** Builds a type's paths on first use and hands out the same object afterwards. */
export const once = <T>(build: () => T): (() => T) => {
  let built: { value: T } | undefined;
  return () => {
    built ??= { value: build() };
    return built.value;
  };
};

const combine = <N extends ApiTypeName>(filters: readonly Filter<N>[], separator: ";" | ","): Filter<N> => {
  const [first] = filters;
  if (first === undefined) {
    throw new Error("Combining filters needs at least one filter");
  }
  const rsql = filters.map((each) => each.rsql).join(separator);
  // `;` binds tighter than `,`, so an or group carries its own parentheses into any `and` it lands in.
  return filter(first[FILTER], separator === "," && filters.length > 1 ? `(${rsql})` : rsql);
};

/** Matches when every filter matches. */
export const and = <N extends ApiTypeName>(...filters: Filter<N>[]): Filter<N> => combine(filters, ";");

/** Matches when any filter matches. */
export const or = <N extends ApiTypeName>(...filters: Filter<N>[]): Filter<N> => combine(filters, ",");

/** The RSQL expression `build` makes from `paths`, unencoded: every value quoted, so input cannot end a value early or add a clause. */
export const filterWith = <N extends ApiTypeName>(
  paths: FilterPaths<N>,
  build: (paths: FilterPaths<N>) => Filter<NoInfer<N>>
): string => build(paths).rsql;
