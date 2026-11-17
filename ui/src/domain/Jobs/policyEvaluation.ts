import { isRecord, stringOrUndefined } from "@/modules/utils/typeGuards";
import { PolicyEvaluationContext, PolicyEvaluationResultItem, PolicyViolationItem } from "../types";

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const recordsOf = (value: unknown): Record<string, unknown>[] | undefined =>
  Array.isArray(value) ? value.filter(isRecord) : undefined;

const normalizeViolation = (item: Record<string, unknown>): PolicyViolationItem => ({
  // A violation without a rule id is still a violation; dropping it would hide a blocking result.
  ruleId: stringOrUndefined(item.ruleId) ?? "",
  address: stringOrUndefined(item.address),
  message: stringOrUndefined(item.message),
  status: stringOrUndefined(item.status),
  ticketReference: stringOrUndefined(item.ticketReference),
  justification: stringOrUndefined(item.justification),
  expiresAt: stringOrUndefined(item.expiresAt) ?? optionalNumber(item.expiresAt),
  suggestedFix: stringOrUndefined(item.suggestedFix),
});

const normalizeResult = (item: Record<string, unknown>): PolicyEvaluationResultItem => ({
  policySetId: stringOrUndefined(item.policySetId),
  policySetName: stringOrUndefined(item.policySetName),
  enforcementLevel: stringOrUndefined(item.enforcementLevel),
  shadowEnforcementLevel: stringOrUndefined(item.shadowEnforcementLevel),
  status: stringOrUndefined(item.status),
  exitCode: optionalNumber(item.exitCode),
  passedRules: optionalNumber(item.passedRules),
  warningRules: optionalNumber(item.warningRules),
  softMandatoryViolations: optionalNumber(item.softMandatoryViolations),
  hardMandatoryViolations: optionalNumber(item.hardMandatoryViolations),
  shadowHardViolations: optionalNumber(item.shadowHardViolations),
  shadowSoftViolations: optionalNumber(item.shadowSoftViolations),
  violations: recordsOf(item.violations)?.map(normalizeViolation),
  exemptedViolations: recordsOf(item.exemptedViolations)?.map(normalizeViolation),
  bufferedLogs: Array.isArray(item.bufferedLogs)
    ? item.bufferedLogs.filter((line): line is string => typeof line === "string")
    : undefined,
});

/**
 * Reads the `policyEvaluation` block of a job context response, keeping only correctly typed fields.
 * Returns undefined when the value is not an object.
 */
export const normalizePolicyEvaluation = (value: unknown): PolicyEvaluationContext | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    jobId: stringOrUndefined(value.jobId) ?? optionalNumber(value.jobId),
    stepId: stringOrUndefined(value.stepId),
    totalPolicies: optionalNumber(value.totalPolicies),
    status: stringOrUndefined(value.status),
    passedRules: optionalNumber(value.passedRules),
    warningRules: optionalNumber(value.warningRules),
    softMandatoryViolations: optionalNumber(value.softMandatoryViolations),
    hardMandatoryViolations: optionalNumber(value.hardMandatoryViolations),
    shadowHardViolations: optionalNumber(value.shadowHardViolations),
    shadowSoftViolations: optionalNumber(value.shadowSoftViolations),
    results: recordsOf(value.results)?.map(normalizeResult),
  };
};
