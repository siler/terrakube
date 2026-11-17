import type { ApiAttributes, ApiTypeName } from "../generated/apiResources";
import type { IsMany, RelationshipName, TargetOf } from "./schemaTypes";

/** A reference to one resource. */
type Identifier<N extends ApiTypeName> = { type: N; id: string };

/** A relationship's `data`: an identifier or null when to-one, a list when to-many. */
type RelationshipData<N extends ApiTypeName, R extends RelationshipName<N>> =
  IsMany<N, R> extends true ? Identifier<TargetOf<N, R>>[] : Identifier<TargetOf<N, R>> | null;

/** The attributes a write may set; the API leaves the rest unchanged or defaulted. */
export type WriteAttributes<N extends ApiTypeName> = Partial<ApiAttributes[N]>;

/** Form state holds what the user typed, never the API's nulls, so the write attributes' optionality and nullability are stripped. */
export type FormValues<N extends ApiTypeName> = {
  [K in keyof WriteAttributes<N>]-?: Exclude<WriteAttributes<N>[K], null>;
};

/** The `relationships` member of a write body: any of the type's relationships, each with its target's linkage. */
export type Linkage<N extends ApiTypeName> = { [R in RelationshipName<N>]?: { data: RelationshipData<N, R> } };

/** A new resource's `data`; JSON:API lets a create omit `attributes`. */
type CreateData<N extends ApiTypeName> = { type: N; attributes?: WriteAttributes<N>; relationships?: Linkage<N> };

/** The body of a POST whose resource the server names; `id?: never` keeps a maybe-undefined id from posing as a create. */
export type CreateBody<N extends ApiTypeName> = { data: CreateData<N> & { id?: never } };

/** The body of a POST naming its resource with a client-generated id, which JSON:API allows. */
export type ClientIdCreateBody<N extends ApiTypeName> = { data: CreateData<N> & { id: string } };

/** The body of a PATCH to a resource. */
export type UpdateBody<N extends ApiTypeName> = {
  data: { type: N; id: string; attributes?: WriteAttributes<N>; relationships?: Linkage<N> };
};

/** The body of a write to `/{type}/{id}/relationships/{relationship}`. */
export type RelationshipBody<N extends ApiTypeName, R extends RelationshipName<N>> = { data: RelationshipData<N, R> };

/** An atomic `add`'s data: a client `id` or a request-local `lid` names the new resource for later operations. */
type AddData<N extends ApiTypeName> = CreateData<N> & { id?: string; lid?: string };

/** One entry of an atomic operations request, for each type `N` it may carry. */
export type AtomicOperation<N extends ApiTypeName> =
  | {
      [T in N]:
        { op: "add"; href: string; data: AddData<T> } | { op: "update"; href: string; data: UpdateBody<T>["data"] };
    }[N]
  | { op: "remove"; href: string };

/** The body of a `POST /operations` (JSON:API atomic extension), carrying writes to the types in `N`. */
export type AtomicOperationsBody<N extends ApiTypeName> = { "atomic:operations": AtomicOperation<N>[] };
