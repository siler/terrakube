// Terraform Registry API response types
export type TerraformRegistryProvider = {
  id: string;
  namespace: string;
  name: string;
  alias: string;
  version: string;
  description: string;
  source: string;
  published_at: string;
  downloads: number;
  tier: string;
  logo_url: string;
};

export type TerraformRegistryModule = {
  id: string;
  namespace: string;
  name: string;
  provider: string;
  version: string;
  description: string;
  source: string;
  published_at: string;
  downloads: number;
  verified: boolean;
};

// GET /v1/providers/{namespace}/{name}[/{version}] (proxied by the API).
export type TerraformRegistryProviderDetails = {
  id: string;
  namespace: string;
  name: string;
  version: string;
  description: string;
  source: string;
  published_at: string;
  downloads: number;
  tier: string;
  logo_url: string;
  versions: string[];
};

export type TerraformRegistryProviderVersions = {
  versions: {
    version: string;
    protocols: string[];
    platforms: {
      os: string;
      arch: string;
    }[];
  }[];
};

export type TerraformRegistryProviderDownload = {
  protocols: string[];
  os: string;
  arch: string;
  filename: string;
  download_url: string;
  shasums_url: string;
  shasums_signature_url: string;
  shasum: string;
  signing_keys: {
    gpg_public_keys: {
      key_id: string;
      ascii_armor: string;
      trust_signature: string;
      source: string;
      source_url: string;
    }[];
  };
};
