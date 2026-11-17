import { isRecord } from "@/modules/utils/typeGuards";

export type ModuleDetails = {
  submodules: string[];
  variables: { name: string; type: string | null; description: string | null; defaultValue: string | null }[];
  outputs: { name: string; description: string | null }[];
  resources: { type: string; name: string }[];
  readme: string | null;
};

// A serializer that drops nulls omits the key, so missing and null both mean "none".
const nullableString = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
};

const parseList = <T>(value: unknown, parseItem: (item: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: unknown[] = value;
  const parsed: T[] = [];
  for (const item of items) {
    const result = parseItem(item);
    if (result === undefined) {
      return undefined;
    }
    parsed.push(result);
  }
  return parsed;
};

const parseSubmodule = (item: unknown) => (typeof item === "string" ? item : undefined);

const parseVariable = (item: unknown): ModuleDetails["variables"][number] | undefined => {
  if (!isRecord(item) || typeof item.name !== "string") {
    return undefined;
  }
  const type = nullableString(item.type);
  const description = nullableString(item.description);
  const defaultValue = nullableString(item.defaultValue);
  if (type === undefined || description === undefined || defaultValue === undefined) {
    return undefined;
  }
  return { name: item.name, type, description, defaultValue };
};

const parseOutput = (item: unknown): ModuleDetails["outputs"][number] | undefined => {
  if (!isRecord(item) || typeof item.name !== "string") {
    return undefined;
  }
  const description = nullableString(item.description);
  return description === undefined ? undefined : { name: item.name, description };
};

const parseResource = (item: unknown): ModuleDetails["resources"][number] | undefined =>
  isRecord(item) && typeof item.type === "string" && typeof item.name === "string"
    ? { type: item.type, name: item.name }
    : undefined;

/** Validates the registry's module details response, returning undefined when it is not the expected shape. */
export const parseModuleDetails = (body: unknown): ModuleDetails | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const submodules = parseList(body.submodules, parseSubmodule);
  const variables = parseList(body.variables, parseVariable);
  const outputs = parseList(body.outputs, parseOutput);
  const resources = parseList(body.resources, parseResource);
  const readme = nullableString(body.readme);
  if (!submodules || !variables || !outputs || !resources || readme === undefined) {
    return undefined;
  }
  return { submodules, variables, outputs, resources, readme };
};
