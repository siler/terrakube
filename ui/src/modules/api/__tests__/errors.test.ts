import { responseStatus } from "../errors";

describe("responseStatus", () => {
  it("reads the status of a rejected request", () => {
    expect(responseStatus({ response: { status: 424 } })).toBe(424);
  });

  it.each([new Error("network"), "boom", null, { response: null }, { response: { status: "404" } }])(
    "is undefined without a numeric response status (%p)",
    (error) => {
      expect(responseStatus(error)).toBeUndefined();
    }
  );
});
