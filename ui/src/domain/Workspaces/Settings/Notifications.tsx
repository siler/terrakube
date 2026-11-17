import { NotificationConfigurationList } from "@/domain/Notifications/NotificationConfigurationList";
import { NotificationDeliveryHistory } from "@/domain/Notifications/NotificationDeliveryHistory";
import type { WorkspacePageRow } from "../workspaceQuery";

type Props = {
  organizationId: string;
  workspace: WorkspacePageRow;
  manageWorkspace: boolean;
};

export const WorkspaceNotifications = ({ organizationId, workspace, manageWorkspace }: Props) => {
  return (
    <>
      <NotificationConfigurationList
        orgId={organizationId}
        workspaceId={workspace.id}
        managePermission={manageWorkspace}
      />
      <NotificationDeliveryHistory workspaceId={workspace.id} />
    </>
  );
};
