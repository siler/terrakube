import { API_SCHEMA, type ApiTypeName } from "@/domain/generated/apiResources";
import { isRecord, isUnknownArray } from "@/modules/utils/typeGuards";

type Identifier = { type: string; id: unknown };

type Linkage = { data: Identifier | Identifier[] | null };

type FixtureResource = Record<string, unknown> & { type?: string; relationships?: Record<string, unknown> };

const isFixtureResource = (value: unknown): value is FixtureResource =>
  isRecord(value) &&
  (value.type === undefined || typeof value.type === "string") &&
  (value.relationships === undefined || isRecord(value.relationships));

const isApiType = (type: unknown): type is ApiTypeName => typeof type === "string" && type in API_SCHEMA;

/** The type an Elide path such as `organization/o/workspace/w/job` returns, or undefined for any other URL. */
const typeOfPath = (url: string): ApiTypeName | undefined => {
  const names = url
    .split("?")[0]
    .replace(/^\//, "")
    .split("/")
    .filter((_, index) => index % 2 === 0);
  let type: ApiTypeName | undefined = isApiType(names[0]) ? names[0] : undefined;
  names.slice(1).forEach((name) => {
    const relationships: Readonly<Record<string, { type: ApiTypeName }>> | undefined =
      type && API_SCHEMA[type].relationships;
    type = relationships?.[name]?.type;
  });
  return type;
};

/** The field names a URL's `fields[type]` parameter asks for, or undefined when it names none for the type. */
const requestedFields = (url: string, type: string): string[] | undefined =>
  new URLSearchParams(url.split("?")[1] ?? "").get(`fields[${type}]`)?.split(",");

/** A copy of `resource` with the linkage Elide would send for it, built from the fixture's `included`. */
const link = (
  url: string,
  resource: FixtureResource,
  type: ApiTypeName,
  included: FixtureResource[]
): FixtureResource => {
  const relationships: Readonly<Record<string, { type: ApiTypeName; many: boolean }>> = API_SCHEMA[type].relationships;
  const requested = requestedFields(url, type);
  const linkage = Object.entries(relationships).flatMap(([name, { type: target, many }]): [string, Linkage][] => {
    if (resource.relationships?.[name] !== undefined || (requested !== undefined && !requested.includes(name))) {
      return [];
    }
    const identifiers = included
      .filter((candidate) => candidate.type === target && candidate !== resource)
      .map(({ id }) => ({ type: target, id }));
    // With several candidates the fixture's intent is ambiguous, so the test has to state the linkage itself.
    if (identifiers.length > 1 || (identifiers.length === 0 && requested === undefined)) {
      return [];
    }
    return [[name, { data: many ? identifiers : (identifiers[0] ?? null) }]];
  });
  return linkage.length === 0
    ? resource
    : { ...resource, relationships: { ...resource.relationships, ...Object.fromEntries(linkage) } };
};

const linkResource = (url: string, resource: FixtureResource, included: FixtureResource[], type = resource.type) =>
  isApiType(type) ? link(url, resource, type, included) : resource;

/**
 * A copy of a test's JSON:API response with the linkage Elide sends for each relationship `fields[type]` names
 * (every relationship when the URL names no fields for the type): pointing at the fixture's one `included`
 * resource of the target type, or empty when there is none. Fixtures can then list a related resource without
 * repeating its id on the resource that points at it. Linkage a fixture states (including `data: null`) is kept;
 * list documents and non-API URLs pass through untouched.
 */
export const linkIncluded = <R extends { data?: unknown }>(url: string, response: R): R => {
  const document = response?.data;
  if (!isRecord(document) || !isFixtureResource(document.data)) {
    return response;
  }
  const entries = isUnknownArray(document.included) ? document.included : undefined;
  const included = entries?.filter(isFixtureResource) ?? [];
  const resource = document.data;
  const primaryType = isApiType(resource.type) ? resource.type : typeOfPath(url);
  return {
    ...response,
    data: {
      ...document,
      data: linkResource(url, resource, included, primaryType),
      ...(entries && {
        included: entries.map((entry) => (isFixtureResource(entry) ? linkResource(url, entry, included) : entry)),
      }),
    },
  };
};
