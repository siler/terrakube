import { JobStatus } from "../../../domain/generated/apiResources";

export const statusColors: Record<string, string> = {
  [JobStatus.completed]: "var(--tk-status-success)",
  [JobStatus.running]: "var(--tk-status-info)",
  [JobStatus.queue]: "#6e6e6e",
  [JobStatus.pending]: "#6e6e6e",
  [JobStatus.waitingApproval]: "var(--tk-status-warning)",
  [JobStatus.notExecuted]: "var(--tk-status-warning)",
  [JobStatus.rejected]: "var(--tk-status-error)",
  [JobStatus.failed]: "var(--tk-status-error)",
  [JobStatus.cancelled]: "var(--tk-status-error)",
  [JobStatus.noChanges]: "#c026d3",
  [JobStatus.approved]: "var(--tk-status-success)",
  [JobStatus.unknown]: "#6e6e6e",
};
