import type { ApiDocument } from "./flatten";
import { isRecord } from "@/modules/utils/guards";

type Resource = Exclude<ApiDocument["data"], null | unknown[]>;

type IncludedResource = NonNullable<ApiDocument["included"]>[number];

const isIdentifier = (value: unknown): value is { id: string } => isRecord(value) && typeof value.id === "string";

const isRelationship = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const { data } = value;
  if (data === undefined || data === null) {
    return true;
  }
  return Array.isArray(data) ? data.every(isIdentifier) : isIdentifier(data);
};

const isResource = (value: unknown): value is Resource =>
  isRecord(value) &&
  (value.type === undefined || typeof value.type === "string") &&
  typeof value.id === "string" &&
  (value.attributes === undefined || isRecord(value.attributes)) &&
  (value.relationships === undefined ||
    (isRecord(value.relationships) && Object.values(value.relationships).every(isRelationship)));

// Included resources are looked up by type and id, so only they must name their type.
const isIncludedResource = (value: unknown): value is IncludedResource =>
  isResource(value) && typeof value.type === "string";

/** Narrows a response body to a JSON:API document whose resources carry the shape the flattener reads. */
const isApiDocument = (value: unknown): value is ApiDocument => {
  if (!isRecord(value)) {
    return false;
  }
  const { data, included } = value;
  const dataValid = data === null || (Array.isArray(data) ? data.every(isResource) : isResource(data));
  return dataValid && (included === undefined || (Array.isArray(included) && included.every(isIncludedResource)));
};

/** Returns the body as a JSON:API document, or throws when the server sent something else. */
export const parseApiDocument = (value: unknown): ApiDocument => {
  if (!isApiDocument(value)) {
    throw new Error("Expected a JSON:API document in the response");
  }
  return value;
};

/** Returns the id of the resource in a JSON:API create response, or undefined when the body names none. */
export const createdResourceId = (body: unknown): string | undefined => {
  if (!isRecord(body) || !isRecord(body.data) || typeof body.data.id !== "string" || body.data.id === "") {
    return undefined;
  }
  return body.data.id;
};
