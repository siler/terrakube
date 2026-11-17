import { apiUrl } from "@/config/apiUrls";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  SendOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useEffect, useState } from "react";
import axiosInstance, { getErrorMessage } from "@/config/axiosConfig";
import { api, fields } from "@/domain/generated/apiPaths";
import type { CreateBody, FormValues, RelationshipBody, UpdateBody, WriteAttributes } from "@/domain/api/writeBodies";
import type { Row } from "@/domain/api/fieldSelection";
import { apiPost } from "@/modules/api/apiWrapper";
import { JobStatus } from "@/domain/generated/apiResources";
import { createdResourceId } from "@/domain/api/parseDocument";
import { ChannelPicker } from "./ChannelPicker";
import { CHANNEL_META } from "./channelMeta";
import { JOB_STATUS_GROUPS } from "./jobStatusGroups";
import "./Notifications.css";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { RadioChoices } from "@/components/settings/RadioChoices";
import { DangerZone } from "@/components/settings/DangerZone";

type Props = {
  orgId: string;
  workspaceId?: string;
  mode: "create" | "edit";
  configId?: string;
  onDone: () => void;
  managePermission?: boolean;
};

type ConfigurationForm = Pick<
  FormValues<"notification_configuration">,
  "name" | "channelType" | "destinationUrl" | "active" | "messageStyle"
> & {
  description?: FormValues<"notification_configuration">["description"];
  signingSecret?: FormValues<"notification_configuration">["signingSecret"];
};

const JSONAPI_HEADERS = { "Content-Type": "application/vnd.api+json" };

const TEMPLATE_NAME_FIELDS = fields.template("name");
type TemplateRow = Row<typeof TEMPLATE_NAME_FIELDS>;

const TOTAL_STATUS_COUNT = JOB_STATUS_GROUPS.reduce((total, group) => total + group.statuses.length, 0);

