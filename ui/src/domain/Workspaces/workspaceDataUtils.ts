import { apiUrl } from "@/config/apiUrls";
import { AxiosInstance } from "axios";
import { axiosAuxiliary } from "../../config/axiosConfig";
import { JobVia, Resource, formatJobVia } from "../types";
import type { VcsType } from "../generated/apiResources";
import { api, fields } from "../generated/apiPaths";
import type { Row } from "../api/fieldSelection";
import type {
  WorkspaceHistory,
  WorkspaceJob,
  WorkspacePage,
  WorkspaceScheduleRow,
  WorkspaceVariableRow,
} from "./workspaceQuery";
import { getIaCNameById } from "./Workspaces";
import { getApiRequestUrl } from "../Jobs/outputUrl";
import { relativeTime } from "@/modules/utils/dates";
import { isRecord } from "@/modules/utils/typeGuards";
import { getResourceAddress, parseOldState, parseState, type StateOutputVariableWithName } from "./stateModel";

export { getResourceAddress, parseOldState, parseState, type StateOutputVariableWithName } from "./stateModel";

// Sorted alphabetically so a dropdown built from these options is browsable, not just
// searchable - state-parse order is otherwise root-module-first then per-module insertion
// order, which is meaningless to a user scanning the list.
export function buildResourceOptions(resources: Resource[]): { value: string; label: string }[] {
  return resources
    .map((resource) => getResourceAddress(resource))
    .sort((a, b) => a.localeCompare(b))
    .map((address) => ({ value: address, label: address }));
}

// Jobs created through the Terraform CLI get this fixed value in comments, so it says nothing about the run.
const CLI_JOB_COMMENT = "terraform-cli";

// A job created through the API can carry a short reason in its comments; use its first line as the run title.
function getJobComment(comments: unknown): string | undefined {
  if (typeof comments !== "string") return undefined;
  const firstLine = comments.trim().split("\n")[0].trim();
  return firstLine && firstLine !== CLI_JOB_COMMENT ? firstLine : undefined;
}

/** A run on the workspace page: the job fields the page requests, plus what it derives from them. */
export type WorkspaceJobRow = WorkspaceJob & { title: string; latestChange: string | null };

/** A state version as the States tab lists it. */
export type WorkspaceHistoryRow = Omit<WorkspaceHistory, "createdDate" | "jobReference" | "output"> & {
  title: string;
  relativeDate: string | null;
  createdDate: string;
  jobReference: string;
  output: string;
};

/** A schedule as the Schedules tab shows it, named after its template. */
export type NamedSchedule = WorkspaceScheduleRow & { name: string };

// Read by the Variables tab's global and collection tables.
const GLOBALVAR_FIELDS = fields.globalvar("key", "value", "category", "hcl", "sensitive", "description");

const COLLECTION_FIELDS = fields.collection("name", "priority", {
  item: ["key", "value", "category", "hcl", "sensitive", "description"],
});

/** An organization global variable as the Variables tab lists it. */
export type GlobalVariableRow = Row<typeof GLOBALVAR_FIELDS>;

type CollectionRow = Row<typeof COLLECTION_FIELDS>;

/** A collection variable as the Variables tab lists it, with the collection it came from. */
export type CollectionVariableRow = CollectionRow["item"][number] & {
  priority: CollectionRow["priority"];
  collectionName: CollectionRow["name"];
};

type VariableSources = {
  globalVariables: GlobalVariableRow[];
  collectionVariables: CollectionVariableRow[];
};

const loadVariableSources = async (
  organizationId: string | undefined,
  referenceIds: string[],
  signal?: AbortSignal
): Promise<VariableSources> => {
  const requestSignal = signal ?? new AbortController().signal;
  const globals = organizationId
    ? api.organization(organizationId).globalvar().select(GLOBALVAR_FIELDS).signal(requestSignal)
    : Promise.resolve([]);
  const collections = referenceIds.map((referenceId) =>
    api
      .reference(referenceId)
      .collection()
      .select(COLLECTION_FIELDS)
      .signal(requestSignal)
      .then(({ item, priority, name }) => item.map((variable) => ({ ...variable, priority, collectionName: name })))
  );
  const [globalVariables, ...collectionGroups] = await Promise.all([globals, ...collections]);
  return { globalVariables, collectionVariables: collectionGroups.flat() };
};

