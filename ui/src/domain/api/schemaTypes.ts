import type { API_SCHEMA, ApiTypeName } from "../generated/apiResources";

type Schema = typeof API_SCHEMA;

/** The relationship declarations of one type. */
type Relationships<N extends ApiTypeName> = Schema[N]["relationships"];

/** The declaration of one relationship: its target type, cardinality and requiredness. */
type Relationship<N extends ApiTypeName, R extends RelationshipName<N>> = Relationships<N>[R & keyof Relationships<N>];

/** The attribute names the API serves for a type. */
export type AttributeName<N extends ApiTypeName> = Schema[N]["attributes"][number];

/** The relationship names the API serves for a type. */
export type RelationshipName<N extends ApiTypeName> = keyof Relationships<N> & string;

/** The type a relationship points at. */
export type TargetOf<N extends ApiTypeName, R extends RelationshipName<N>> =
  Relationship<N, R> extends {
    type: infer T extends ApiTypeName;
  }
    ? T
    : never;

/** Whether a relationship is to-many. */
export type IsMany<N extends ApiTypeName, R extends RelationshipName<N>> =
  Relationship<N, R> extends { many: true } ? true : false;

/** Whether a to-one relationship always has a value, its join column being NOT NULL. */
export type IsRequired<N extends ApiTypeName, R extends RelationshipName<N>> =
  Relationship<N, R> extends {
    required: true;
  }
    ? true
    : false;
