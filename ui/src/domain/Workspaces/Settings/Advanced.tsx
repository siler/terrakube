import { message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../../config/axiosConfig";
import type { RelationshipBody, UpdateBody } from "@/domain/api/writeBodies";
import type { WorkspacePageRow } from "../workspaceQuery";
import { genericHeader } from "../Workspaces";
import { DangerZone } from "@/components/settings/DangerZone";

type Props = {
  organizationId: string;
  workspace: WorkspacePageRow;
  manageWorkspace: boolean;
};

export const WorkspaceAdvanced = ({ organizationId, workspace, manageWorkspace }: Props) => {
  const navigate = useNavigate();
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  function generateRandomString(length: number) {
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
  }
  const onDelete = (workspace: WorkspacePageRow) => {
    const id = workspace.id;
    const randomLetters = generateRandomString(4);
    const deletedName = `${workspace.name.substring(0, 21)}_DEL_${randomLetters}`;

    const vcsLinkage: RelationshipBody<"workspace", "vcs"> = { data: null };

    const body: UpdateBody<"workspace"> = {
      data: {
        type: "workspace",
        id: id,
        attributes: {
          name: deletedName,
          deleted: true,
        },
      },
    };
    axiosInstance
      .patch(`/organization/${organizationId}/workspace/${id}/relationships/vcs`, vcsLinkage, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() =>
        axiosInstance.patch(`organization/${organizationId}/workspace/${id}`, body, genericHeader).then((response) => {
          if (response.status === 204) {
            message.success("Workspace deleted successfully");
            navigate(`/organizations/${organizationId}/workspaces`);
          } else {
            message.error("Workspace deletion failed");
          }
        })
      )
      .catch((error) => {
        console.error("error deleting workspace:", error);
        message.error(getErrorMessage(error));
      });
  };

  return (
    <div className="generalSettings">
      <DangerZone
        titleLevel={3}
        actionName="Delete this workspace"
        description={
          <>
            Removes the workspace from Terrakube: active runs are cancelled, its schedules stop, its VCS connection is
            removed, and its state files and run outputs are deleted from storage. This cannot be undone. It does not
            destroy any infrastructure: resources this workspace manages keep running, and without the state Terrakube
            can no longer manage them. To remove them, start a destroy job from the{" "}
            <Link to={`/organizations/${organizationId}/workspaces/${workspace.id}`}>workspace overview</Link> first.
          </>
        }
        disabled={!manageWorkspace}
        confirmValue={workspace.name}
        confirmMessage={`Workspace "${workspace.name}" will be removed from Terrakube: active runs are cancelled and its state files and run outputs are deleted. This cannot be undone. Resources it manages are not destroyed.`}
        onConfirm={() => onDelete(workspace)}
      />
    </div>
  );
};
