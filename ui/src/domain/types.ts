// Shared

import { AuditFieldBase } from "@/modules/types";
import type { OrganizationSummary, OrganizationWorkspaceCounts } from "@/modules/organizations/organizationService";
import { fields } from "./generated/apiPaths";
import type { FormValues } from "./api/writeBodies";
import type { Row } from "./api/fieldSelection";
import { VcsType as GeneratedVcsType } from "./generated/apiResources";
import type { DeliveryState } from "./generated/apiResources";

export type TofuRelease = {
  tag_name: string;
};

/** An organization as the UI lists it, with the workspace counts it fetches separately. */
export type FlatOrganization = Partial<Omit<OrganizationSummary, "id" | "name">> &
  Pick<OrganizationSummary, "id" | "name"> &
  Partial<OrganizationWorkspaceCounts>;

// Jobs
export enum JobVia {
  Ui = "UI",
  Cli = "CLI",
  Github = "Github",
  Gitlab = "Gitlab",
  Bitbucket = "Bitbucket",
  AzureDevops = "AzureDevops",
  Schedule = "Schedule",
  RunTrigger = "RunTrigger",
}

export const formatJobVia = (via?: JobVia | string): string => {
  if (!via) {
    return "UI";
  }
  switch (via) {
    case JobVia.Github:
    case "Github":
      return "GitHub";
    case JobVia.Gitlab:
    case "Gitlab":
    case "GitLab":
      return "GitLab";
    case JobVia.Bitbucket:
    case "Bitbucket":
      return "Bitbucket";
    case JobVia.AzureDevops:
    case "AzureDevops":
    case "Azure DevOps":
      return "Azure DevOps";
    case JobVia.Cli:
    case "CLI":
      return "CLI";
    case JobVia.Schedule:
    case "Schedule":
      return "Schedule";
    case JobVia.Ui:
    case "UI":
      return "UI";
    case JobVia.RunTrigger:
    case "RunTrigger":
      return "Run Trigger";
    default:
      return via;
  }
};

export const STEP_FIELDS = fields.step(
  "stepNumber",
  "status",
  "output",
  "name",
  "deliveryState",
  "executionDurationMs",
  "executionPhase"
);

export type JobStep = Omit<Row<typeof STEP_FIELDS>, "deliveryState" | "output" | "name"> & {
  // The run page coalesces these two nullable attributes to "" before any consumer sees a row.
  output: string;
  name: string;
  outputLog: string;
  /**
   * Whether this step's final structured output reached durable storage (#3692). Absent when the
   * API predates the field.
   */
  deliveryState?: DeliveryState;
};

// VCS

export const VcsTypeOrUnknown = { ...GeneratedVcsType, UNKNOWN: "UNKNOWN" } as const;
export type VcsTypeOrUnknown = (typeof VcsTypeOrUnknown)[keyof typeof VcsTypeOrUnknown];

export enum VcsTypeExtended {
  GITHUB = "GITHUB",
  GITHUB_APP = "GITHUB_APP",
  GITHUB_ENTERPRISE = "GITHUB_ENTERPRISE",
  GITLAB = "GITLAB",
  GITLAB_ENTERPRISE = "GITLAB_ENTERPRISE",
  GITLAB_COMMUNITY = "GITLAB_COMMUNITY",
  BITBUCKET = "BITBUCKET",
  BITBUCKET_SERVER = "BITBUCKET_SERVER",
  AZURE_DEVOPS = "AZURE_DEVOPS",
  AZURE_DEVOPS_SERVER = "AZURE_DEVOPS_SERVER",
  PUBLIC = "PUBLIC",
}

export type VcsRepositoryGroup = {
  id: string;
  name: string;
};

export type VcsRepositorySummary = {
  name: string;
  fullName: string;
  group: string;
  url: string;
  privateRepo: boolean;
  defaultBranch?: string;
};

export type VcsRepositoryPage = {
  items: VcsRepositorySummary[];
  hasMore: boolean;
  page: number;
};

// Token
export type TeamToken = {
  id: string;
  days: number;
  hours: number;
  minutes: number;
  group: string;
  description: string;
  deleted: boolean;
} & AuditFieldBase;

// Variables

// The forms never hold null or the server-computed incomplete flag, so both are stripped from the write attributes.
export type CreateVariableForm = Pick<
  FormValues<"variable">,
  "category" | "description" | "hcl" | "key" | "sensitive" | "value"
>;

export type UpdateVariableForm = Omit<CreateVariableForm, "sensitive">;

// States
/** A resource instance read from a workspace state, in either state format. */
export type Resource = {
  name: string;
  provider: string;
  type: string;
  /** "root_module" for root resources, otherwise the module address, e.g. "module.foo". */
  module: string;
  index?: string | number;
  values: Record<string, unknown>;
  depends_on: string[];
};

/** A resource as a state diagram node carries it. */
export type ResourceNodeData = Resource & { showDrawer: (data: Resource) => void };

// State output
/** A state output as the outputs table shows it: sensitive values masked, others as display text. */
export type StateOutputValue = { type: string; value: string };

// Policy Governance (OPA)
export type PolicyViolationItem = {
  ruleId: string;
  address?: string;
  message?: string;
  status?: string;
  ticketReference?: string;
  justification?: string;
  expiresAt?: string | number;
  suggestedFix?: string;
};

export type PolicyEvaluationResultItem = {
  policySetId?: string;
  policySetName?: string;
  enforcementLevel?: string;
  shadowEnforcementLevel?: string;
  status?: string;
  exitCode?: number;
  passedRules?: number;
  warningRules?: number;
  softMandatoryViolations?: number;
  hardMandatoryViolations?: number;
  shadowHardViolations?: number;
  shadowSoftViolations?: number;
  violations?: PolicyViolationItem[];
  exemptedViolations?: PolicyViolationItem[];
  bufferedLogs?: string[];
};

export type PolicyEvaluationContext = {
  jobId?: number | string;
  stepId?: string;
  totalPolicies?: number;
  status?: string;
  passedRules?: number;
  warningRules?: number;
  softMandatoryViolations?: number;
  hardMandatoryViolations?: number;
  shadowHardViolations?: number;
  shadowSoftViolations?: number;
  results?: PolicyEvaluationResultItem[];
};
