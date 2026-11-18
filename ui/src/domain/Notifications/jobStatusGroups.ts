import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import type { JobStatus } from "@/domain/generated/graphql/graphql";

type JobStatusGroup = {
  key: string;
  label: string;
  color: string;
  icon: typeof CheckCircleOutlined;
  statuses: { value: JobStatus; label: string; hint?: string }[];
};

export const JOB_STATUS_GROUPS: JobStatusGroup[] = [
  {
    key: "needs-attention",
    label: "Needs attention",
    color: "warning",
    icon: ClockCircleOutlined,
    statuses: [
      {
        value: "waitingApproval",
        label: "Waiting for approval",
        hint: "Includes manual run approvals and soft-mandatory policy reviews",
      },
    ],
  },
  {
    key: "completed",
    label: "Completed",
    color: "success",
    icon: CheckCircleOutlined,
    statuses: [
      { value: "completed", label: "Completed" },
      { value: "noChanges", label: "Completed (no changes)" },
    ],
  },
  {
    key: "errored",
    label: "Errored",
    color: "error",
    icon: ExclamationCircleOutlined,
    statuses: [
      {
        value: "failed",
        label: "Failed",
        hint: "Includes run errors and hard-mandatory policy violations",
      },
      { value: "rejected", label: "Rejected" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  {
    key: "in-progress",
    label: "In progress",
    color: "processing",
    icon: SyncOutlined,
    statuses: [
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "queue", label: "Queued" },
      { value: "running", label: "Running" },
    ],
  },
  {
    key: "other",
    label: "Other",
    color: "default",
    icon: QuestionCircleOutlined,
    statuses: [
      { value: "notExecuted", label: "Not executed" },
      { value: "unknown", label: "Unknown" },
      { value: "NeverExecuted", label: "Never executed" },
    ],
  },
];
