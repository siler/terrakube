import axiosInstance, { axiosRegistry } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import { rowFrom } from "../api/flattenDocument";
import type { CreateBody, UpdateBody, WriteAttributes } from "../api/writeBodies";
import {
  TerraformRegistryProviderVersions,
  TerraformRegistryProviderDownload,
  TerraformRegistryProviderDetails,
} from "./types";
import { parseProviderDetails, parseProviderDownload, parseProviderVersions } from "./registryParse";
import { VersionStatus } from "@/components/modals/VersionStatusModal";
import { parseApiDocument } from "@/domain/api/parseDocument";

const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

// The public-registry pages only check which provider names the organization already has.
const PROVIDER_NAME_FIELDS = fields.provider("name");
export type ProviderNameRow = Row<typeof PROVIDER_NAME_FIELDS>;

// The details page shows the provider's identity and every version's status details.
const PROVIDER_DETAILS_FIELDS = fields.provider("name", "description", "registryNamespace", "imported", {
  version: ["versionNumber", "protocols", "status", "deprecationMessage"],
});
export type ProviderDetailsRow = Row<typeof PROVIDER_DETAILS_FIELDS>;

// Deletion walks the versions and their implementations by linkage alone.
const PROVIDER_DELETE_FIELDS = fields.provider({ version: fields.version({ implementation: ids }) });

// What each create response echoes, read back through the same fragments the reads use.
const PROVIDER_CREATED_FIELDS = fields.provider("name", "description", "imported", "registryNamespace");
const VERSION_CREATED_FIELDS = fields.version("versionNumber", "protocols", "status", "deprecationMessage");
const IMPLEMENTATION_CREATED_FIELDS = fields.implementation(
  "os",
  "arch",
  "filename",
  "downloadUrl",
  "shasumsUrl",
  "shasumsSignatureUrl",
  "shasum",
  "keyId",
  "asciiArmor",
  "trustSignature",
  "source",
  "sourceUrl"
);
export type ProviderCreatedRow = Row<typeof PROVIDER_CREATED_FIELDS>;
export type VersionCreatedRow = Row<typeof VERSION_CREATED_FIELDS>;
export type ImplementationCreatedRow = Row<typeof IMPLEMENTATION_CREATED_FIELDS>;

// Terrakube API functions

export const listProviders = async (orgId: string): Promise<ProviderNameRow[]> =>
  api.organization(orgId).provider().select(PROVIDER_NAME_FIELDS);

export const getProvider = async (orgId: string, providerId: string): Promise<ProviderDetailsRow> =>
  api.organization(orgId).provider(providerId).select(PROVIDER_DETAILS_FIELDS);

export const createProvider = async (
  orgId: string,
  name: string,
  description: string,
  options?: { imported?: boolean; registryNamespace?: string }
): Promise<{ data: ProviderCreatedRow }> => {
  const attributes: WriteAttributes<"provider"> = {
    name,
    description,
  };
  if (options?.imported !== undefined) {
    attributes.imported = options.imported;
  }
  if (options?.registryNamespace) {
    attributes.registryNamespace = options.registryNamespace;
  }
  const body: CreateBody<"provider"> = {
    data: {
      type: "provider",
      attributes,
    },
  };

  const response = await axiosInstance.post<unknown>(`organization/${orgId}/provider`, body, {
    headers: {
      "Content-Type": JSON_API_CONTENT_TYPE,
    },
  });
  return { data: rowFrom(PROVIDER_CREATED_FIELDS, parseApiDocument(response.data)) };
};

export const updateVersionStatus = async (
  orgId: string,
  providerId: string,
  versionId: string,
  attributes: Required<VersionStatus>
): Promise<void> => {
  const body: UpdateBody<"version"> = { data: { type: "version", id: versionId, attributes } };
  await axiosInstance.patch(`organization/${orgId}/provider/${providerId}/version/${versionId}`, body, {
    headers: { "Content-Type": JSON_API_CONTENT_TYPE },
  });
};

export const createVersion = async (
  orgId: string,
  providerId: string,
  versionNumber: string,
  protocols: string
): Promise<{ data: VersionCreatedRow }> => {
  const body: CreateBody<"version"> = {
    data: {
      type: "version",
      attributes: {
        versionNumber,
        protocols,
      },
    },
  };
  const response = await axiosInstance.post<unknown>(`organization/${orgId}/provider/${providerId}/version`, body, {
    headers: {
      "Content-Type": JSON_API_CONTENT_TYPE,
    },
  });
  return { data: rowFrom(VERSION_CREATED_FIELDS, parseApiDocument(response.data)) };
};

export const createImplementation = async (
  orgId: string,
  providerId: string,
  versionId: string,
  impl: {
    os: string;
    arch: string;
    filename: string;
    downloadUrl: string;
    shasumsUrl: string;
    shasumsSignatureUrl: string;
    shasum: string;
    keyId: string;
    asciiArmor: string;
    trustSignature: string;
    source: string;
    sourceUrl: string;
  }
): Promise<{ data: ImplementationCreatedRow }> => {
  const body: CreateBody<"implementation"> = {
    data: {
      type: "implementation",
      attributes: impl,
    },
  };
  const response = await axiosInstance.post<unknown>(
    `organization/${orgId}/provider/${providerId}/version/${versionId}/implementation`,
    body,
    {
      headers: {
        "Content-Type": JSON_API_CONTENT_TYPE,
      },
    }
  );
  return { data: rowFrom(IMPLEMENTATION_CREATED_FIELDS, parseApiDocument(response.data)) };
};

/**
 * Delete a provider and all its children (implementations, then versions).
 * The backend has no cascade delete, so we must delete children first.
 */