/** Inputs and state setters for {@link setupWorkspaceIncludes}. */
export type WorkspaceIncludeOptions = {
  axiosInstance: Pick<AxiosInstance, "get">;
  /** Whether the user may read state; only the state preview waits for it. */
  manageState: Promise<boolean>;
  /** Id of the state version on screen; a state download only lands while it still matches. */
  currentStateId: { current: string };
  /**
   * Organization and reference ids the global and collection variables on screen were loaded for; they are
   * fetched again only when these change, and a null forces a fetch.
   */
  variableSourcesKey: { current: string | null };
  /** False once a newer load or another workspace has taken over, so this response must not land. */
  isCurrent?: () => boolean;
  signal?: AbortSignal;
  setVariables: (val: WorkspaceVariableRow[]) => void;
  setJobs: (val: WorkspaceJobRow[]) => void;
  setEnvVariables: (val: WorkspaceVariableRow[]) => void;
  setHistory: (val: WorkspaceHistoryRow[]) => void;
  setSchedule: (val: WorkspaceScheduleRow[]) => void;
  setVCSProvider: (val: VcsType) => void;
  setResources: (val: Resource[]) => void;
  setOutputs: (val: StateOutputVariableWithName[]) => void;
  setContextState: (val: object) => void;
  setCollectionVariables: (val: CollectionVariableRow[]) => void;
  setCollectionEnvVariables: (val: CollectionVariableRow[]) => void;
  setGlobalVariables: (val: GlobalVariableRow[]) => void;
  setGlobalEnvVariables: (val: GlobalVariableRow[]) => void;
};

/**
 * Splits a workspace page load into page state, loads the global variables, collection variables and, when there
 * is a new state version, the state preview. A tab collection the load did not carry keeps what is on screen.
 */
export async function setupWorkspaceIncludes(
  { workspace, jobs: jobRows, variables: variableRows, schedule }: WorkspacePage,
  {
    axiosInstance,
    manageState,
    currentStateId,
    variableSourcesKey,
    isCurrent = () => true,
    signal,
    setVariables,
    setJobs,
    setEnvVariables,
    setHistory,
    setSchedule,
    setVCSProvider,
    setResources,
    setOutputs,
    setContextState,
    setCollectionVariables,
    setCollectionEnvVariables,
    setGlobalVariables,
    setGlobalEnvVariables,
  }: WorkspaceIncludeOptions
): Promise<void> {
  const iacName = getIaCNameById(workspace.iacType);
  const jobs = jobRows?.map((job): WorkspaceJobRow => {
    const isNonUi = job.via && job.via !== JobVia.Ui;
    return {
      ...job,
      title:
        getJobComment(job.comments) ??
        (isNonUi ? "Triggered via " + formatJobVia(job.via) : "Queue manually using " + iacName),
      latestChange: relativeTime(job.createdDate),
    };
  });
  const history = workspace.history.map((version): WorkspaceHistoryRow => ({
    ...version,
    jobReference: version.jobReference ?? "",
    output: getApiRequestUrl(version.output ?? ""),
    // A state version carries no trigger source, unlike a job.
    title: "Queue manually using " + iacName,
    relativeDate: relativeTime(version.createdDate),
    createdDate: version.createdDate ?? "",
  }));
  const organizationId = workspace.organization?.id;
  const referenceIds = workspace.reference.map(({ id }) => id);

  // Global and collection variables only change through other pages, so polls skip them unless the references do.
  const sourcesKey = [organizationId, ...[...referenceIds].sort()].join(",");
  let sources: VariableSources | undefined;
  if (variableRows && variableSourcesKey.current !== sourcesKey) {
    sources = await loadVariableSources(organizationId, referenceIds, signal).catch((err) => {
      if (!signal?.aborted) {
        console.error("Error loading global and collection variables:", err);
      }
      return undefined;
    });
  }
  if (!isCurrent()) {
    return;
  }

  if (workspace.vcs) {
    setVCSProvider(workspace.vcs.vcsType);
  }

  const byKey = (a: { key?: string }, b: { key?: string }) =>
    (a.key ?? "").localeCompare(b.key ?? "", undefined, { sensitivity: "base" });

  if (variableRows) {
    setVariables(variableRows.filter((variable) => variable.category != "ENV").sort(byKey));
    setEnvVariables(variableRows.filter((variable) => variable.category == "ENV").sort(byKey));
  }
  if (jobs) {
    setJobs(jobs);
  }
  setHistory(history);
  if (schedule) {
    setSchedule(schedule);
  }
  if (sources) {
    const isEnv = (variable: { category: string }) => variable.category === "ENV";
    setCollectionVariables(sources.collectionVariables.filter((v) => !isEnv(v)).sort(byKey));
    setCollectionEnvVariables(sources.collectionVariables.filter(isEnv).sort(byKey));
    setGlobalVariables(sources.globalVariables.filter((v) => !isEnv(v)).sort(byKey));
    setGlobalEnvVariables(sources.globalVariables.filter(isEnv).sort(byKey));
    variableSourcesKey.current = sourcesKey;
  }

  // set state data
  const lastState = [...history].sort(
    (a: WorkspaceHistoryRow, b: WorkspaceHistoryRow) => parseInt(b.jobReference) - parseInt(a.jobReference)
  )[0];
  // reload state only if there is a new version

  if (currentStateId.current !== lastState?.id) {
    const isCurrentState = () => currentStateId.current === lastState?.id;
    manageState.then((canManageState) => {
      if (isCurrentState()) {
        loadState(
          lastState,
          axiosInstance,
          setOutputs,
          setResources,
          workspace.id,
          organizationId,
          setContextState,
          canManageState,
          isCurrentState
        );
      }
    });
  }
  currentStateId.current = lastState?.id;
}

