import {
  BarsOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { ReactElement } from "react";
import { JobStatus } from "@/domain/generated/apiResources";
import { WorkspaceStatusFilter } from "./workspaceFilter";

export type WorkspaceStatusPaletteEntry = {
  value: string;
  label: string;
  icon: ReactElement;
  color?: string;
};

/** Shared icon+color mapping for job statuses, used by the workspace list's status
 * pills and by any other UI that needs to summarize workspace status counts. */
export const WORKSPACE_STATUS_PALETTE: WorkspaceStatusPaletteEntry[] = [
  { value: WorkspaceStatusFilter.All, label: "All", icon: <BarsOutlined /> },
  {
    value: JobStatus.waitingApproval,
    label: "Waiting approval",
    icon: <ExclamationCircleOutlined />,
    color: "var(--tk-status-warning)",
  },
  { value: JobStatus.failed, label: "Failed", icon: <StopOutlined />, color: "var(--tk-status-error)" },
  { value: JobStatus.pending, label: "Pending", icon: <ClockCircleOutlined />, color: "#8c8c8c" },
  { value: JobStatus.queue, label: "Queued", icon: <ClockCircleOutlined />, color: "#8c8c8c" },
  { value: JobStatus.running, label: "Running", icon: <SyncOutlined />, color: "var(--tk-status-info)" },
  { value: JobStatus.completed, label: "Completed", icon: <CheckCircleOutlined />, color: "var(--tk-status-success)" },
  { value: WorkspaceStatusFilter.NeverExecuted, label: "Never executed", icon: <InfoCircleOutlined /> },
];
