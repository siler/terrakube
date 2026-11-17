import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Form, message, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import { or } from "../api/rsqlFilter";
import type { CreateBody, Linkage, UpdateBody } from "../api/writeBodies";
import "./Workspaces.css";

type Props = {
  organizationId: string;
  workspaceId: string;
  workspaceName: string;
  manageWorkspace: boolean;
};

type TriggerForm = {
  sourceWorkspaceId: string;
  templateId?: string;
};

const WORKSPACE_NAME = fields.workspace("name");
const TEMPLATE_NAME = fields.template("name");

// The trigger's ends are read as linkage: the id arrives even when this user cannot read the
// other workspace, and only those names are fetched separately once the edges are known.
const RUN_TRIGGER_FIELDS = fields.runTrigger("enabled", {
  sourceWorkspace: ids,
  destinationWorkspace: ids,
  template: TEMPLATE_NAME,
});

/** One run-trigger edge as the API returns it, with the template resolved and the ends as linkage. */
type TriggerEdge = Row<typeof RUN_TRIGGER_FIELDS>;

/** A workspace as the source picker lists it. */
type WorkspaceNameRow = Row<typeof WORKSPACE_NAME>;

/** A template as the picker lists it. */
type TemplateNameRow = Row<typeof TEMPLATE_NAME>;

/** One edge as a table row renders it, with the other end already resolved. */
type TriggerRow = {
  id: string;
  enabled: boolean;
  workspaceId: string;
  workspaceName: string;
  templateId?: string;
  templateName?: string;
};

const toRow = (edge: TriggerEdge, otherId: string | undefined, names: Map<string, string>): TriggerRow => ({
  id: edge.id,
  enabled: edge.enabled,
  workspaceId: otherId ?? "",
  workspaceName: otherId ? (names.get(otherId) ?? otherId) : "",
  templateId: edge.template?.id,
  templateName: edge.template?.name ?? undefined,
});

