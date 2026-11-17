import { normalizePolicyEvaluation } from "../policyEvaluation";

describe("normalizePolicyEvaluation", () => {
  it("returns undefined for a missing or non-object value", () => {
    expect(normalizePolicyEvaluation(undefined)).toBeUndefined();
    expect(normalizePolicyEvaluation(null)).toBeUndefined();
    expect(normalizePolicyEvaluation("failed")).toBeUndefined();
    expect(normalizePolicyEvaluation([])).toBeUndefined();
  });

  it("keeps correctly typed fields and nested results", () => {
    const evaluation = normalizePolicyEvaluation({
      jobId: 7,
      stepId: "s-1",
      hardMandatoryViolations: 1,
      results: [
        {
          policySetName: "baseline",
          hardMandatoryViolations: 1,
          violations: [{ ruleId: "no-public-s3", address: "aws_s3_bucket.a", expiresAt: 1700000000 }],
          bufferedLogs: ["line", 3],
        },
      ],
    });

    expect(evaluation).toMatchObject({
      jobId: 7,
      stepId: "s-1",
      hardMandatoryViolations: 1,
      results: [
        {
          policySetName: "baseline",
          hardMandatoryViolations: 1,
          violations: [{ ruleId: "no-public-s3", address: "aws_s3_bucket.a", expiresAt: 1700000000 }],
          bufferedLogs: ["line"],
        },
      ],
    });
  });

  it("drops wrongly typed fields and non-object entries but keeps a violation missing its rule id", () => {
    const evaluation = normalizePolicyEvaluation({
      softMandatoryViolations: "2",
      results: ["bad", { violations: [{ message: "unnamed rule" }, null] }],
    });

    expect(evaluation?.softMandatoryViolations).toBeUndefined();
    expect(evaluation?.results).toHaveLength(1);
    expect(evaluation?.results?.[0].violations).toEqual([
      expect.objectContaining({ ruleId: "", message: "unnamed rule" }),
    ]);
  });
});
