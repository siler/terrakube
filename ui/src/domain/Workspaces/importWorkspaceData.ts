import type { RawAxiosRequestHeaders } from "axios";
import axiosInstance from "../../config/axiosConfig";
import { isRecord, stringOrUndefined } from "@/modules/utils/typeGuards";

/** A Terraform Cloud/Enterprise workspace as the importer lists it. */
export type WorkspaceRecord = {
  id: string;
  attributes: {
    name: string;
    description?: string;
    "terraform-version": string;
    "execution-mode"?: string;
    "working-directory"?: string;
    "vcs-repo"?: {
      branch?: string;
      identifier?: string;
      "service-provider"?: string;
      "repository-http-url"?: string;
    };
  };
};

/** A variable set attached to a source workspace. */
export type WorkspaceVarset = {
  id: string;
  name: string;
};

/** A source workspace's sensitive variable, whose value the importer cannot read. */
export type SensitiveVariablePreview = {
  id: string;
  key: string;
  description?: string;
  category?: string;
  hcl: boolean;
};

// The importer is Java, so absent optional fields arrive as JSON null.
const parseVcsRepo = (value: unknown): WorkspaceRecord["attributes"]["vcs-repo"] => {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    branch: stringOrUndefined(value.branch),
    identifier: stringOrUndefined(value.identifier),
    "service-provider": stringOrUndefined(value["service-provider"]),
    "repository-http-url": stringOrUndefined(value["repository-http-url"]),
  };
};

const parseWorkspaceRecord = (value: unknown): WorkspaceRecord[] => {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.attributes)) {
    return [];
  }
  const { attributes } = value;
  if (typeof attributes.name !== "string") {
    return [];
  }
  return [
    {
      id: value.id,
      attributes: {
        name: attributes.name,
        description: stringOrUndefined(attributes.description),
        "terraform-version": stringOrUndefined(attributes["terraform-version"]) ?? "",
        "execution-mode": stringOrUndefined(attributes["execution-mode"]),
        "working-directory": stringOrUndefined(attributes["working-directory"]),
        "vcs-repo": parseVcsRepo(attributes["vcs-repo"]),
      },
    },
  ];
};

const toArray = (data: unknown, what: string): unknown[] => {
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected ${what} response from the importer.`);
  }
  return data;
};

/** Reads the importer's workspace list, dropping entries without an id or name; throws if it is not a list. */
export const parseWorkspaceRecords = (data: unknown): WorkspaceRecord[] =>
  toArray(data, "workspace list").flatMap(parseWorkspaceRecord);

/** Reads a workspace's variable sets, dropping malformed entries; throws if the response is not a list. */
export const parseWorkspaceVarsets = (data: unknown): WorkspaceVarset[] =>
  toArray(data, "variable set").flatMap((varset) =>
    isRecord(varset) && typeof varset.id === "string" && typeof varset.name === "string"
      ? [{ id: varset.id, name: varset.name }]
      : []
  );

/**
 * Reads a workspace's sensitive variables; throws if the response is not a list, since silently showing none
 * would let the import drop them.
 */
export const parseSensitiveVariables = (data: unknown): SensitiveVariablePreview[] =>
  toArray(data, "sensitive variable").flatMap((variable) =>
    isRecord(variable) && typeof variable.id === "string" && typeof variable.key === "string"
      ? [
          {
            id: variable.id,
            key: variable.key,
            description: stringOrUndefined(variable.description),
            category: stringOrUndefined(variable.category),
            hcl: variable.hcl === true,
          },
        ]
      : []
  );

/** Reads the importer's per-workspace result, an HTML fragment describing what was imported. */
export const parseImportResult = (data: unknown): string => (typeof data === "string" ? data : "");

/** Lists the source organization's workspaces through the Terrakube importer. */
export const fetchImporterWorkspaces = async (
  importerBaseUrl: string,
  organization: string,
  headers: RawAxiosRequestHeaders
): Promise<WorkspaceRecord[]> => {
  const response = await axiosInstance.get<unknown>(`${importerBaseUrl}/workspaces`, {
    params: { organization },
    headers,
  });
  return parseWorkspaceRecords(response.data);
};
