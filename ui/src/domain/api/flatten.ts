import { API_SCHEMA, type ApiTypeName } from "../generated/apiResources";
import {
  ids,
  nestedSelection,
  relationshipEntries,
  type Fragment,
  type LooseSelection,
  type Row,
  type Selection,
} from "./selection";

/** One JSON:API resource as the reader needs it: the read already knows a primary resource's type. */
type Resource = {
  type?: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: Linkage }>;
};

/** An included resource, found by its type and id. */
type IncludedResource = Resource & { type: string };

/** The resource identifiers a relationship's linkage carries. */
type Linkage = { id: string } | { id: string }[] | null;

/** A JSON:API document: one resource, a list of them, or nothing, plus the resources its linkage points at. */
export type ApiDocument = { data: Resource | Resource[] | null; included?: IncludedResource[] };

const flattenResource = (
  resource: Resource,
  type: ApiTypeName,
  selection: LooseSelection,
  included: Map<string, Resource>
): Record<string, unknown> => {
  const row: Record<string, unknown> = { id: resource.id };
  const relationships: Readonly<Record<string, { type: ApiTypeName; many: boolean }>> = API_SCHEMA[type].relationships;
  selection.forEach((entry) => {
    if (typeof entry === "string") {
      // Only read-restricted attributes can be missing: Elide serialises readable ones even when null.
      const value = resource.attributes?.[entry];
      if (value !== undefined) {
        row[entry] = value;
      }
      return;
    }
    relationshipEntries(entry).forEach(([name, value]) => {
      const many = relationships[name].many;
      const data = resource.relationships?.[name]?.data;
      if (value === ids) {
        if (Array.isArray(data)) {
          row[name] = data.map((link) => ({ id: link.id }));
        } else if (data) {
          row[name] = { id: data.id };
        } else {
          row[name] = many ? [] : null;
        }
        return;
      }
      const nested = nestedSelection(value);
      const target = relationships[name].type;
      if (Array.isArray(data)) {
        row[name] = data.flatMap((link) => {
          const related = included.get(`${target}:${link.id}`);
          return related ? [flattenResource(related, target, nested, included)] : [];
        });
      } else if (data) {
        const related = included.get(`${target}:${data.id}`);
        row[name] = related ? flattenResource(related, target, nested, included) : null;
      } else {
        // Elide omits what the caller cannot read, so missing linkage is normal, not an error.
        row[name] = many ? [] : null;
      }
    });
  });
  return row;
};

const indexIncluded = (document: ApiDocument): Map<string, Resource> =>
  new Map((document.included ?? []).map((resource) => [`${resource.type}:${resource.id}`, resource]));

// The row type is computed from the schema at compile time; flattenResource builds the same shape at runtime.
const toRow = <N extends ApiTypeName, const S extends Selection<N>>(
  resource: Resource,
  type: N,
  selection: S,
  included: Map<string, Resource>
): Row<Fragment<N, S>> =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  flattenResource(resource, type, selection, included) as Row<Fragment<N, S>>;

/**
 * Flattens a list document into rows shaped by the selection: attributes lifted, JSON:API `type` dropped,
 * relationships joined from `included` along the selection. Anything but a list is a broken response for a list read.
 */
export const flattenList = <N extends ApiTypeName, const S extends Selection<N>>(
  type: N,
  selection: S,
  document: ApiDocument
): Row<Fragment<N, S>>[] => {
  const { data } = document;
  if (!Array.isArray(data)) {
    throw new Error(`Expected a list of ${type}, got ${data === null ? "null" : "one resource"}`);
  }
  const included = indexIncluded(document);
  return data.map((resource) => toRow(resource, type, selection, included));
};

/** Flattens a single-resource document as {@link flattenList} does a list; `data: null` yields null. */
export const flattenItem = <N extends ApiTypeName, const S extends Selection<N>>(
  type: N,
  selection: S,
  document: ApiDocument
): Row<Fragment<N, S>> | null => {
  const { data } = document;
  if (Array.isArray(data)) {
    throw new Error(`Expected one ${type}, got a list`);
  }
  return data === null ? null : toRow(data, type, selection, indexIncluded(document));
};

/** Flattens a write's response body by a fragment, so it yields the same row shape the matching read does. */
export const rowFrom = <N extends ApiTypeName, const S extends Selection<N>>(
  fragment: Fragment<N, S>,
  document: ApiDocument
): Row<Fragment<N, S>> => {
  const row = flattenItem(fragment.type, fragment.selection, document);
  if (row === null) {
    throw new Error(`Expected one ${fragment.type}, got null`);
  }
  return row;
};