export const RunTriggers = ({ organizationId, workspaceId, workspaceName, manageWorkspace }: Props) => {
  const [form] = Form.useForm<TriggerForm>();
  const [incoming, setIncoming] = useState<TriggerRow[]>([]);
  const [outgoing, setOutgoing] = useState<TriggerRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceNameRow[]>([]);
  const [templates, setTemplates] = useState<TemplateNameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  const loadTriggers = useCallback(() => {
    setLoading(true);
    (async () => {
      try {
        const edges = await api
          .runTrigger()
          .select(RUN_TRIGGER_FIELDS)
          // Both directions in one round trip: a comma is OR in Elide's filter syntax.
          .where((trigger) =>
            or(trigger.sourceWorkspace.id.eq(workspaceId), trigger.destinationWorkspace.id.eq(workspaceId))
          );
        const incoming = edges
          .filter((edge) => edge.destinationWorkspace?.id === workspaceId)
          .map((edge) => ({ edge, otherId: edge.sourceWorkspace?.id }));
        const outgoing = edges
          .filter((edge) => edge.sourceWorkspace?.id === workspaceId)
          .map((edge) => ({ edge, otherId: edge.destinationWorkspace?.id }));
        const otherIds = [...new Set([...incoming, ...outgoing].flatMap(({ otherId }) => (otherId ? [otherId] : [])))];
        // A failed name lookup only costs the names: the rows still link by id.
        const nameRows = otherIds.length
          ? await Promise.resolve(
              api
                .organization(organizationId)
                .workspace()
                .select(WORKSPACE_NAME)
                .where((w) => w.id.in(otherIds))
            ).catch(() => [])
          : [];
        const names = new Map(nameRows.map((row) => [row.id, row.name]));
        setIncoming(incoming.map(({ edge, otherId }) => toRow(edge, otherId, names)));
        setOutgoing(outgoing.map(({ edge, otherId }) => toRow(edge, otherId, names)));
      } catch (err) {
        message.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, workspaceId]);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers]);

  const loadPickerData = useCallback(() => {
    (async () => {
      try {
        const rows = await api.organization(organizationId).workspace().select(WORKSPACE_NAME);
        // A workspace cannot trigger itself, so it is not offered as a source.
        setWorkspaces(rows.filter((item) => item.id !== workspaceId));
      } catch (err) {
        message.error(getErrorMessage(err));
      }
    })();

    (async () => {
      try {
        setTemplates(await api.organization(organizationId).template().select(TEMPLATE_NAME));
      } catch (err) {
        message.error(getErrorMessage(err));
      }
    })();
  }, [organizationId, workspaceId]);

  const onAdd = () => {
    loadPickerData();
    form.resetFields();
    setVisible(true);
  };

  const onCreate = (values: TriggerForm) => {
    const relationships: Linkage<"runTrigger"> = {
      // This workspace is the destination: it is the one that will start running. That is
      // also the end the API checks manage rights on, so this is the direction that can be
      // configured from here.
      sourceWorkspace: { data: { type: "workspace", id: values.sourceWorkspaceId } },
      destinationWorkspace: { data: { type: "workspace", id: workspaceId } },
    };
    if (values.templateId) {
      relationships.template = { data: { type: "template", id: values.templateId } };
    }

    const body: CreateBody<"runTrigger"> = {
      data: { type: "runTrigger", attributes: { enabled: true }, relationships },
    };

    axiosInstance
      .post("runTrigger", body, { headers: { "Content-Type": "application/vnd.api+json" } })
      .then(() => {
        message.success("Run trigger created successfully");
        setVisible(false);
        form.resetFields();
        loadTriggers();
      })
      .catch((err) => message.error(getErrorMessage(err)));
  };

  const onToggle = (row: TriggerRow, enabled: boolean) => {
    const body: UpdateBody<"runTrigger"> = {
      data: { type: "runTrigger", id: row.id, attributes: { enabled } },
    };
    axiosInstance
      .patch(`runTrigger/${row.id}`, body, { headers: { "Content-Type": "application/vnd.api+json" } })
      .then(() => {
        message.success(enabled ? "Run trigger enabled" : "Run trigger disabled");
        loadTriggers();
      })
      .catch((err) => message.error(getErrorMessage(err)));
  };

  const onDelete = (id: string) => {
    // No content type on purpose: the request has no body, and Elide answers 400 when one is
    // declared anyway. Other pages set it here, which is safe only as long as axios drops the
    // header on a bodyless request.
    axiosInstance
      .delete(`runTrigger/${id}`)
      .then(() => {
        message.success("Run trigger deleted successfully");
        loadTriggers();
      })
      .catch((err) => message.error(getErrorMessage(err)));
  };

  /**
   * Sources already wired to this workspace are left out: the unique constraint would refuse
   * the duplicate, so offering it is an invitation to a 409. The workspace itself is excluded
   * when the list loads, since it cannot trigger itself either.
   */
  const selectableSources = useMemo(
    () => workspaces.filter((item) => !incoming.some((row) => row.workspaceId === item.id)),
    [workspaces, incoming]
  );

  const workspaceLink = (row: TriggerRow) => (
    <Link to={`/organizations/${organizationId}/workspaces/${row.workspaceId}`}>{row.workspaceName}</Link>
  );

  const incomingColumns = useMemo(
    () => [
      {
        title: "Source workspace",
        key: "workspace",
        render: (_: string, record: TriggerRow) => workspaceLink(record),
      },
      {
        title: "Template",
        key: "template",
        render: (_: string, record: TriggerRow) =>
          record.templateName ? (
            <Tag color="default">{record.templateName}</Tag>
          ) : (
            <Typography.Text type="secondary">Default template</Typography.Text>
          ),
      },
      {
        title: "Enabled",
        key: "enabled",
        render: (_: string, record: TriggerRow) => (
          <Switch
            checked={record.enabled}
            disabled={!manageWorkspace}
            onChange={(checked) => onToggle(record, checked)}
          />
        ),
      },
      {
        title: "Actions",
        key: "action",
        render: (_: string, record: TriggerRow) => (
          <Popconfirm
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(record.id)}
            title={
              <p>
                This will stop <b>{workspaceName}</b> from running after <b>{record.workspaceName}</b>.
                <br />
                Are you sure?
              </p>
            }
            okText="Yes"
            cancelText="No"
          >
            <Button danger type="link" icon={<DeleteOutlined />} disabled={!manageWorkspace}>
              Delete
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [manageWorkspace, organizationId, workspaceName]
  );

  const outgoingColumns = useMemo(
    () => [
      {
        title: "Destination workspace",
        key: "workspace",
        render: (_: string, record: TriggerRow) => workspaceLink(record),
      },
      {
        title: "Template",
        key: "template",
        render: (_: string, record: TriggerRow) =>
          record.templateName ? (
            <Tag color="default">{record.templateName}</Tag>
          ) : (
            <Typography.Text type="secondary">Default template</Typography.Text>
          ),
      },
      {
        title: "Enabled",
        key: "enabled",
        render: (_: string, record: TriggerRow) =>
          record.enabled ? <Tag color="green">Enabled</Tag> : <Tag>Disabled</Tag>,
      },
    ],
    [organizationId]
  );

  return (
    <div>
      <Typography.Title level={2} className="workspace-flush-title">
        Run triggers
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="run-triggers-intro">
        A run trigger starts a run on one workspace after another one changes state. Only runs that apply, destroy or
        execute custom scripts fire them - a plan on its own does not.
      </Typography.Paragraph>

      <Typography.Title level={4}>Runs after</Typography.Title>
      <Typography.Paragraph type="secondary">
        <b>{workspaceName}</b> starts a run when any of these workspaces finishes changing state.
      </Typography.Paragraph>
      <Space orientation="vertical" className="run-triggers-incoming">
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd} disabled={!manageWorkspace}>
          Add source workspace
        </Button>
        <Table
          dataSource={incoming}
          columns={incomingColumns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: "This workspace does not run after any other workspace." }}
        />
      </Space>

      <Typography.Title level={4} className="run-triggers-outgoing-title">
        Triggers
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        These workspaces start a run when <b>{workspaceName}</b> changes state. They are managed from their own page,
        because configuring a trigger requires manage rights on the workspace that will run.
      </Typography.Paragraph>
      <Table
        dataSource={outgoing}
        columns={outgoingColumns}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: "No workspace runs after this one." }}
      />

      <Modal
        width="600px"
        open={visible}
        title="Add source workspace"
        okText="Create"
        onCancel={() => setVisible(false)}
        onOk={() => {
          form
            .validateFields()
            .then(onCreate)
            .catch(() => {});
        }}
      >
        <Alert
          type="info"
          showIcon
          className="run-triggers-modal-alert"
          description={
            <>
              <b>{workspaceName}</b> will start a run every time the workspace you pick finishes a run that changed
              state. A dependency that would close a loop is rejected.
            </>
          }
        />
        <Form form={form} layout="vertical" name="runTriggerForm">
          <Form.Item
            name="sourceWorkspaceId"
            label="Source workspace"
            rules={[{ required: true, message: "Source workspace is required!" }]}
            extra="The workspace whose runs will trigger this one."
          >
            <Select
              showSearch
              placeholder="Select a workspace"
              optionFilterProp="label"
              options={selectableSources.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="templateId" label="Template" extra="Leave empty to use this workspace's default template.">
            <Select
              allowClear
              placeholder="Default template"
              optionFilterProp="label"
              options={templates.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