export const EditNotificationConfiguration = ({
  orgId,
  workspaceId,
  mode,
  configId,
  onDone,
  managePermission = true,
}: Props) => {
  const [loading, setLoading] = useState(mode === "edit");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [form] = Form.useForm<ConfigurationForm>();
  const [triggerIds, setTriggerIds] = useState<Partial<Record<JobStatus, string>>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<JobStatus[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateRow[]>([]);
  // Empty means "applies to every template" - this only ever narrows which templates a
  // configuration fires for, so an empty selection is the same as no filter at all.
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  // Undefined while an edit-mode fetch is still in flight - the scope banner stays hidden
  // rather than briefly showing the wrong scope. For create mode this is known immediately
  // from whether a workspaceId was passed in at all.
  const [configWorkspaceId, setConfigWorkspaceId] = useState<string | null | undefined>(
    mode === "create" ? (workspaceId ?? null) : undefined
  );
  const channelType = Form.useWatch("channelType", form);
  const destinationUrl = Form.useWatch("destinationUrl", form);
  const name = Form.useWatch("name", form);

  const basePath = workspaceId
    ? `organization/${orgId}/workspace/${workspaceId}/notificationConfiguration`
    : `organization/${orgId}/notificationConfiguration`;

  useEffect(() => {
    void (async () => {
      try {
        const templates = await api.organization(orgId).template().select(TEMPLATE_NAME_FIELDS);
        setAvailableTemplates(
          templates.filter((t) => t.name !== "Terraform-Plan/Apply-Cli" && t.name !== "Terraform-Plan/Destroy-Cli")
        );
      } catch (err) {
        message.error(getErrorMessage(err) || "Failed to load templates");
      }
    })();
  }, [orgId]);

  useEffect(() => {
    if (mode === "edit" && configId) {
      setLoading(true);
      const body = {
        // Root-level GraphQL queries (unlike a nested relationship traversal
        // through organization/workspace) use the entity's @Entity(name=...)
        // directly - snake_case, same rule as the REST root collection name.
        query: `{
          notification_configuration(ids: ["${configId}"]) {
            edges { node {
              name description channelType destinationUrl active messageStyle
              workspace { edges { node { id } } }
              triggers { edges { node { id jobStatus } } }
              templates { edges { node { id } } }
            } }
          }
        }`,
      };
      apiPost<unknown, any>("/graphql/api/v1", body, (data) => data, {
        dataWrapped: true,
        contentType: "application/json",
      })
        .then((response: any) => {
          const node = response?.data?.notification_configuration?.edges?.[0]?.node;
          if (!node) return;
          form.setFieldsValue({
            name: node.name,
            description: node.description,
            channelType: node.channelType,
            destinationUrl: node.destinationUrl,
            active: node.active,
            messageStyle: node.messageStyle || "DETAILED",
          });
          const triggerEdges = node.triggers?.edges || [];
          const statuses: JobStatus[] = triggerEdges.map((e: any) => e.node.jobStatus);
          const idsByStatus: Record<string, string> = {};
          triggerEdges.forEach((e: any) => {
            idsByStatus[e.node.jobStatus] = e.node.id;
          });
          setSelectedStatuses(statuses);
          setTriggerIds(idsByStatus);
          setSelectedTemplateIds((node.templates?.edges || []).map((e: any) => e.node.id));
          // The config's actual scope, straight from the record being edited - not the
          // workspaceId prop, which just reflects whatever list view this was opened from and
          // is wrong whenever that's a workspace's merged view showing an org-wide default.
          setConfigWorkspaceId(node.workspace?.edges?.[0]?.node?.id ?? null);
        })
        .catch((err) => message.error(getErrorMessage(err) || "Failed to load notification configuration"))
        .finally(() => setLoading(false));
    } else {
      form.setFieldsValue({ active: true, messageStyle: "DETAILED" });
      setLoading(false);
    }
  }, [mode, configId]);

  useEffect(() => {
    setTestResult(null);
  }, [channelType, destinationUrl]);

  const saveTriggers = async (savedConfigId: string) => {
    const toCreate = selectedStatuses.filter((s) => triggerIds[s] === undefined);
    const toDelete = Object.values(JobStatus).flatMap((status) => {
      const triggerId = triggerIds[status];
      return triggerId && !selectedStatuses.includes(status) ? [triggerId] : [];
    });

    // Sub-resource operations by ID (unlike the org/workspace-nested create path
    // above) go through the root collection name, which Elide derives from the
    // entity's @Entity(name=...) - snake_case, not the camelCase relationship
    // field name used for nested creation.
    await Promise.all(
      toCreate.map((status) => {
        const body: CreateBody<"notification_trigger"> = {
          data: { type: "notification_trigger", attributes: { jobStatus: status } },
        };
        return axiosInstance.post(`notification_configuration/${savedConfigId}/triggers`, body, {
          headers: JSONAPI_HEADERS,
        });
      })
    );
    await Promise.all(
      toDelete.map((triggerId) =>
        axiosInstance.delete(`notification_configuration/${savedConfigId}/triggers/${triggerId}`, {
          headers: { "Content-Type": undefined },
        })
      )
    );
  };

  // Replaces the entire "applies to these templates" set in one call - simpler and safer than
  // diffing against what was previously selected, and Elide supports replacing a to-many
  // relationship wholesale via PATCH .../relationships/{name}.
  const saveTemplates = async (savedConfigId: string) => {
    const body: RelationshipBody<"notification_configuration", "templates"> = {
      data: selectedTemplateIds.map((id) => ({ type: "template", id })),
    };
    await axiosInstance.patch(`notification_configuration/${savedConfigId}/relationships/templates`, body, {
      headers: JSONAPI_HEADERS,
    });
  };

  const onFinish = async (values: ConfigurationForm) => {
    if (selectedStatuses.length === 0) {
      message.error("Select at least one trigger status");
      return;
    }
    const attributes: WriteAttributes<"notification_configuration"> = {
      name: values.name,
      description: values.description,
      channelType: values.channelType,
      destinationUrl: values.destinationUrl,
      // The stored secret is never loaded into the form, so an empty field means "keep it", not "clear it".
      signingSecret: values.channelType === "WEBHOOK" && values.signingSecret ? values.signingSecret : undefined,
      active: values.active,
      messageStyle: values.messageStyle,
    };
    try {
      let savedId: string;
      if (mode === "create") {
        const body: CreateBody<"notification_configuration"> = {
          data: { type: "notification_configuration", attributes },
        };
        const res = await axiosInstance.post<unknown>(basePath, body, { headers: JSONAPI_HEADERS });
        const createdId = createdResourceId(res.data);
        if (!createdId) {
          throw new Error("The server did not return the new notification's id");
        }
        savedId = createdId;
        message.success("Notification created");
      } else {
        if (!configId) throw new Error("No notification is selected to update");
        const body: UpdateBody<"notification_configuration"> = {
          data: { type: "notification_configuration", id: configId, attributes },
        };
        await axiosInstance.patch(`notification_configuration/${configId}`, body, { headers: JSONAPI_HEADERS });
        savedId = configId;
        message.success("Notification updated");
      }
      await saveTriggers(savedId);
      await saveTemplates(savedId);
      onDone();
    } catch (err) {
      message.error(getErrorMessage(err) || "Failed to save notification configuration");
    }
  };

  const sendTest = async () => {
    let values: Pick<ConfigurationForm, "channelType" | "destinationUrl" | "signingSecret">;
    try {
      values = await form.validateFields(["channelType", "destinationUrl", "signingSecret"]);
    } catch {
      message.error("Choose a channel and enter the destination URL before testing");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const origin = apiUrl("");
      if (configId) {
        // Saved config: test through the real config so it exercises exactly what
        // production dispatch will use (including whatever's already persisted).
        await axiosInstance.post(`${origin}/notification/v1/configuration/${configId}/test`);
      } else {
        // Not saved yet: verify the destination works before committing to it.
        await axiosInstance.post(`${origin}/notification/v1/organization/${orgId}/configuration/test`, {
          channelType: values.channelType,
          destinationUrl: values.destinationUrl,
          signingSecret: values.channelType === "WEBHOOK" ? values.signingSecret : undefined,
        });
      }
      setTestResult("success");
      message.success("Test notification sent");
    } catch (err) {
      setTestResult("error");
      message.error(getErrorMessage(err) || "Failed to send test notification");
    } finally {
      setTesting(false);
    }
  };

  const toggleGroup = (statuses: JobStatus[], checked: boolean) => {
    setSelectedStatuses((current) =>
      checked ? Array.from(new Set([...current, ...statuses])) : current.filter((s) => !statuses.includes(s))
    );
  };

  const onDelete = () => {
    axiosInstance
      .delete(`notification_configuration/${configId}`, { headers: { "Content-Type": undefined } })
      .then(() => {
        message.success("Notification deleted");
        onDone();
      })
      .catch((err) => message.error(getErrorMessage(err) || "Could not delete the notification"));
  };

  return (
    <Spin spinning={loading}>
      <SettingsPageHeader
        title={mode === "create" ? "Add notification" : "Edit notification"}
        description="Send a message to a channel when runs change state."
      />
      {configWorkspaceId !== undefined &&
        (configWorkspaceId === null ? (
          <Alert
            type="warning"
            showIcon
            className="notification-scope-alert"
            title="Organization-wide default"
            description="Applies to every workspace in this organization, so changes here affect all of them."
          />
        ) : (
          <Alert
            type="info"
            showIcon
            className="notification-scope-alert"
            title="This workspace only"
            description="Applies to this workspace, in addition to the organization-wide notifications."
          />
        ))}
      <SettingsForm form={form} onFinish={onFinish} showSave={false}>
        <SettingsSection title="Channel">
          <Form.Item name="channelType" rules={[{ required: true, message: "Choose a channel" }]}>
            <ChannelPicker />
          </Form.Item>
        </SettingsSection>

        <SettingsSection title="Details">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Enter a name for the notification" }]}
          >
            <Input placeholder="Production alerts" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea
              placeholder="Pages on-call when production runs fail"
              autoSize={{ minRows: 1, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item
            name="destinationUrl"
            label="Destination URL"
            rules={[{ required: true, message: "Enter the destination URL" }]}
            extra={
              channelType && (
                <Space orientation="vertical" size={0}>
                  <span>{CHANNEL_META[channelType].urlHelp}</span>
                  {CHANNEL_META[channelType].docsUrl && (
                    <Typography.Link href={CHANNEL_META[channelType].docsUrl} target="_blank" rel="noreferrer">
                      <LinkOutlined /> {CHANNEL_META[channelType].docsLabel}
                    </Typography.Link>
                  )}
                </Space>
              )
            }
          >
            <Input placeholder={channelType ? CHANNEL_META[channelType].urlPlaceholder : "https://..."} />
          </Form.Item>
          {channelType === "WEBHOOK" && (
            <Form.Item
              name="signingSecret"
              label="Signing secret (optional)"
              extra={
                <>
                  Requests are signed with an <code>X-Terrakube-Signature</code> header (HMAC-SHA256) so your endpoint
                  can verify them.
                </>
              }
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="messageStyle" label="Message style">
            <RadioChoices
              options={[
                {
                  value: "DETAILED",
                  label: "Detailed",
                  help: "The full card with the run link, commit and buttons.",
                },
                { value: "SIMPLE", label: "Simple", help: "One compact line, for busy channels." },
              ]}
            />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked" extra="Inactive notifications send nothing.">
            <Switch />
          </Form.Item>
        </SettingsSection>

        <SettingsSection title="Templates" description="Leave empty to notify for runs of every template.">
          <Form.Item>
            <Select
              mode="multiple"
              allowClear
              aria-label="Templates"
              placeholder="All templates"
              value={selectedTemplateIds}
              onChange={setSelectedTemplateIds}
              options={availableTemplates.map((t) => ({ value: t.id, label: t.name ?? "" }))}
            />
          </Form.Item>
        </SettingsSection>

        <SettingsSection
          title="Trigger on"
          description={`Run outcomes that send this notification. ${selectedStatuses.length} of ${TOTAL_STATUS_COUNT} selected.`}
        >
          <Flex vertical gap={12} className="notification-trigger-groups">
            {JOB_STATUS_GROUPS.map((group) => {
              const groupValues = group.statuses.map((s) => s.value);
              const selectedInGroup = groupValues.filter((v) => selectedStatuses.includes(v));
              const allSelected = selectedInGroup.length === groupValues.length;
              const GroupIcon = group.icon;

              return (
                <div key={group.key} data-testid={`trigger-group-${group.key}`} className="notification-trigger-group">
                  <Space align="center" className="notification-trigger-group-header">
                    <Tag color={group.color === "default" ? undefined : group.color} icon={<GroupIcon />}>
                      {group.label}
                    </Tag>
                    <Typography.Text type="secondary" className="notification-meta-text">
                      {selectedInGroup.length}/{groupValues.length}
                    </Typography.Text>
                    <Button type="link" size="small" onClick={() => toggleGroup(groupValues, !allSelected)}>
                      {allSelected ? "Clear" : "Select all"}
                    </Button>
                  </Space>
                  <Flex wrap gap="4px 20px">
                    {group.statuses.map((status) => (
                      <Space key={status.value} size={4} align="center">
                        <Checkbox
                          checked={selectedStatuses.includes(status.value)}
                          onChange={(e) => {
                            setSelectedStatuses((current) =>
                              e.target.checked ? [...current, status.value] : current.filter((s) => s !== status.value)
                            );
                          }}
                        >
                          {status.label}
                        </Checkbox>
                        {status.hint && (
                          <Tooltip title={status.hint}>
                            <InfoCircleOutlined className="notification-trigger-hint" />
                          </Tooltip>
                        )}
                      </Space>
                    ))}
                  </Flex>
                </div>
              );
            })}
          </Flex>
        </SettingsSection>

        <SettingsSection title="Test" description="Sends a sample message to the destination URL.">
          <Space orientation="vertical" size="small" className="notification-test-block">
            {testResult && (
              <Alert
                type={testResult === "success" ? "success" : "error"}
                showIcon
                icon={testResult === "success" ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                title={
                  testResult === "success"
                    ? "Test notification delivered successfully"
                    : "Test notification failed to deliver"
                }
                closable
                onClose={() => setTestResult(null)}
              />
            )}
            <Button
              icon={<SendOutlined />}
              onClick={sendTest}
              loading={testing}
              disabled={!channelType || !destinationUrl}
            >
              Send test notification
            </Button>
          </Space>
        </SettingsSection>

        <Flex gap="small">
          <Button type="primary" htmlType="submit" disabled={!managePermission}>
            {mode === "create" ? "Create notification" : "Update notification"}
          </Button>
          <Button onClick={onDone}>Cancel</Button>
        </Flex>
      </SettingsForm>

      {/* An organization-wide default opened from a workspace is deleted from the organization's settings. */}
      {mode === "edit" && configId && !(configWorkspaceId === null && workspaceId) && (
        <DangerZone
          actionName="Delete this notification"
          description="Runs stop sending messages for this notification. This cannot be undone."
          disabled={!managePermission}
          onConfirm={onDelete}
          confirmMessage={`Runs stop sending messages for ${name}. This cannot be undone.`}
        />
      )}
    </Spin>
  );
};
