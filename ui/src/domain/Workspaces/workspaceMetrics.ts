import dayjs from "dayjs";
import { formatDuration } from "@/modules/utils/dates";
import { JobStatus } from "@/domain/generated/apiResources";
import type { WorkspaceJobRow } from "./workspaceDataUtils";

// Statuses after which a run's updatedDate marks its end.
export const FINISHED_JOB_STATUSES: string[] = [
  JobStatus.completed,
  JobStatus.noChanges,
  JobStatus.notExecuted,
  JobStatus.rejected,
  JobStatus.cancelled,
  JobStatus.failed,
];

const SUCCESSFUL_JOB_STATUSES: string[] = [JobStatus.completed, JobStatus.noChanges];
// Rejected, cancelled and not-executed runs include time spent waiting for approval, not running.
const TIMED_JOB_STATUSES: string[] = [...SUCCESSFUL_JOB_STATUSES, JobStatus.failed];

export type WorkspaceMetrics = {
  runCount: number;
  averageDuration: string | null;
  failedRuns: number;
  lastSuccessfulRun: string | null;
};

// Metrics over the runs already loaded on the workspace page; null when none of them has finished.
export function computeWorkspaceMetrics(jobs: WorkspaceJobRow[]): WorkspaceMetrics | null {
  const finished = jobs.filter((job) => FINISHED_JOB_STATUSES.includes(job.status));
  if (finished.length === 0) return null;

  const durations = finished
    .filter((job) => TIMED_JOB_STATUSES.includes(job.status))
    .map((job) => {
      const start = dayjs(job.createdDate ?? "");
      const end = dayjs(job.updatedDate ?? "");
      return start.isValid() && end.isValid() && !end.isBefore(start) ? end.valueOf() - start.valueOf() : null;
    })
    .filter((ms): ms is number => ms !== null);
  const averageMs = durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null;

  const lastSuccessfulRun =
    finished
      .flatMap((job) => (SUCCESSFUL_JOB_STATUSES.includes(job.status) && job.updatedDate ? [job.updatedDate] : []))
      .sort((a, b) => dayjs(b).valueOf() - dayjs(a).valueOf())[0] ?? null;

  return {
    runCount: jobs.length,
    averageDuration:
      averageMs === null ? null : formatDuration(new Date(0).toISOString(), new Date(averageMs).toISOString()),
    failedRuns: finished.filter((job) => job.status === JobStatus.failed).length,
    lastSuccessfulRun,
  };
}
