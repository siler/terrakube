import { linkIncluded } from "../../../testUtils/fixtureLinkage";
import { createProvider, deleteProviderCascade, getProvider, listProviders } from "../providerService";

const mockGet = jest.fn<Promise<{ data?: unknown }>, [string, unknown?]>();
const mockPost = jest.fn<Promise<{ data?: unknown }>, [string, unknown, unknown?]>();
const mockDelete = jest.fn<Promise<unknown>, [string]>();

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: {
    get: (url: string, config?: unknown) => mockGet(url, config),
    post: (url: string, body: unknown, config?: unknown) => mockPost(url, body, config),
    delete: (url: string) => mockDelete(url),
  },
  axiosRegistry: { get: jest.fn() },
}));

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset().mockResolvedValue({});
});

const providerDoc = {
  data: {
    data: {
      id: "p1",
      type: "provider",
      attributes: { name: "random", description: "", registryNamespace: "hashicorp" },
    },
    included: [
      {
        id: "v1",
        type: "version",
        attributes: { versionNumber: "3.6.0", protocols: "5.0", status: "deprecated", deprecationMessage: "use 4.0" },
      },
    ],
  },
};

describe("providerService reads", () => {
  it("lists only the names the public-registry pages check", async () => {
    mockGet.mockResolvedValue({
      data: { data: [{ id: "p1", type: "provider", attributes: { name: "random" } }] },
    });

    await expect(listProviders("org-1")).resolves.toEqual([{ id: "p1", name: "random" }]);
    expect(mockGet).toHaveBeenCalledWith("organization/org-1/provider?fields[provider]=name", expect.anything());
  });

  it("reads each version's status details, deprecation message included", async () => {
    mockGet.mockImplementation((url: string) => Promise.resolve(linkIncluded(url, providerDoc)));

    const provider = await getProvider("org-1", "p1");
    expect(provider.name).toBe("random");
    expect(provider.version[0]).toEqual({
      id: "v1",
      versionNumber: "3.6.0",
      protocols: "5.0",
      status: "deprecated",
      deprecationMessage: "use 4.0",
    });
    expect(mockGet).toHaveBeenCalledWith(
      "organization/org-1/provider/p1?include=version" +
        "&fields[provider]=name,description,registryNamespace,imported,version" +
        "&fields[version]=versionNumber,protocols,status,deprecationMessage",
      expect.anything()
    );
  });

  it("deletes implementations, then versions, then the provider", async () => {
    const cascadeDoc = {
      data: {
        data: {
          id: "p1",
          type: "provider",
          attributes: { name: "random" },
          relationships: {
            version: {
              data: [
                { type: "version", id: "v1" },
                { type: "version", id: "v2" },
              ],
            },
          },
        },
        included: [
          {
            id: "v1",
            type: "version",
            attributes: { versionNumber: "1.0.0" },
            relationships: { implementation: { data: [{ type: "implementation", id: "i1" }] } },
          },
          {
            id: "v2",
            type: "version",
            attributes: { versionNumber: "2.0.0" },
            relationships: { implementation: { data: [{ type: "implementation", id: "i2" }] } },
          },
          { id: "i1", type: "implementation", attributes: {} },
          { id: "i2", type: "implementation", attributes: {} },
        ],
      },
    };
    mockGet.mockImplementation((url: string) => Promise.resolve(linkIncluded(url, cascadeDoc)));

    await deleteProviderCascade("org-1", "p1");

    expect(mockGet).toHaveBeenCalledWith(
      "organization/org-1/provider/p1?include=version&fields[provider]=version&fields[version]=implementation",
      expect.anything()
    );
    expect(mockDelete.mock.calls.map(([url]) => url)).toEqual([
      "organization/org-1/provider/p1/version/v1/implementation/i1",
      "organization/org-1/provider/p1/version/v2/implementation/i2",
      "organization/org-1/provider/p1/version/v1",
      "organization/org-1/provider/p1/version/v2",
      "organization/org-1/provider/p1",
    ]);
  });
});

describe("providerService writes", () => {
  it("reads the created provider back from the JSON:API response", async () => {
    mockPost.mockResolvedValue({
      data: { data: { id: "p9", type: "provider", attributes: { name: "random", description: "d", imported: true } } },
    });

    await expect(createProvider("org-1", "random", "d", { imported: true })).resolves.toEqual({
      data: { id: "p9", name: "random", description: "d", imported: true },
    });
  });

  it("rejects a response body that is not a JSON:API document", async () => {
    mockPost.mockResolvedValue({ data: "<html>proxy error</html>" });

    await expect(createProvider("org-1", "random", "d")).rejects.toThrow("Expected a JSON:API document");
  });
});
