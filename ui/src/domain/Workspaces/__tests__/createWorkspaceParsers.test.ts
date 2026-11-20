import {
  firstAtomicResultId,
  parseVcsRepositoryGroups,
  parseVcsRepositoryPage,
  parseVersionIndex,
} from "../createWorkspaceParsers";

describe("parseVersionIndex", () => {
  it("lists stable OpenTofu releases newest first without the v prefix", () => {
    const index = [{ tag_name: "v1.6.0" }, { tag_name: "v1.8.0-rc1" }, { tag_name: "v1.7.2" }, { other: 1 }];
    expect(parseVersionIndex("tofu", index)).toEqual(["1.7.2", "1.6.0"]);
  });

  it("lists stable Terraform versions newest first", () => {
    const index = { versions: { "1.5.0": {}, "1.6.0-beta1": {}, "1.9.1": {} } };
    expect(parseVersionIndex("terraform", index)).toEqual(["1.9.1", "1.5.0"]);
  });

  it.each([
    ["tofu", { versions: {} }],
    ["tofu", null],
    ["terraform", null],
    ["terraform", [{ tag_name: "v1.0.0" }]],
    ["terraform", { versions: "1.0.0" }],
  ])("yields no versions for a malformed %s index %p", (iacType, index) => {
    expect(parseVersionIndex(iacType, index)).toEqual([]);
  });
});

describe("VCS discovery parsers", () => {
  it("keeps only well-formed groups and treats a non-list as none", () => {
    expect(parseVcsRepositoryGroups([{ id: "g1", name: "acme" }, { id: 2 }])).toEqual([{ id: "g1", name: "acme" }]);
    expect(parseVcsRepositoryGroups(null)).toEqual([]);
  });

  it("reads a repository page and rejects other shapes", () => {
    const repo = {
      name: "infra",
      fullName: "acme/infra",
      group: "acme",
      url: "https://x/acme/infra",
      privateRepo: true,
    };
    expect(parseVcsRepositoryPage({ items: [repo, { name: "bad" }], hasMore: false, page: 2 })).toEqual({
      items: [repo],
      hasMore: false,
      page: 2,
    });
    expect(parseVcsRepositoryPage({ items: "nope", hasMore: false, page: 1 })).toBeNull();
  });
});

describe("firstAtomicResultId", () => {
  it("returns the first result's id, or undefined when absent", () => {
    expect(firstAtomicResultId({ "atomic:results": [{ data: { id: "ws-1" } }] })).toBe("ws-1");
    expect(firstAtomicResultId({ "atomic:results": [] })).toBeUndefined();
    expect(firstAtomicResultId("")).toBeUndefined();
  });
});
