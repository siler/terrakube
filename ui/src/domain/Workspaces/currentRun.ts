import { JobStatus } from "../generated/apiResources";
import type { WorkspaceJobRow } from "./workspaceDataUtils";

// A run in one of these statuses still holds its workspace's queue, so newer runs wait behind it.
const ACTIVE_JOB_STATUSES: string[] = [
  JobStatus.waitingApproval,
  JobStatus.approved,
  JobStatus.running,
  JobStatus.queue,
  JobStatus.pending,
];

export type CurrentRun = {
  job: WorkspaceJobRow;
  /** True when the run is still active or waiting, false when it is just the newest finished run. */
  active: boolean;
  /** Runs created after the shown one that are waiting in the queue for it (queued or pending only). */
  queuedBehind: WorkspaceJobRow[];
};

const byId = (a: WorkspaceJobRow, b: WorkspaceJobRow) => Number(a.id) - Number(b.id);

/**
 * Picks the run the workspace overview card shows: the oldest run that is not finished, because that
 * is the run holding the queue and the one that decides what happens next. When every run is finished
 * it is the newest run. A finished plan-only run therefore never replaces a run waiting for approval.
 */
export function selectCurrentRun(jobs: WorkspaceJobRow[]): CurrentRun | undefined {
  if (jobs.length === 0) return undefined;
  const sorted = [...jobs].sort(byId);
  const activeJobs = sorted.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status));
  if (activeJobs.length === 0) {
    return { job: sorted[sorted.length - 1], active: false, queuedBehind: [] };
  }
  const [job, ...rest] = activeJobs;
  // A newer run that is itself running or waiting for approval is not queued behind this one.
  const queuedBehind = rest.filter((other) => other.status === JobStatus.queue || other.status === JobStatus.pending);
  return { job, active: true, queuedBehind };
}
