import { fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";

// The list read names what the cards and table render; the org filter counts on the organization linkage.
export const POLICY_SET_LIST_FIELDS = fields.policy_set(
  "name",
  "description",
  "enforcementLevel",
  "shadowEnforcementLevel",
  "global",
  "overrideTeam",
  "repository",
  "branch",
  "folder",
  { organization: ids, attachments: ids, notificationConfiguration: ["name", "channelType"] }
);

/** One policy set as the list, the cards and the table read it. */
export type PolicySetRow = Row<typeof POLICY_SET_LIST_FIELDS>;
