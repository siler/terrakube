import { JobStatus } from "../../../domain/generated/apiResources";

export function getWorkspaceStatusText(status?: string | null): string | undefined {
  switch (status) {
    case JobStatus.completed:
      return "Completed";
    case JobStatus.noChanges:
      return "No changes";
    case JobStatus.running:
      return "Running";
    case JobStatus.queue:
      return "Queued";
    case JobStatus.pending:
      return "Pending";
    case JobStatus.waitingApproval:
      return "Waiting approval";
    case JobStatus.notExecuted:
      return "Not executed";
    case JobStatus.NeverExecuted:
      return "Never executed";
    case JobStatus.rejected:
      return "Discarded";
    case JobStatus.cancelled:
      return "Cancelled";
    case JobStatus.failed:
      return "Failed";
    case JobStatus.approved:
      return "Approved";
    case JobStatus.unknown:
      return "Unknown";
    default:
      return status ?? undefined;
  }
}
