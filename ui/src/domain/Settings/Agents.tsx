import { CloudServerOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, Tooltip, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import axiosInstance, { getErrorMessage, isPermissionError } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import type { CreateBody } from "../api/writeBodies";
import "./Settings.css";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Loading } from "@/components/feedback/Loading";
import { EmptyState } from "@/components/feedback/EmptyState";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import AgentFormModal, { AddAgentFormValues } from "./components/AgentFormModal";
import ResourceCard from "./components/ResourceCard";

const AGENT_FIELDS = fields.agent("name", "description", "url");

/** An agent pool as the list card shows it. */
type AgentRow = Row<typeof AGENT_FIELDS>;

// The linkage alone answers "which workspaces use this pool"; the names would add nothing to the count.
const WORKSPACE_AGENT_IDS = fields.workspace({ agent: ids });

type Props = {
  managePermission?: boolean;
};

export const AgentSettings = ({ managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AgentRow | null>(null);
  const [form] = Form.useForm<AddAgentFormValues>();

  const onNew = () => {
    form.resetFields();
    setVisible(true);
  };

  const onDelete = async (agent: AgentRow) => {
    try {
      const workspaces = await api
        .organization(orgid)
        .workspace()
        .select(WORKSPACE_AGENT_IDS)
        .where((workspace) => workspace.agent.id.eq(agent.id));
      if (workspaces.length > 0) {
        message.error(
          `${agent.name} is used by ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}. Move them to another agent pool first.`
        );
        return;
      }
      await axiosInstance.delete(`organization/${orgid}/agent/${agent.id}`);
      message.success(`Agent pool ${agent.name} deleted`);
      loadAgents();
    } catch (err) {
      message.error(`Could not delete the agent pool: ${getErrorMessage(err)}`);
    }
  };

  const onCreate = (values: AddAgentFormValues) => {
    const body: CreateBody<"agent"> = {
      data: {
        type: "agent",
        attributes: {
          name: values.name,
          description: values.description,
          url: values.url,
        },
      },
    };

    setSaving(true);
    axiosInstance
      .post(`organization/${orgid}/agent`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        message.success(`Agent pool ${values.name} added`);
        loadAgents();
        setVisible(false);
        form.resetFields();
      })
      .catch((err) => {
        message.error(`Could not add the agent pool: ${getErrorMessage(err)}`);
      })
      .finally(() => setSaving(false));
  };

  const loadAgents = async () => {
    try {
      setAgents(await api.organization(orgid).agent().select(AGENT_FIELDS));
    } catch (err) {
      if (isPermissionError(err)) {
        setError(getErrorMessage(err));
      } else {
        message.error(`Could not load agent pools: ${getErrorMessage(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    loadAgents();
  }, [orgid]);

  const renderList = () => {
    if (loading) return <Loading loading description="Loading agent pools..." />;
    if (agents.length === 0) {
      return (
        <EmptyState simple description="No agent pools yet. Jobs run on the default executor.">
          {managePermission && (
            <Button icon={<PlusOutlined />} onClick={onNew}>
              Add an agent pool
            </Button>
          )}
        </EmptyState>
      );
    }
    return (
      <>
        <Typography.Title level={4} className="resource-list-title">
          Agent pools ({agents.length})
        </Typography.Title>
        <div className="resource-list">
          {agents.map((item) => (
            <ResourceCard
              key={item.id}
              icon={<CloudServerOutlined />}
              name={item.name}
              actions={
                <Tooltip title="Delete">
                  <Button
                    icon={<DeleteOutlined />}
                    disabled={!managePermission}
                    aria-label={`Delete agent pool ${item.name}`}
                    onClick={() => setPendingDelete(item)}
                  />
                </Tooltip>
              }
            >
              {item.description && <Typography.Text className="resource-card-meta">{item.description}</Typography.Text>}
              {item.url && (
                <Typography.Text className="resource-mono resource-card-meta" copyable>
                  {item.url}
                </Typography.Text>
              )}
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
            docUrl="https://docs.terrakube.io/getting-started/deployment/self-hosted-agents"
            title="Agents"
            description="Agent pools run jobs for the workspaces assigned to them."
            divider={false}
            actions={
              <Button type="primary" onClick={onNew} icon={<PlusOutlined />} disabled={!managePermission}>
                Add an agent pool
              </Button>
            }
          />
          {renderList()}

          <AgentFormModal
            open={visible}
            form={form}
            saving={saving}
            onCancel={() => setVisible(false)}
            onSubmit={onCreate}
          />

          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete agent pool"
            message={
              <>
                <strong>{pendingDelete?.name}</strong> can only be deleted when no workspace is assigned to it. The
                agent itself keeps running until you shut it down. This cannot be undone.
              </>
            }
            okText="Delete agent pool"
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
