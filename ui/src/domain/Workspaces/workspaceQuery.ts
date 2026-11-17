import { API_SCHEMA } from "../generated/apiResources";
import { api, fields } from "../generated/apiPaths";
import type { Row } from "../api/fieldSelection";
import { isRecord } from "@/modules/utils/typeGuards";

// Every job attribute the run card, current run, metrics and the runs list read.
const JOB_FIELDS = fields.job(
  "status",
  "via",
  "createdBy",
  "createdDate",
  "updatedDate",
  "commitId",
  "templateReference",
  "approvedBy",
  "approvedAt",
  "approvalTeam",
  "comments",
  "prCommentError"
);

/** A run as the workspace page loads it. */
export type WorkspaceJob = Row<typeof JOB_FIELDS>;

// Read by the Variables tab and its edit form.
const VARIABLE_FIELDS = fields.variable("key", "value", "category", "hcl", "sensitive", "incomplete", "description");

/** A workspace variable as the Variables tab lists and edits it. */
export type WorkspaceVariableRow = Row<typeof VARIABLE_FIELDS>;

// Read by the States tab and to pick the state version the overview previews.
const HISTORY_FIELDS = fields.history("jobReference", "output", "createdBy", "createdDate");

/** A state version as the workspace page loads it. */
export type WorkspaceHistory = Row<typeof HISTORY_FIELDS>;

// Read by the Schedules tab and its edit form.
const SCHEDULE_FIELDS = fields.schedule("cron", "templateReference");

/** A schedule as loaded with the workspace; its name comes from the template list, which loads separately. */
export type WorkspaceScheduleRow = Row<typeof SCHEDULE_FIELDS>;

// The header, status strip and rail read these on every tab; the newest history entry also feeds the state preview.
const BASE_INCLUDES = {
  history: HISTORY_FIELDS,
  vcs: fields.vcs("vcsType"),
  organization: fields.organization("name"),
  project: fields.project("name"),
};

const isLinkage = <E>(entry: E): entry is Exclude<E, string> => typeof entry !== "string";

// Action scripts receive the whole workspace object and may read any field, so the page asks for every attribute
// and every relationship's linkage, including only what the page itself reads.
const ALL_LINKAGE = fields.workspace.all.selection.filter(isLinkage)[0];

const BASE_FIELDS = fields.workspace(...API_SCHEMA.workspace.attributes, { ...ALL_LINKAGE, ...BASE_INCLUDES });

const JOBS_FIELDS = fields.workspace(...API_SCHEMA.workspace.attributes, {
  ...ALL_LINKAGE,
  ...BASE_INCLUDES,
  job: JOB_FIELDS,
});

const VARIABLES_FIELDS = fields.workspace(...API_SCHEMA.workspace.attributes, {
  ...ALL_LINKAGE,
  ...BASE_INCLUDES,
  variable: VARIABLE_FIELDS,
});

const SCHEDULES_FIELDS = fields.workspace(...API_SCHEMA.workspace.attributes, {
  ...ALL_LINKAGE,
  ...BASE_INCLUDES,
  schedule: SCHEDULE_FIELDS,
});

/** The workspace as every tab of its page loads it: all fields, with history, vcs, organization and project. */
export type WorkspacePageRow = Row<typeof BASE_FIELDS>;

/** Which of the collections only some tabs read one workspace page request carries. */
export type WorkspacePageRequest = {
  jobs: boolean;
  variables: boolean;
  schedule: boolean;
};

const BASE_REQUEST: WorkspacePageRequest = { jobs: false, variables: false, schedule: false };

const JOBS_REQUEST: WorkspacePageRequest = { ...BASE_REQUEST, jobs: true };

const VARIABLES_REQUEST: WorkspacePageRequest = { ...BASE_REQUEST, variables: true };

const SCHEDULES_REQUEST: WorkspacePageRequest = { ...BASE_REQUEST, schedule: true };

/**
 * The workspace page request for a tab: every tab gets the page chrome, and only the tab that shows jobs,
 * variables or schedules asks for them. An open run loads its own data, so the Runs tab skips the job list then.
 */
