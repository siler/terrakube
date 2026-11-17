import { matchDisplayCriteria } from "../actionCriteria";

describe("matchDisplayCriteria", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("evaluates filters against the context it is given", () => {
    const criteria = JSON.stringify([{ filter: 'context.workspace.iacType === "terraform"' }]);

    expect(matchDisplayCriteria(criteria, { workspace: { iacType: "terraform" } })).toEqual({});
    expect(matchDisplayCriteria(criteria, { workspace: { iacType: "tofu" } })).toBeNull();
  });

  it("returns the settings of the first matching criterion", () => {
    const criteria = JSON.stringify([
      { filter: "false", settings: [{ key: "a", value: 1 }] },
      { filter: "context.state?.provider?.includes('azurerm')", settings: [{ key: "b", value: "two" }] },
      { filter: "true", settings: [{ key: "c", value: 3 }] },
    ]);

    expect(matchDisplayCriteria(criteria, { state: { provider: "registry/azurerm" } })).toEqual({ b: "two" });
  });

  it("keeps statement filters working through their completion value", () => {
    const criteria = JSON.stringify([{ filter: "const n = context.count; n > 1" }]);

    expect(matchDisplayCriteria(criteria, { count: 2 })).toEqual({});
  });

  it("skips a criterion whose filter throws and keeps looking", () => {
    const criteria = JSON.stringify([{ filter: "context.missing.deep" }, { filter: "true" }]);

    expect(matchDisplayCriteria(criteria, {})).toEqual({});
  });

  it.each([
    ["invalid JSON", "{"],
    ["a non-array", JSON.stringify({ filter: "true" })],
    ["malformed criteria", JSON.stringify([{ filter: 1 }, { settings: [] }])],
  ])("matches nothing for %s", (_, criteria) => {
    expect(matchDisplayCriteria(criteria, {})).toBeNull();
  });
});
