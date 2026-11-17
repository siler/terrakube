import { useRequiredParam } from "@/hooks/useRequiredParam";
import { NotificationConfigurationList } from "@/domain/Notifications/NotificationConfigurationList";

type Props = {
  editorMode?: "new" | "edit";
  editorId?: string;
  managePermission?: boolean;
};

export const OrgNotifications = ({ editorMode, editorId, managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  return (
    <NotificationConfigurationList
      orgId={orgid}
      basePath={`/organizations/${orgid}/settings/notifications`}
      editorMode={editorMode}
      editorId={editorId}
      managePermission={managePermission}
    />
  );
};
