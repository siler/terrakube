import { DeleteOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, Tag, Tooltip, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import axiosInstance, { getErrorMessage, isPermissionError } from "../../config/axiosConfig";
import { isOneOf } from "@/modules/utils/typeGuards";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import type { CreateBody } from "../api/writeBodies";
import { SshType } from "../generated/apiResources";
import "./Settings.css";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Loading } from "@/components/feedback/Loading";
import { EmptyState } from "@/components/feedback/EmptyState";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import SshKeyFormModal, { AddSshKeyFormValues } from "./components/SshKeyFormModal";
import ResourceCard from "./components/ResourceCard";

// The list never shows the private key, so it is not requested.
const SSH_KEY_FIELDS = fields.ssh("name", "description", "sshType");

/** An organization SSH key as the list card shows it. */
type ListedSshKey = Row<typeof SSH_KEY_FIELDS>;

// The linkage alone answers "which resources use this key"; the names would add nothing to the count.
const WORKSPACE_SSH_IDS = fields.workspace({ ssh: ids });
const MODULE_SSH_IDS = fields.module({ ssh: ids });

const plural = (count: number, noun: string) => (count > 0 ? `${count} ${noun}${count === 1 ? "" : "s"}` : "");

type Props = {
  managePermission?: boolean;
};

export const SSHKeysSettings = ({ managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  const [sshKeys, setSSHKeys] = useState<ListedSshKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ListedSshKey | null>(null);
  const [form] = Form.useForm<AddSshKeyFormValues>();

  const onNew = () => {
    form.resetFields();
    setVisible(true);
  };

  const onDelete = (key: ListedSshKey) => {
    Promise.all([
      api
        .organization(orgid)
        .workspace()
        .select(WORKSPACE_SSH_IDS)
        .where((workspace) => workspace.ssh.id.eq(key.id)),
      api
        .organization(orgid)
        .module()
        .select(MODULE_SSH_IDS)
        .where((module) => module.ssh.id.eq(key.id)),
    ])
      .then(([workspaces, modules]) => {
        const usage = [plural(workspaces.length, "workspace"), plural(modules.length, "module")].filter(Boolean);
        if (usage.length > 0) {
          message.error(
            `${key.name} is used by ${new Intl.ListFormat("en").format(usage)}. Move them to another SSH key first.`
          );
          return;
        }
        return axiosInstance.delete(`organization/${orgid}/ssh/${key.id}`).then(() => {
          message.success(`SSH key ${key.name} deleted`);
          loadSSHKeys();
        });
      })
      .catch((err) => {
        message.error(`Could not delete the SSH key: ${getErrorMessage(err)}`);
      });
  };

  const onCreate = (values: AddSshKeyFormValues) => {
    const sshType = values.sshType;
    // The picker only offers the API's key types, but the shared form types the field as string.
    if (!isOneOf(Object.values(SshType), sshType)) {
      message.error(`Unsupported SSH key type: ${sshType}`);
      return;
    }
    const body: CreateBody<"ssh"> = {
      data: {
        type: "ssh",
        attributes: {
          name: values.name,
          description: values.description,
          sshType,
          privateKey: values.privateKey,
        },
      },
    };

    setSaving(true);
    axiosInstance
      .post(`organization/${orgid}/ssh`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        message.success(`SSH key ${values.name} added`);
        loadSSHKeys();
        setVisible(false);
        form.resetFields();
      })
      .catch((err) => {
        message.error(`Could not add the SSH key: ${getErrorMessage(err)}`);
      })
      .finally(() => setSaving(false));
  };

  const loadSSHKeys = async () => {
    try {
      setSSHKeys(await api.organization(orgid).ssh().select(SSH_KEY_FIELDS));
    } catch (err) {
      if (isPermissionError(err)) {
        setError(getErrorMessage(err));
      } else {
        message.error(`Could not load SSH keys: ${getErrorMessage(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    loadSSHKeys();
  }, [orgid]);

  const renderList = () => {
    if (loading) return <Loading loading description="Loading SSH keys..." />;
    if (sshKeys.length === 0) {
      return (
        <EmptyState simple description="No SSH keys yet. Add one to download modules from private Git repositories.">
          {managePermission && (
            <Button icon={<PlusOutlined />} onClick={onNew}>
              Add an SSH key
            </Button>
          )}
        </EmptyState>
      );
    }
    return (
      <>
        <Typography.Title level={4} className="resource-list-title">
          SSH keys ({sshKeys.length})
        </Typography.Title>
        <div className="resource-list">
          {sshKeys.map((item) => (
            <ResourceCard
              key={item.id}
              icon={<KeyOutlined />}
              name={item.name}
              tags={item.sshType && <Tag className="resource-mono">{item.sshType.toUpperCase()}</Tag>}
              actions={
                <Tooltip title="Delete">
                  <Button
                    icon={<DeleteOutlined />}
                    disabled={!managePermission}
                    aria-label={`Delete SSH key ${item.name}`}
                    onClick={() => setPendingDelete(item)}
                  />
                </Tooltip>
              }
            >
              {item.description && <Typography.Text className="resource-card-meta">{item.description}</Typography.Text>}
            </ResourceCard>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="setting">
      {error ? (
        <AccessDeniedAlert description={error} />
      ) : (
        <>
          <SettingsPageHeader
            docUrl="https://docs.terrakube.io/user-guide/vcs-providers/ssh"
            title="SSH keys"
            description="Workspaces use these keys to download modules from private Git repositories."
            divider={false}
            actions={
              <Button type="primary" onClick={onNew} icon={<PlusOutlined />} disabled={!managePermission}>
                Add an SSH key
              </Button>
            }
          />
          {renderList()}

          <SshKeyFormModal
            open={visible}
            form={form}
            saving={saving}
            onCancel={() => setVisible(false)}
            onSubmit={onCreate}
          />

          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete SSH key"
            message={
              <>
                <strong>{pendingDelete?.name}</strong> can only be deleted when no workspace or module uses it. This
                cannot be undone.
              </>
            }
            confirmValue={pendingDelete?.name ?? ""}
            okText="Delete SSH key"
            onConfirm={() => {
              if (pendingDelete) onDelete(pendingDelete);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        </>
      )}
    </div>
  );
};