/** Loads the outputs and resources preview of a workspace's current state, falling back to the raw tfstate. */
export function loadState(
  state: Pick<WorkspaceHistoryRow, "output"> | undefined,
  _axiosInstance: Pick<AxiosInstance, "get">,
  setOutputs: (val: StateOutputVariableWithName[]) => void,
  setResources: (val: Resource[]) => void,
  workspaceId: string,
  organizationId: string | undefined,
  setContextState: (val: object) => void,
  manageState: boolean,
  isCurrent: () => boolean = () => true
) {
  if (!state || !manageState) {
    return;
  }

  // These two reads go straight to object storage (the current state's outputs/resources
  // preview). A transient storage outage must stay local to this preview widget, never trip
  // the application-wide backend-error screen - same reasoning as archived step logs in
  // fetchStepLog.ts. Routed through axiosAuxiliary instead of the caller's axiosInstance.
  axiosAuxiliary
    .get<unknown>(state.output, { auxClass: "workspace-state-preview" })
    .then((resp) => {
      if (!isCurrent()) {
        return;
      }
      const result = parseState(resp.data);
      setContextState(isRecord(resp.data) ? resp.data : {});
      if (result.outputs.length < 1 && result.resources.length < 1 && organizationId) {
        axiosAuxiliary
          .get<unknown>(
            `${apiUrl("")}/tfstate/v1/organization/${organizationId}/workspace/${workspaceId}/state/terraform.tfstate`,
            { auxClass: "workspace-state-preview" }
          )
          .then((currentStateData) => {
            if (!isCurrent()) {
              return;
            }
            const currentState = currentStateData.data;
            setContextState(isRecord(currentState) ? currentState : {});
            const oldResult = parseOldState(currentState);

            setResources(oldResult.resources);
            setOutputs(oldResult.outputs);
          })
          .catch(function (error: Error) {
            console.error(error);
          });
      } else {
        setResources(result.resources);
        setOutputs(result.outputs);
      }
    })
    .catch((err) => {
      console.error("Failed to load state data:", err);
    });
}

export function isValidUrl(source: string): boolean {
  try {
    new URL(source);
    return true;
  } catch {
    return false;
  }
}

export function fixSshURL(source: string) {
  if (source.startsWith("git@")) {
    return source.replace(":", "/").replace("git@", "https://");
  } else {
    return source;
  }
}
