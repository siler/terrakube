import { isOneOf, isStringArray, isUnknownArray, stringOrUndefined } from "../guards";

describe("isOneOf", () => {
  const options = ["light", "dark"] as const;

  it("accepts listed values", () => {
    expect(isOneOf(options, "dark")).toBe(true);
  });

  it("rejects unlisted, null and non-string values", () => {
    expect(isOneOf(options, "sepia")).toBe(false);
    expect(isOneOf(options, null)).toBe(false);
    expect(isOneOf(options, 1)).toBe(false);
  });
});

describe("isStringArray", () => {
  it("accepts arrays of strings, including empty ones", () => {
    expect(isStringArray(["a", "b"])).toBe(true);
    expect(isStringArray([])).toBe(true);
  });

  it.each([
    ["not a list", "a"],
    ["a mixed list", ["a", 1]],
    ["a list with null", [null]],
    ["an array-like", { 0: "a" }],
  ])("rejects %s", (_, value) => {
    expect(isStringArray(value)).toBe(false);
  });
});

describe("isUnknownArray", () => {
  it("accepts any array and nothing else", () => {
    expect(isUnknownArray([1, "a", null])).toBe(true);
    expect(isUnknownArray({ length: 0 })).toBe(false);
  });
});

describe("stringOrUndefined", () => {
  it("keeps strings and drops everything else", () => {
    expect(stringOrUndefined("")).toBe("");
    expect(stringOrUndefined(1)).toBeUndefined();
    expect(stringOrUndefined(null)).toBeUndefined();
  });
});
