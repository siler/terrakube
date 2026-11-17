import { createdResourceId, parseApiDocument } from "../parseDocument";

describe("parseApiDocument", () => {
  it.each([
    ["a single resource", { data: { id: "p1", type: "provider", attributes: { name: "x" } } }],
    ["a list with included", { data: [{ id: "p1", type: "provider" }], included: [{ id: "v1", type: "version" }] }],
    ["null data", { data: null }],
    ["a primary resource without its type, which the read already knows", { data: { id: "p1" } }],
    [
      "relationship linkage",
      {
        data: {
          id: "p1",
          type: "provider",
          relationships: { version: { data: [{ type: "version", id: "v1" }] }, owner: { data: null }, team: {} },
        },
      },
    ],
  ])("accepts %s", (_, body) => {
    expect(parseApiDocument(body)).toBe(body);
  });

  it.each([
    ["a string body", "<html></html>"],
    ["missing data", {}],
    ["a resource without an id", { data: { type: "provider" } }],
    ["non-object attributes", { data: { id: "p1", type: "provider", attributes: "x" } }],
    ["linkage without ids", { data: { id: "p1", type: "provider", relationships: { version: { data: [{}] } } } }],
    ["a non-array included", { data: null, included: {} }],
    ["an included resource without the type it is looked up by", { data: null, included: [{ id: "v1" }] }],
    ["a non-string type", { data: { id: "p1", type: 7 } }],
    ["a JSON:API error body", { errors: [] }],
  ])("rejects %s", (_, body) => {
    expect(() => parseApiDocument(body)).toThrow("Expected a JSON:API document");
  });
});

describe("createdResourceId", () => {
  it("returns the id of a JSON:API create response", () => {
    expect(createdResourceId({ data: { type: "policy_set", id: "ps-1" } })).toBe("ps-1");
  });

  it.each([undefined, null, "ps-1", {}, { data: null }, { data: [] }, { data: { id: 7 } }, { data: { id: "" } }])(
    "returns undefined for %p",
    (body) => {
      expect(createdResourceId(body)).toBeUndefined();
    }
  );
});