export const deleteProviderCascade = async (orgId: string, providerId: string): Promise<void> => {
  // 1. Get the provider's versions and their implementations
  const provider = await api.organization(orgId).provider(providerId).select(PROVIDER_DELETE_FIELDS);
  const versions = provider?.version ?? [];

  // 2. Delete all implementations first
  for (const version of versions) {
    for (const implementation of version.implementation ?? []) {
      await axiosInstance.delete(
        `organization/${orgId}/provider/${providerId}/version/${version.id}/implementation/${implementation.id}`
      );
    }
  }

  // 3. Delete all versions
  for (const version of versions) {
    await axiosInstance.delete(`organization/${orgId}/provider/${providerId}/version/${version.id}`);
  }

  // 4. Delete the provider itself
  await axiosInstance.delete(`organization/${orgId}/provider/${providerId}`);
};

// Keep simple delete for backward compatibility
export const deleteProvider = deleteProviderCascade;

// Terraform Registry API functions (via backend proxy to avoid CORS).

export const getProviderVersions = async (
  namespace: string,
  name: string
): Promise<TerraformRegistryProviderVersions> => {
  const response = await axiosRegistry.get<unknown>(
    `/registry/v1/providers/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions`
  );
  return parseProviderVersions(response.data);
};

export const getPublicProvider = async (
  namespace: string,
  name: string,
  version?: string
): Promise<TerraformRegistryProviderDetails> => {
  const path =
    `/registry/v1/providers/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}` +
    (version ? `/${encodeURIComponent(version)}` : "");
  const response = await axiosRegistry.get<unknown>(path);
  return parseProviderDetails(response.data);
};

export const getProviderDownload = async (
  namespace: string,
  name: string,
  version: string,
  os: string,
  arch: string
): Promise<TerraformRegistryProviderDownload> => {
  const response = await axiosRegistry.get<unknown>(
    `/registry/v1/providers/${namespace}/${name}/${version}/download/${os}/${arch}`
  );
  return parseProviderDownload(response.data);
};

// Import provider from Terraform Registry to Terrakube
export const importProvider = async (
  orgId: string,
  namespace: string,
  name: string,
  version: string,
  description?: string,
  prefetchedVersions?: TerraformRegistryProviderVersions
): Promise<{ provider: ProviderCreatedRow; version: VersionCreatedRow }> => {
  // 1. Get versions from registry (or use pre-fetched data to avoid duplicate call)
  const versionsData = prefetchedVersions || (await getProviderVersions(namespace, name));
  const versionInfo = versionsData.versions.find((v) => v.version === version);

  if (!versionInfo) {
    throw new Error(`Version ${version} not found for provider ${namespace}/${name}`);
  }

  // 2. Create provider in Terrakube (use only the short name, not namespace/name)
  const desc = description || `${namespace}/${name}`;
  const providerResult = await createProvider(orgId, name, desc.substring(0, 256), {
    imported: true,
    registryNamespace: namespace,
  });
  const providerId = providerResult.data.id;

  // 3. Create version in Terrakube
  const protocols = versionInfo.protocols?.join(",") || "5.0";
  const versionResult = await createVersion(orgId, providerId, version, protocols);
  const versionId = versionResult.data.id;

  // 4. Get download info for each platform and create implementations (in parallel)
  const platforms = [
    { os: "linux", arch: "amd64" },
    { os: "linux", arch: "arm64" },
    { os: "darwin", arch: "amd64" },
    { os: "darwin", arch: "arm64" },
    { os: "windows", arch: "amd64" },
  ];

  // Filter to only available platforms
  const availablePlatforms = platforms.filter((platform) =>
    versionInfo.platforms?.some((p) => p.os === platform.os && p.arch === platform.arch)
  );

  // Fetch all download info in parallel
  const downloadResults = await Promise.allSettled(
    availablePlatforms.map((platform) => getProviderDownload(namespace, name, version, platform.os, platform.arch))
  );

  // Create all implementations in parallel
  const implementationPromises = downloadResults
    .filter(
      (result): result is PromiseFulfilledResult<TerraformRegistryProviderDownload> => result.status === "fulfilled"
    )
    .map((result) => {
      const downloadInfo = result.value;
      const gpgKey = downloadInfo.signing_keys?.gpg_public_keys?.[0];

      // Truncate/default values to fit database column constraints
      const trustSig = gpgKey?.trust_signature || "";
      const keyId = gpgKey?.key_id || "";
      const source = gpgKey?.source || "";
      const sourceUrl = gpgKey?.source_url || "";

      return createImplementation(orgId, providerId, versionId, {
        os: downloadInfo.os?.substring(0, 32) || "",
        arch: downloadInfo.arch?.substring(0, 32) || "",
        filename: downloadInfo.filename?.substring(0, 512) || "",
        downloadUrl: downloadInfo.download_url?.substring(0, 1024) || "",
        shasumsUrl: downloadInfo.shasums_url?.substring(0, 1024) || "",
        shasumsSignatureUrl: downloadInfo.shasums_signature_url?.substring(0, 1024) || "",
        shasum: downloadInfo.shasum?.substring(0, 1024) || "",
        keyId: keyId.substring(0, 32),
        asciiArmor: gpgKey?.ascii_armor || "",
        trustSignature: trustSig.substring(0, 32),
        source: source.substring(0, 64) || "unknown",
        sourceUrl: sourceUrl.substring(0, 512) || "https://unknown",
      }).catch((error) => {
        console.warn(`Failed to create implementation for ${downloadInfo.os}/${downloadInfo.arch}:`, error);
      });
    });

  await Promise.allSettled(implementationPromises);

  return {
    provider: providerResult.data,
    version: versionResult.data,
  };
};
