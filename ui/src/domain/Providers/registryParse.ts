import { isStringArray, stringOrUndefined } from "@/modules/utils/typeGuards";
import { field, isString, list, record } from "@/modules/api/parseBody";
import type {
  TerraformRegistryModule,
  TerraformRegistryProvider,
  TerraformRegistryProviderDetails,
  TerraformRegistryProviderDownload,
  TerraformRegistryProviderVersions,
} from "./types";

// Display fields can be null or missing on the public registry; only identifiers and import inputs are required.
const text = (value: unknown): string => stringOrUndefined(value) ?? "";

const count = (value: unknown): number => (typeof value === "number" ? value : 0);

const required = (body: Record<string, unknown>, key: string, what: string): string =>
  field(body[key], isString, `${what} ${key}`);

/** The registry's provider summary fields, as search and details both carry them. */
const providerSummary = (body: Record<string, unknown>, what: string): TerraformRegistryProvider => ({
  id: required(body, "id", what),
  namespace: required(body, "namespace", what),
  name: required(body, "name", what),
  alias: text(body.alias),
  version: text(body.version),
  description: text(body.description),
  source: text(body.source),
  published_at: text(body.published_at),
  downloads: count(body.downloads),
  tier: text(body.tier),
  logo_url: text(body.logo_url),
});

/** `GET /registry/v1/providers`: the API's v1-shaped rewrite of the registry's v2 provider search. */
export const parseProviderSearch = (body: unknown): TerraformRegistryProvider[] =>
  list(
    record(body, "the provider search").providers,
    (item) => providerSummary(record(item, "a provider"), "provider"),
    "provider"
  );

const parseModule = (item: unknown): TerraformRegistryModule => {
  const body = record(item, "a module");
  return {
    id: required(body, "id", "module"),
    namespace: required(body, "namespace", "module"),
    name: required(body, "name", "module"),
    provider: required(body, "provider", "module"),
    version: text(body.version),
    description: text(body.description),
    source: text(body.source),
    published_at: text(body.published_at),
    downloads: count(body.downloads),
    verified: body.verified === true,
  };
};

/** `GET /registry/v1/modules`: the registry's v1 module search, passed through. */
export const parseModuleSearch = (body: unknown): TerraformRegistryModule[] =>
  list(record(body, "the module search").modules, parseModule, "module");

const parsePlatform = (item: unknown) => {
  const body = record(item, "a provider platform");
  return { os: required(body, "os", "platform"), arch: required(body, "arch", "platform") };
};

const parseVersion = (item: unknown) => {
  const body = record(item, "a provider version");
  return {
    version: required(body, "version", "provider version"),
    protocols: isStringArray(body.protocols) ? body.protocols : [],
    platforms: list(body.platforms, parsePlatform, "provider platform"),
  };
};

/** `GET /registry/v1/providers/{namespace}/{name}/versions`. */
export const parseProviderVersions = (body: unknown): TerraformRegistryProviderVersions => ({
  versions: list(record(body, "the provider versions").versions, parseVersion, "provider version"),
});

/** `GET /registry/v1/providers/{namespace}/{name}[/{version}]`. */
export const parseProviderDetails = (body: unknown): TerraformRegistryProviderDetails => {
  const details = record(body, "the provider details");
  return {
    ...providerSummary(details, "provider"),
    version: required(details, "version", "provider"),
    versions: isStringArray(details.versions) ? details.versions : [],
  };
};

const parseGpgKey = (item: unknown) => {
  const body = record(item, "a signing key");
  return {
    key_id: text(body.key_id),
    ascii_armor: text(body.ascii_armor),
    trust_signature: text(body.trust_signature),
    source: text(body.source),
    source_url: text(body.source_url),
  };
};

/** `GET /registry/v1/providers/{namespace}/{name}/{version}/download/{os}/{arch}`: what an import stores. */
export const parseProviderDownload = (body: unknown): TerraformRegistryProviderDownload => {
  const download = record(body, "the provider download");
  const signingKeys = record(download.signing_keys, "the provider signing keys");
  return {
    protocols: isStringArray(download.protocols) ? download.protocols : [],
    os: required(download, "os", "provider download"),
    arch: required(download, "arch", "provider download"),
    filename: required(download, "filename", "provider download"),
    download_url: required(download, "download_url", "provider download"),
    shasums_url: required(download, "shasums_url", "provider download"),
    shasums_signature_url: required(download, "shasums_signature_url", "provider download"),
    shasum: required(download, "shasum", "provider download"),
    signing_keys: { gpg_public_keys: list(signingKeys.gpg_public_keys, parseGpgKey, "signing key") },
  };
};
