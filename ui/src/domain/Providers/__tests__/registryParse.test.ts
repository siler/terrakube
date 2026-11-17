import { ResponseShapeError } from "@/modules/api/responseShapeError";
import {
  parseModuleSearch,
  parseProviderDetails,
  parseProviderDownload,
  parseProviderSearch,
  parseProviderVersions,
} from "../registryParse";

describe("Terraform registry response parsers", () => {
  it("reads the API's v1-shaped provider search, turning a null alias into an empty one", () => {
    expect(
      parseProviderSearch({
        providers: [
          {
            id: "hashicorp/aws",
            namespace: "hashicorp",
            name: "aws",
            alias: null,
            version: "",
            tag: "",
            description: "AWS",
            source: "https://github.com/hashicorp/terraform-provider-aws",
            published_at: "",
            downloads: 5,
            tier: "official",
            logo_url: "https://registry.terraform.io/images/aws.png",
          },
        ],
        meta: { limit: 20, current_offset: 0, next_offset: null, next_url: null },
      })
    ).toEqual([expect.objectContaining({ id: "hashicorp/aws", alias: "", tier: "official", downloads: 5 })]);
  });

  it("reads a module search, defaulting the display fields the registry leaves out", () => {
    expect(
      parseModuleSearch({
        meta: { limit: 20, current_offset: 0 },
        modules: [
          {
            id: "terraform-aws-modules/vpc/aws/5.0.0",
            namespace: "terraform-aws-modules",
            name: "vpc",
            provider: "aws",
          },
        ],
      })
    ).toEqual([
      {
        id: "terraform-aws-modules/vpc/aws/5.0.0",
        namespace: "terraform-aws-modules",
        name: "vpc",
        provider: "aws",
        version: "",
        description: "",
        source: "",
        published_at: "",
        downloads: 0,
        verified: false,
      },
    ]);
  });

  it("reads provider versions and details", () => {
    expect(
      parseProviderVersions({
        id: "hashicorp/aws",
        versions: [{ version: "5.0.0", protocols: ["5.0"], platforms: [{ os: "linux", arch: "amd64" }] }],
        warnings: null,
      })
    ).toEqual({ versions: [{ version: "5.0.0", protocols: ["5.0"], platforms: [{ os: "linux", arch: "amd64" }] }] });
    expect(
      parseProviderDetails({
        id: "hashicorp/aws/5.0.0",
        namespace: "hashicorp",
        name: "aws",
        alias: null,
        version: "5.0.0",
        description: null,
        versions: ["4.0.0", "5.0.0"],
      })
    ).toEqual(expect.objectContaining({ version: "5.0.0", description: "", versions: ["4.0.0", "5.0.0"] }));
  });

  it("reads what an import stores from a download, with null key fields as empty", () => {
    expect(
      parseProviderDownload({
        protocols: ["5.0"],
        os: "linux",
        arch: "amd64",
        filename: "terraform-provider-aws_5.0.0_linux_amd64.zip",
        download_url: "https://releases.example/aws.zip",
        shasums_url: "https://releases.example/SHA256SUMS",
        shasums_signature_url: "https://releases.example/SHA256SUMS.sig",
        shasum: "abc123",
        signing_keys: {
          gpg_public_keys: [
            {
              key_id: "34365D9472D7468F",
              ascii_armor: "-----BEGIN",
              trust_signature: "",
              source: "HashiCorp",
              source_url: null,
            },
          ],
        },
      })
    ).toEqual(
      expect.objectContaining({
        filename: "terraform-provider-aws_5.0.0_linux_amd64.zip",
        signing_keys: {
          gpg_public_keys: [
            {
              key_id: "34365D9472D7468F",
              ascii_armor: "-----BEGIN",
              trust_signature: "",
              source: "HashiCorp",
              source_url: "",
            },
          ],
        },
      })
    );
  });

  it("rejects responses missing what the UI acts on", () => {
    expect(() => parseProviderSearch({ error: "Failed to search providers" })).toThrow(ResponseShapeError);
    expect(() => parseProviderVersions({ versions: [{ version: "5.0.0", platforms: [{ os: "linux" }] }] })).toThrow(
      "Unexpected platform arch"
    );
    expect(() => parseProviderDetails({ id: "x", namespace: "n", name: "aws", version: null })).toThrow(
      "Unexpected provider version"
    );
    expect(() => parseProviderDownload({ os: "linux", arch: "amd64", signing_keys: {} })).toThrow(
      "Unexpected provider download filename"
    );
    expect(() => parseModuleSearch("<html></html>")).toThrow("Expected the module search to be an object");
  });
});
