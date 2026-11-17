import { parseDisplayCriteria } from "../actionCriteria";

describe("parseDisplayCriteria", () => {
  it.each(["", "   ", "null", null, undefined])("treats %p as no criteria", (stored) => {
    expect(parseDisplayCriteria(stored)).toEqual([]);
  });

  it("returns stored criteria with their settings", () => {
    const criteria = [
      { filter: "context.workspace.iacType === 'terraform'", settings: [{ key: "a", value: "one" }] },
      { filter: "true" },
    ];
    expect(parseDisplayCriteria(JSON.stringify(criteria))).toEqual(criteria);
  });

  it.each(['{"filter":"true"}', '[{"settings":[]}]', '[{"filter":"true","settings":[{"value":1}]}]'])(
    "rejects %s, which is not a list of criteria",
    (stored) => {
      expect(() => parseDisplayCriteria(stored)).toThrow("not a list of filters and settings");
    }
  );

  it("rejects malformed JSON", () => {
    expect(() => parseDisplayCriteria("[{")).toThrow(SyntaxError);
  });
});
