import { fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";

// The scope ids come from the linkage, which arrives even for a related resource this user cannot
// read; the names are looked up separately because Elide drops such a resource from `included`.
export const POLICY_EXEMPTION_FIELDS = fields.policy_exemption(
  "ruleId",
  "ticketReference",
  "justification",
  "expiresAt",
  "createdDate",
  "createdBy",
  { policySet: ids, workspace: ids, project: ids }
);

export type ExemptionRow = Row<typeof POLICY_EXEMPTION_FIELDS>;