export const workspacePageRequest = (tab: string, runOpen = false): WorkspacePageRequest => {
  switch (tab) {
    case "1":
      return JOBS_REQUEST;
    case "2":
      if (runOpen) {
        return BASE_REQUEST;
      }
      return JOBS_REQUEST;
    case "4":
      return VARIABLES_REQUEST;
    case "5":
      return SCHEDULES_REQUEST;
    default:
      return BASE_REQUEST;
  }
};

/** One workspace page load; a tab collection the request did not ask for is null, so it keeps what is on screen. */
export type WorkspacePage = {
  workspace: WorkspacePageRow;
  jobs: WorkspaceJob[] | null;
  variables: WorkspaceVariableRow[] | null;
  schedule: WorkspaceScheduleRow[] | null;
};

/** A workspace page request bound to a workspace: its URL, and a load that sends it. */
export type WorkspacePageQuery = {
  url(): string;
  load(signal: AbortSignal): Promise<WorkspacePage>;
};

type NoCollections = Omit<WorkspacePage, "workspace">;

const NO_COLLECTIONS: NoCollections = { jobs: null, variables: null, schedule: null };

const pageQuery = <R extends WorkspacePageRow>(
  query: { url(): string; signal(signal: AbortSignal): PromiseLike<R> },
  collections: (workspace: R) => Partial<NoCollections>
): WorkspacePageQuery => ({
  url: () => query.url(),
  load: async (signal) => {
    const workspace = await query.signal(signal);
    return { workspace, ...NO_COLLECTIONS, ...collections(workspace) };
  },
});

/** The query a workspace page request sends for one workspace. */
export const workspacePageQuery = (
  organizationId: string,
  workspaceId: string,
  request: WorkspacePageRequest
): WorkspacePageQuery => {
  const workspace = api.organization(organizationId).workspace(workspaceId);
  if (request.jobs) {
    return pageQuery(workspace.select(JOBS_FIELDS), ({ job }) => ({ jobs: job }));
  }
  if (request.variables) {
    return pageQuery(workspace.select(VARIABLES_FIELDS), ({ variable }) => ({ variables: variable }));
  }
  if (request.schedule) {
    return pageQuery(workspace.select(SCHEDULES_FIELDS), ({ schedule }) => ({ schedule }));
  }
  return pageQuery(workspace.select(BASE_FIELDS), () => ({}));
};

/** The organization template fields the workspace page and the components it hands templates to read. */
export const ORG_TEMPLATE_FIELDS = fields.template("name", "tcl", "description");

/** An organization template as the workspace page loads it. */
export type OrgTemplateRow = Row<typeof ORG_TEMPLATE_FIELDS>;

type ResourceIdentifier = { type: string; id: string };

/** The workspace as action scripts read it: a JSON:API resource object. */
export type ActionWorkspace = {
  type: "workspace";
  id: string;
  attributes: Record<string, unknown>;
  relationships: Record<string, { data: ResourceIdentifier | ResourceIdentifier[] | null }>;
};

/**
 * The page's workspace in the JSON:API shape action scripts were written against
 * (`context.workspace.attributes.x`, `context.workspace.relationships.r.data.id`), so their contract does not
 * change with how the page reads it. Relationships carry linkage only, as they did before.
 */
export const toActionWorkspace = (workspace: WorkspacePageRow): ActionWorkspace => {
  const row: Record<string, unknown> = workspace;
  const { attributes, relationships } = API_SCHEMA.workspace;
  const identifier = (type: string, related: { id: string }) => ({ type, id: related.id });
  const isIdentified = (value: unknown): value is { id: string } => isRecord(value) && typeof value.id === "string";
  return {
    type: "workspace",
    id: workspace.id,
    attributes: Object.fromEntries(
      attributes.filter((name) => name in row).map((name): [string, unknown] => [name, row[name]])
    ),
    relationships: Object.fromEntries(
      Object.entries(relationships)
        .filter(([name]) => name in row)
        .map(([name, { type }]): [string, ActionWorkspace["relationships"][string]] => {
          const related = row[name];
          if (Array.isArray(related)) {
            return [name, { data: related.filter(isIdentified).map((item) => identifier(type, item)) }];
          }
          return [name, { data: isIdentified(related) ? identifier(type, related) : null }];
        })
    ),
  };
};
