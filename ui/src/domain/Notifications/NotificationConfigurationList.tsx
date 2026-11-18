import { BellOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Avatar, Button, List, message, Tag, Typography } from "antd";
import "./Notifications.css";
import { Loading } from "@/components/feedback/Loading";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance, { getErrorMessage, isPermissionError } from "@/config/axiosConfig";
import { graphql } from "@/domain/generated/graphql";
import type { NotificationConfigurationsQuery } from "@/domain/generated/graphql/graphql";
import { ConnectionNode, connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import { channelMetaFor } from "./channelMeta";
import { EditNotificationConfiguration } from "./EditNotificationConfiguration";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { EmptyState } from "@/components/feedback/EmptyState";

// Every relationship is a connection in Elide's GraphQL, even a to-one like workspace.
const NotificationConfigurations = graphql(`
  query NotificationConfigurations($orgIds: [String]) {
    organization(ids: $orgIds) {
      edges {
        node {
          notificationConfiguration {
            edges {
              node {
                id
                name
                description
                channelType
                active
                workspace {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

type NotificationConfigurationNode = ConnectionNode<
  ConnectionNode<NotificationConfigurationsQuery["organization"]>["notificationConfiguration"]
>;

const toConfiguration = (node: NotificationConfigurationNode) => {
  const workspaceId = connectionNodes(node.workspace)[0]?.id;
  return {
    id: node.id ?? "",
    name: node.name ?? "",
    description: node.description,
    channelType: node.channelType ?? null,
    active: node.active ?? false,
    // A lazily-fetched workspace can serialize its id as the string "null"; that is no workspace too.
    workspaceId: workspaceId && workspaceId !== "null" ? workspaceId : null,
  };
};

type NotificationConfiguration = ReturnType<typeof toConfiguration>;

type Props = {
  orgId: string;
  workspaceId?: string;
  basePath?: string;
  editorMode?: "new" | "edit";
  editorId?: string;
  managePermission?: boolean;
};

export const NotificationConfigurationList = ({
  orgId,
  workspaceId,
  basePath,
  editorMode,
  editorId,
  managePermission = true,
}: Props) => {
  const [configurations, setConfigurations] = useState<NotificationConfiguration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const [localMode, setLocalMode] = useState<"list" | "create" | "edit">("list");
  const [localEditingId, setLocalEditingId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<NotificationConfiguration | null>(null);
  const routed = basePath != null;
  const routedMode = editorMode === "new" ? "create" : (editorMode ?? "list");
  const mode: "list" | "create" | "edit" = routed ? routedMode : localMode;
  const editingId = routed ? editorId : localEditingId;
  const openCreate = () => (routed ? navigate(`${basePath}/new`) : setLocalMode("create"));
  const openEdit = (id: string) => {
    if (routed) {
      navigate(`${basePath}/edit/${id}`);
    } else {
      setLocalEditingId(id);
      setLocalMode("edit");
    }
  };
  const closeEditor = () => {
    if (basePath != null) {
      navigate(basePath);
    } else {
      setLocalMode("list");
      setLocalEditingId(undefined);
    }
  };

  const load = () => {
    setLoading(true);
    graphqlRequest(NotificationConfigurations, { orgIds: [orgId] })
      .then((data) => {
        const all = connectionNodes(connectionNodes(data.organization)[0]?.notificationConfiguration).map(
          toConfiguration
        );
        setConfigurations(all.filter((c) => c.workspaceId === null || c.workspaceId === workspaceId));
        setLoading(false);
      })
      .catch((err) => {
        if (isPermissionError(err)) {
          setError(getErrorMessage(err));
        } else {
          message.error("Failed to load notification configurations");
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [orgId, workspaceId]);

  // On the org-level page (no workspaceId), "configurations" is already org-scoped only (see
  // the filter in load()), so the primary list there is simply all of them - there's no
  // "inherited" concept without a workspace to inherit into. Purely additive, no overrides: a
  // workspace gets both its own configs and every organization-wide default, together.
  const primaryConfigs = workspaceId ? configurations.filter((c) => c.workspaceId !== null) : configurations;
  const inheritedConfigs = workspaceId ? configurations.filter((c) => c.workspaceId === null) : [];

  const onDelete = (id: string) => {
    axiosInstance
      .delete(`notification_configuration/${id}`, { headers: { "Content-Type": undefined } })
      .then(() => {
        message.success("Notification deleted");
        load();
      })
      .catch((err) => message.error(getErrorMessage(err) || "Could not delete the notification"));
  };

  if (mode !== "list") {
    return (
      <EditNotificationConfiguration
        orgId={orgId}
        workspaceId={workspaceId}
        mode={mode}
        configId={editingId}
        managePermission={managePermission}
        onDone={() => {
          closeEditor();
          load();
        }}
      />
    );
  }

  const renderItem = (item: NotificationConfiguration, inherited: boolean) => {
    const meta = channelMetaFor(item.channelType);
    const ChannelIcon = meta?.icon ?? BellOutlined;
    const name = item.name;
    return (
      <List.Item
        actions={
          inherited
            ? undefined
            : [
                <Button
                  key="edit"
                  icon={<EditOutlined />}
                  disabled={!managePermission}
                  aria-label={`Edit ${name}`}
                  onClick={() => openEdit(item.id)}
                >
                  Edit
                </Button>,
                <Button
                  key="delete"
                  icon={<DeleteOutlined />}
                  disabled={!managePermission}
                  aria-label={`Delete ${name}`}
                  onClick={() => setPendingDelete(item)}
                >
                  Delete
                </Button>,
              ]
        }
      >
        <List.Item.Meta
          avatar={<Avatar shape="square" className="notification-channel-avatar" icon={<ChannelIcon />} />}
          title={name}
          description={
            <>
              <div>
                <Tag>{meta?.label ?? item.channelType ?? "Unknown channel"}</Tag>
                {!item.active && <Tag color="warning">Disabled</Tag>}
              </div>
              {item.description && (
                <Typography.Text type="secondary" className="notification-meta-text">
                  {item.description}
                </Typography.Text>
              )}
            </>
          }
        />
      </List.Item>
    );
  };

  const addButton = (primary: boolean) => (
    <Button
      type={primary ? "primary" : "default"}
      icon={<PlusOutlined />}
      disabled={!managePermission}
      onClick={openCreate}
    >
      Add notification
    </Button>
  );

  return (
    <div>
      {error ? (
        <AccessDeniedAlert description={error} />
      ) : (
        <>
          <SettingsPageHeader
            title="Notifications"
            description={
              workspaceId
                ? "Messages sent when this workspace's runs change state."
                : "Messages sent when runs in any workspace of this organization change state."
            }
            divider={false}
            actions={addButton(true)}
          />
          <Loading loading={loading} description="Loading notifications...">
            {workspaceId ? (
              <>
                <section>
                  <Typography.Title level={4}>This workspace ({primaryConfigs.length})</Typography.Title>
                  {primaryConfigs.length === 0 ? (
                    <Typography.Paragraph type="secondary">
                      No notifications set for this workspace only.
                    </Typography.Paragraph>
                  ) : (
                    <List
                      itemLayout="horizontal"
                      dataSource={primaryConfigs}
                      renderItem={(item) => renderItem(item, false)}
                    />
                  )}
                </section>
                <section className="notification-inherited-section">
                  <Typography.Title level={4}>Organization-wide ({inheritedConfigs.length})</Typography.Title>
                  {inheritedConfigs.length === 0 ? (
                    <Typography.Paragraph type="secondary">No organization-wide notifications.</Typography.Paragraph>
                  ) : (
                    <>
                      <Typography.Paragraph type="secondary">
                        These also apply here. Change them in the organization&apos;s notification settings.
                      </Typography.Paragraph>
                      <List
                        itemLayout="horizontal"
                        dataSource={inheritedConfigs}
                        renderItem={(item) => renderItem(item, true)}
                      />
                    </>
                  )}
                </section>
              </>
            ) : primaryConfigs.length === 0 ? (
              <EmptyState simple description="No notifications yet. Add one to get a message when runs change state.">
                {managePermission && addButton(false)}
              </EmptyState>
            ) : (
              <section>
                <Typography.Title level={4}>Organization-wide ({primaryConfigs.length})</Typography.Title>
                <List
                  itemLayout="horizontal"
                  dataSource={primaryConfigs}
                  renderItem={(item) => renderItem(item, false)}
                />
              </section>
            )}
          </Loading>

          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete notification"
            message={`Runs stop sending messages for ${pendingDelete?.name}. This cannot be undone.`}
            okText="Delete notification"
            onConfirm={() => {
              if (pendingDelete) {
                onDelete(pendingDelete.id);
              }
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        </>
      )}
    </div>
  );
};
