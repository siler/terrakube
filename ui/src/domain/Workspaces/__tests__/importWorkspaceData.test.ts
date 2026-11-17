import axios from "axios";
import {
  fetchImporterWorkspaces,
  parseImportResult,
  parseSensitiveVariables,
  parseWorkspaceRecords,
  parseWorkspaceVarsets,
} from "../importWorkspaceData";

type ImporterRequestConfig = { params: Record<string, string>; headers: Record<string, string> };

const getMock = jest.fn<Promise<unknown>, [url: string, config: ImporterRequestConfig]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: (...args: Parameters<typeof getMock>) => getMock(...args) },
}));

describe("fetchImporterWorkspaces", () => {
  beforeEach(() => getMock.mockReset());

  it("sends the organization as an encoded query parameter", async () => {
    getMock.mockResolvedValue({ data: [] });
    await fetchImporterWorkspaces("https://api.test/importer/tfcloud", "R&D #1", { "X-TFC-Token": "t" });

    const [url, config] = getMock.mock.calls[0];
    expect(url).toBe("https://api.test/importer/tfcloud/workspaces");
    expect(config).toEqual({ params: { organization: "R&D #1" }, headers: { "X-TFC-Token": "t" } });
    const sent = new URL(axios.getUri({ url, params: config.params }));
    expect(sent.searchParams.get("organization")).toBe("R&D #1");
    expect(sent.hash).toBe("");
  });
});

describe("parseWorkspaceRecords", () => {
  it("normalizes JSON nulls and drops entries without an id or name", () => {
    const data = [
      {
        id: "ws-1",
        attributes: {
          name: "infra",
          description: null,
          "terraform-version": "1.5.0",
          "vcs-repo": { branch: "main", identifier: "acme/infra", "service-provider": null },
        },
      },
      { id: "ws-2", attributes: { name: "net", "terraform-version": null, "vcs-repo": null } },
      { id: "ws-3", attributes: {} },
    ];
    expect(parseWorkspaceRecords(data)).toEqual([
      {
        id: "ws-1",
        attributes: {
          name: "infra",
          description: undefined,
          "terraform-version": "1.5.0",
          "execution-mode": undefined,
          "working-directory": undefined,
          "vcs-repo": {
            branch: "main",
            identifier: "acme/infra",
            "service-provider": undefined,
            "repository-http-url": undefined,
          },
        },
      },
      {
        id: "ws-2",
        attributes: {
          name: "net",
          description: undefined,
          "terraform-version": "",
          "execution-mode": undefined,
          "working-directory": undefined,
          "vcs-repo": undefined,
        },
      },
    ]);
  });

  it("throws when the response is not a list", () => {
    expect(() => parseWorkspaceRecords("Invalid URL")).toThrow();
  });
});

describe("variable parsers", () => {
  it("reads variable sets", () => {
    expect(parseWorkspaceVarsets([{ id: "vs-1", name: "shared" }, { id: "vs-2" }])).toEqual([
      { id: "vs-1", name: "shared" },
    ]);
    expect(() => parseWorkspaceVarsets(null)).toThrow();
  });

  it("reads sensitive variables and fails loudly on a non-list", () => {
    expect(
      parseSensitiveVariables([{ id: "v1", key: "TOKEN", description: null, category: "env", hcl: false }])
    ).toEqual([{ id: "v1", key: "TOKEN", description: undefined, category: "env", hcl: false }]);
    expect(() => parseSensitiveVariables({})).toThrow();
  });
});

describe("parseImportResult", () => {
  it("keeps the importer's HTML and ignores anything else", () => {
    expect(parseImportResult("<li>done</li>")).toBe("<li>done</li>");
    expect(parseImportResult({ ok: true })).toBe("");
  });
});
