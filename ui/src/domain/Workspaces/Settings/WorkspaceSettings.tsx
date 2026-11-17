import { WorkspaceGeneral } from "./General";
import { WorkspacePolicies } from "./Policies";
import { WorkspaceLocking } from "./Locking";
import { WorkspaceSSHKey } from "./SSHKey";
import { WorkspaceWebhook } from "./Webhook";
import { WorkspaceNotifications } from "./Notifications";
import { WorkspaceAdvanced } from "./Advanced";
import { WorkspaceStateShared } from "./StateShared";
import { WorkspaceTeamAccess } from "./TeamAccess";
import type { VcsTypeOrUnknown } from "../../types";
import type { OrgTemplateRow, WorkspacePageRow } from "../workspaceQuery";

type Props = {
  organizationId: string;
  workspace: WorkspacePageRow;
  orgTemplates: OrgTemplateRow[];
  manageWorkspace: boolean;
  planJob?: boolean;
  vcsProvider?: VcsTypeOrUnknown;
  onWorkspaceUpdate?: () => void;
  activeSection: string;
};

export const WorkspaceSettings = ({
  organizationId,
  workspace,
  orgTemplates,
  manageWorkspace,
  planJob = false,
  vcsProvider,
  onWorkspaceUpdate,
  activeSection,
}: Props) => {
  const handleWorkspaceUpdate = () => {
    if (onWorkspaceUpdate) {
      onWorkspaceUpdate();
    }
  };

  switch (activeSection) {
    case "policies":
      return (
        <WorkspacePolicies
          workspace={workspace}
          manageWorkspace={manageWorkspace}
          planJob={planJob}
          onWorkspaceUpdate={handleWorkspaceUpdate}
        />
      );
    case "locking":
      return (
        <WorkspaceLocking
          organizationId={organizationId}
          workspace={workspace}
          manageWorkspace={manageWorkspace}
          onWorkspaceUpdate={handleWorkspaceUpdate}
        />
      );
    case "sshkey":
      return (
        <WorkspaceSSHKey
          organizationId={organizationId}
          workspace={workspace}
          manageWorkspace={manageWorkspace}
          onWorkspaceUpdate={handleWorkspaceUpdate}
        />
      );
    case "webhook":
      return (
        <WorkspaceWebhook
          organizationId={organizationId}
          workspace={workspace}
          vcsProvider={vcsProvider}
          orgTemplates={orgTemplates}
          manageWorkspace={manageWorkspace}
          onWorkspaceUpdate={handleWorkspaceUpdate}
        />
      );
    case "notifications":
      return (
        <WorkspaceNotifications
          organizationId={organizationId}
          workspace={workspace}
          manageWorkspace={manageWorkspace}
        />
      );
    case "advanced":
      return (
        <WorkspaceAdvanced organizationId={organizationId} workspace={workspace} manageWorkspace={manageWorkspace} />
      );
    case "state-shared":
      return (
        <WorkspaceStateShared
          organizationId={organizationId}
          workspace={workspace}
          manageWorkspace={manageWorkspace}
          onWorkspaceUpdate={handleWorkspaceUpdate}
        />
      );
    case "team-access":
      return (
        <WorkspaceTeamAccess organizationId={organizationId} workspace={workspace} manageWorkspace={manageWorkspace} />
      );
    case "general":
    default:
      return (
        <WorkspaceGeneral
          organizationId={organizationId}
          workspaceData={workspace}
          orgTemplates={orgTemplates}
          manageWorkspace={manageWorkspace}
          onWorkspaceUpdate={handleWorkspaceUpdate}
        />
      );
  }
};
