import {
  CheckCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { JobStatus } from "../../../domain/generated/apiResources";

export function getWorkspaceStatusIcon(status?: string | null) {
  switch (status) {
    case JobStatus.completed:
    case JobStatus.noChanges:
      return <CheckCircleOutlined />;
    case JobStatus.running:
      return <SyncOutlined spin />;
    case JobStatus.waitingApproval:
      return <ExclamationCircleOutlined />;
    case JobStatus.notExecuted:
      return <CheckCircleOutlined />;
    case JobStatus.NeverExecuted:
      return <InfoCircleOutlined />;
    case JobStatus.rejected:
      return <CloseCircleOutlined />;
    case JobStatus.cancelled:
    case JobStatus.failed:
      return <StopOutlined />;
    case JobStatus.queue:
    case JobStatus.pending:
      return <ClockCircleOutlined />;
    case JobStatus.approved:
      return <CheckCircleOutlined />;
    case JobStatus.unknown:
      return <ExclamationCircleOutlined />;
    default:
      return <ClockCircleOutlined />;
  }
}
