import { Form, Select, Spin, message } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../../config/axiosConfig";
import { api, fields } from "../../generated/apiPaths";
import type { AtomicOperationsBody } from "../../api/writeBodies";
import type { Row } from "../../api/fieldSelection";
import type { WorkspacePageRow } from "../workspaceQuery";
import { atomicHeader } from "../Workspaces";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";

type Props = {
  organizationId: string;
  workspace: WorkspacePageRow;
  manageWorkspace: boolean;
  onWorkspaceUpdate?: () => void;
};

const SSH_FIELDS = fields.ssh("name");

/** An organization SSH key as the key picker lists it. */
type SshKeyRow = Row<typeof SSH_FIELDS>;

export const WorkspaceSSHKey = ({ organizationId, workspace, manageWorkspace, onWorkspaceUpdate }: Props) => {
  const id = workspace.id;
  const [sshKeys, setSSHKeys] = useState<SshKeyRow[]>([]);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    api.organization(organizationId).ssh().select(SSH_FIELDS).then(setSSHKeys);
  }, [organizationId]);

  const onFinish = (values: { moduleSshKey?: string }) => {
    setWaiting(true);
    const body: AtomicOperationsBody<"workspace"> = {
      "atomic:operations": [
        {
          op: "update",
          href: `/organization/${organizationId}/workspace/${id}`,
          data: {
            type: "workspace",
            id: id,
            attributes: {
              moduleSshKey: values.moduleSshKey || "",
            },
          },
        },
      ],
    };

    axiosInstance
      .post("/operations", body, atomicHeader)
      .then((response) => {
        if (response.status === 200) {
          message.success("SSH key updated");
          onWorkspaceUpdate?.();
        } else {
          message.error(`Could not update the SSH key (HTTP ${response.status})`);
        }
      })
      .catch((error) => message.error(`Could not update the SSH key: ${getErrorMessage(error)}`))
      .finally(() => setWaiting(false));
  };

  return (
    <div className="generalSettings">
      <SettingsPageHeader
        docUrl="https://docs.terrakube.io/user-guide/vcs-providers/ssh"
        title="SSH key"
        description="Select the SSH key this workspace uses to download modules from private Git repositories."
        divider={false}
      />
      <Spin spinning={waiting}>
        <SettingsForm
          onFinish={onFinish}
          saveLabel="Update SSH key"
          saveDisabled={!manageWorkspace}
          initialValues={{ moduleSshKey: workspace.moduleSshKey || "" }}
        >
          <Form.Item
            name="moduleSshKey"
            label="SSH key"
            extra={
              <>
                It is not used to clone the workspace repository or for provisioner connections.{" "}
                <Link to={`/organizations/${organizationId}/settings/ssh`}>Manage organization SSH keys</Link>
              </>
            }
          >
            <Select
              disabled={!manageWorkspace}
              options={[
                { value: "", label: "(No SSH key)" },
                ...sshKeys.map((sshKey) => ({ value: sshKey.id, label: sshKey.name })),
              ]}
            />
          </Form.Item>
        </SettingsForm>
      </Spin>
    </div>
  );
};
