import type { PolicyEvaluationContext } from "../../types";
import { hasBlockingPolicyViolations } from "../policyViolations";

describe("hasBlockingPolicyViolations", () => {
  it("is false without an evaluation or without violations", () => {
    expect(hasBlockingPolicyViolations(undefined)).toBe(false);
    expect(hasBlockingPolicyViolations({ softMandatoryViolations: 0, hardMandatoryViolations: 0 })).toBe(false);
    expect(hasBlockingPolicyViolations({ results: [{ softMandatoryViolations: 0 }] })).toBe(false);
  });

  it.each<[string, PolicyEvaluationContext]>([
    ["soft at the top", { softMandatoryViolations: 1 }],
    ["hard at the top", { hardMandatoryViolations: 1 }],
    ["soft in one policy set", { results: [{}, { softMandatoryViolations: 2 }] }],
    ["hard in one policy set", { results: [{}, { hardMandatoryViolations: 1 }] }],
  ])("is true for %s violations", (_name, evaluation) => {
    expect(hasBlockingPolicyViolations(evaluation)).toBe(true);
  });
});
