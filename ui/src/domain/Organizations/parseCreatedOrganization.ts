import { isOneOf, isRecord, stringOrUndefined } from "@/modules/utils/typeGuards";
import type { FlatOrganization } from "../types";
import { ExecutionMode } from "../generated/apiResources";

/** Reads the created organization from the JSON:API document the create request returns. */
export const parseCreatedOrganization = (body: unknown): FlatOrganization | undefined => {
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.attributes)) {
    return undefined;
  }
  const { id } = body.data;
  const { name, description, executionMode, icon } = body.data.attributes;
  if (typeof id !== "string" || typeof name !== "string") {
    return undefined;
  }
  return {
    id,
    name,
    description: stringOrUndefined(description),
    executionMode: isOneOf(Object.values(ExecutionMode), executionMode) ? executionMode : undefined,
    icon: stringOrUndefined(icon),
  };
};
