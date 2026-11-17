import { computePlanTotals, formatPlanSummary } from "../structuredPlan";

describe("computePlanTotals", () => {
  it("is null when no plan was read", () => {
    expect(computePlanTotals({})).toBeNull();
  });

  it("counts every change of every plan step, with a delete and a create as a replace", () => {
    const totals = computePlanTotals({
      "100": [
        { address: "a", actions: ["create"] },
        { address: "b", actions: ["delete", "create"] },
      ],
      "300": [{ address: "c", actions: ["delete"] }],
    });

    expect(totals).toEqual({ create: 1, update: 0, delete: 1, replace: 1 });
    expect(totals && formatPlanSummary(totals)).toBe("1 to add, 0 to change, 1 to destroy, 1 to replace");
  });

  it("does not count a fallback action that names an Object.prototype member", () => {
    const totals = computePlanTotals({ "100": [{ address: "a", action: "toString" }] });

    expect(totals).toEqual({ create: 0, update: 0, delete: 0, replace: 0 });
  });
});
