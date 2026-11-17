import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import type { OnMount } from "@monaco-editor/react";
import { CodeEditor } from "@/components/forms/CodeEditor";
import { Alert, Button, Flex, Form, Grid, Input, message, Select, Switch, Table, Tag, Typography } from "antd";
import { decodeBase64, encodeBase64 } from "@/modules/utils/base64";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LinkButton } from "@/components/navigation/LinkButton";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import type { ClientIdCreateBody, FormValues, UpdateBody, WriteAttributes } from "../api/writeBodies";
import type { Row } from "../api/fieldSelection";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import "./Settings.css";
import "./EditorForm.css";
import "./Actions.css";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { DangerZone } from "@/components/settings/DangerZone";
import { Loading } from "@/components/feedback/Loading";
import { EmptyState } from "@/components/feedback/EmptyState";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import { validateActionSyntax } from "./validateActionSyntax";
import { type DisplayCriterion, parseDisplayCriteria } from "../Workspaces/actionCriteria";

type IStandaloneCodeEditor = Parameters<OnMount>[0];

// The table names, types and counts actions; the editor seeds every attribute the form sets.
const ACTION_LIST_FIELDS = fields.action("name", "type", "category", "version", "active");
const ACTION_EDIT_FIELDS = fields.action(
  "name",
  "description",
  "version",
  "active",
  "type",
  "label",
  "category",
  "displayCriteria",
  "action"
);
type ActionRow = Row<typeof ACTION_LIST_FIELDS>;

// id is on every form because the ID field stays mounted in edit mode; it is the resource id, not an attribute
type ActionForm = Pick<
  FormValues<"action">,
  "action" | "active" | "category" | "description" | "label" | "name" | "type" | "version"
> & { id: string; displayCriteria?: DisplayCriterion[] };

type Props = {
  editorMode?: "new" | "edit";
  editorId?: string;
  managePermission?: boolean;
};

export const ActionSettings = ({ editorMode, editorId, managePermission = true }: Props) => {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ActionRow | null>(null);
  const { orgid } = useParams();
  const navigate = useNavigate();
  const isEditing = editorMode != null;
  const mode = editorMode === "new" ? "create" : "edit";
  const actionId = editorId;
  const closeEditor = () => navigate(`/organizations/${orgid}/settings/actions`);
  const [actionContent, setActionContent] = useState<string>("");
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [form] = Form.useForm<ActionForm>();
  const editorRef = useRef<IStandaloneCodeEditor>(null);
  const screens = Grid.useBreakpoint();

  const ACTIONS_COLUMNS = () => [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (_: string, record: ActionRow) => (
        <Link to={`/organizations/${orgid}/settings/actions/edit/${record.id}`}>{record.name}</Link>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (_: string, record: ActionRow) => <span className="editor-form-mono">{record.type}</span>,
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      render: (_: string, record: ActionRow) => record.category,
    },
    {
      title: "Version",
      dataIndex: "version",
      key: "version",
      render: (_: string, record: ActionRow) => <span className="editor-form-mono">{record.version}</span>,
    },
    {
      title: "Status",
      dataIndex: "active",
      key: "active",
      render: (_: string, record: ActionRow) =>
        record.active ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: "Actions",
      key: "action",
      align: "right" as const,
      width: 96,
      render: (_: string, record: ActionRow) => (
        <Flex gap={8} justify="flex-end">
          <LinkButton
            to={`/organizations/${orgid}/settings/actions/edit/${record.id}`}
            icon={<EditOutlined />}
            disabled={!managePermission}
            aria-label={`Edit ${record.name}`}
          />
          <Button
            icon={<DeleteOutlined />}
            disabled={!managePermission}
            aria-label={`Delete ${record.name}`}
            onClick={() => setPendingDelete(record)}
          />
        </Flex>
      ),
    },
  ];

  useEffect(() => {
    setSyntaxError(null);
    if (editorMode === "new") {
      form.resetFields();
      setActionContent("");
      if (editorRef.current) {
        editorRef.current.setValue("");
      }
      return;
    }
    if (editorMode === "edit" && editorId) {
      loadAction(editorId);
    }
  }, [editorMode, editorId]);

  const loadAction = async (actionId: string) => {
    try {
      const action = await api.action(actionId).select(ACTION_EDIT_FIELDS);
      form.setFieldsValue({
        ...action,
        description: action.description ?? undefined,
        displayCriteria: parseDisplayCriteria(action.displayCriteria),
      });
      const actionDecoded = decodeBase64(action.action);
      setActionContent(actionDecoded);
      if (editorRef.current) {
        editorRef.current.setValue(actionDecoded);
      }
    } catch (err) {
      message.error(getErrorMessage(err));
      closeEditor();
    }
  };

  const onDelete = (id: string) => {
    axiosInstance
      .delete(`action/${id}`)
      .then(() => {
        message.success("Action deleted successfully");
        loadActions();
      })
      .catch((err) => {
        message.error(getErrorMessage(err));
      });
  };

  // Named fields rather than a spread, so the form's id (the resource id) can't ride along as an attribute.
  const toAttributes = (values: ActionForm, editorValue: string): WriteAttributes<"action"> => ({
    name: values.name,
    description: values.description,
    version: values.version,
    active: values.active,
    type: values.type,
    label: values.label,
    category: values.category,
    displayCriteria: JSON.stringify(values.displayCriteria),
    action: encodeBase64(editorValue),
  });

  const onCreate = (values: ActionForm, editorValue: string) => {
    const body: ClientIdCreateBody<"action"> = {
      data: { type: "action", id: values.id, attributes: toAttributes(values, editorValue) },
    };
    axiosInstance
      .post(`action`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        message.success("Action created successfully");
        loadActions();
        closeEditor();
        form.resetFields();
      })
      .catch((err) => {
        message.error(getErrorMessage(err));
      });
  };

  const onUpdate = (values: ActionForm, editorValue: string) => {
    if (!actionId) {
      message.error("No action is selected to update");
      return;
    }
    const body: UpdateBody<"action"> = {
      data: { type: "action", id: actionId, attributes: toAttributes(values, editorValue) },
    };
    axiosInstance
      .patch(`action/${actionId}`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        message.success("Action updated successfully");
        loadActions();
        closeEditor();
        form.resetFields();
      })
      .catch((err) => {
        message.error(getErrorMessage(err));
      });
  };

  const loadActions = async () => {
    try {
      setActions(await api.action().select(ACTION_LIST_FIELDS));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadActions();
  }, []);

  function handleEditorDidMount(editor: IStandaloneCodeEditor) {
    editorRef.current = editor;
    if (actionContent) {
      editor.setValue(actionContent);
    }
  }

  const actionsUrl = `/organizations/${orgid}/settings/actions/new`;

  return (
    <div className="setting">
      <SettingsPageHeader
        docUrl="https://docs.terrakube.io/user-guide/workspaces/actions"
        title={isEditing ? (mode === "edit" ? "Edit action" : "Create action") : "Actions"}
        description={
          isEditing
            ? "Choose where the action appears in a workspace and the code it runs."
            : "Actions add buttons and tabs to workspaces, such as restarting a VM from its resource."
        }
        divider={!isEditing ? false : undefined}
        actions={
          !isEditing ? (
            <LinkButton to={actionsUrl} type="primary" icon={<PlusOutlined />} disabled={!managePermission}>
              Create action
            </LinkButton>
          ) : undefined
        }
      />
      {error ? (
        <Alert
          title={error.includes("permission") ? "Access denied" : "Could not load actions"}
          description={error}
          type="error"
          showIcon
        />
      ) : !isEditing ? (
        <>
          {loading || !actions ? (
            <Loading loading description="Loading actions..." />
          ) : actions.length === 0 ? (
            <EmptyState simple description="No actions yet. Create one to add a button or tab to workspaces.">
              {managePermission && (
                <LinkButton to={actionsUrl} icon={<PlusOutlined />}>
                  Create action
                </LinkButton>
              )}
            </EmptyState>
          ) : (
            <section>
              <Typography.Title level={4}>Actions ({actions.length})</Typography.Title>
              <Table
                dataSource={actions}
                columns={ACTIONS_COLUMNS()}
                rowKey="id"
                scroll={screens.lg ? undefined : { x: "max-content" }}
              />
            </section>
          )}
          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete action"
            message={
              <>
                Workspaces stop showing <strong>{pendingDelete?.name}</strong>. This cannot be undone.
              </>
            }
            okText="Delete action"
            onConfirm={() => {
              if (pendingDelete) onDelete(pendingDelete.id);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        </>
      ) : (
        <>
          <SettingsForm
            form={form}
            className="editor-form"
            saveLabel={mode === "create" ? "Create action" : "Update action"}
            saveDisabled={!managePermission}
            onFinish={async (values: ActionForm) => {
              const editorValue = editorRef.current ? editorRef.current.getValue() : actionContent;
              const error = await validateActionSyntax(editorValue);
              setSyntaxError(error);
              if (error) {
                editorRef.current?.focus();
                return;
              }
              if (mode === "create") onCreate(values, editorValue);
              else onUpdate(values, editorValue);
            }}
          >
            <div className="editor-form-fields">
              <SettingsSection title="Identity">
                <Form.Item
                  name="id"
                  label="ID"
                  extra={
                    mode === "create" ? "A unique, permanent identifier, such as terrakube.restart-vm." : undefined
                  }
                  rules={[{ required: true, message: "Enter an ID for the action" }]}
                >
                  <Input className="editor-form-mono" disabled={mode !== "create"} />
                </Form.Item>
                <Form.Item
                  name="name"
                  label="Name"
                  rules={[{ required: true, message: "Enter a name for the action" }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                </Form.Item>
                <Form.Item
                  name="version"
                  label="Version"
                  extra="Semantic version, such as 1.0.0."
                  rules={[
                    { required: true, message: "Enter a version" },
                    {
                      pattern: new RegExp(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/),
                      message: "Use a semantic version, such as 1.0.0",
                    },
                  ]}
                >
                  <Input className="editor-form-mono" />
                </Form.Item>
                <Form.Item name="active" valuePropName="checked" label="Active" extra="Inactive actions are hidden.">
                  <Switch />
                </Form.Item>
              </SettingsSection>

              <SettingsSection title="Placement" description="Where the action appears and how it is labeled.">
                <Form.Item
                  name="type"
                  label="Type"
                  extra="The area of the workspace that renders the action."
                  rules={[{ required: true, message: "Choose a type" }]}
                >
                  <Select
                    placeholder="Choose a type"
                    options={[
                      "Workspace/Action",
                      "Workspace/ResourceDrawer/Action",
                      "Workspace/ResourceDrawer/Tab",
                    ].map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
                <Form.Item
                  name="label"
                  label="Label"
                  extra="The button text, or the tab name for tabs."
                  rules={[{ required: true, message: "Enter a label" }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="category"
                  label="Category"
                  extra="Groups related actions, such as General, Azure or Monitoring."
                  rules={[{ required: true, message: "Enter a category" }]}
                >
                  <Input />
                </Form.Item>
              </SettingsSection>

              <SettingsSection
                title="Display criteria"
                description="Filters that decide when the action is shown, each with optional settings passed to it."
              >
                <Form.List name="displayCriteria">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <div key={key} className="action-display-criteria">
                          <Flex gap={8} align="baseline">
                            <Form.Item
                              {...restField}
                              name={[name, "filter"]}
                              className="action-criteria-field"
                              rules={[{ required: true, message: "Enter a filter" }]}
                            >
                              <Input className="editor-form-mono" placeholder="Filter" aria-label="Filter" />
                            </Form.Item>
                            <Button
                              type="text"
                              icon={<MinusCircleOutlined />}
                              aria-label="Remove display criteria"
                              onClick={() => remove(name)}
                            />
                          </Flex>
                          <Form.List name={[name, "settings"]}>
                            {(settingFields, { add: addSetting, remove: removeSetting }) => (
                              <div className="action-criteria-settings">
                                {settingFields.map(({ key: settingKey, name: settingName, ...settingRestField }) => (
                                  <Flex key={settingKey} gap={8} align="baseline">
                                    <Form.Item
                                      {...settingRestField}
                                      name={[settingName, "key"]}
                                      className="action-criteria-field"
                                      rules={[{ required: true, message: "Enter a key" }]}
                                    >
                                      <Input placeholder="Key" aria-label="Setting key" />
                                    </Form.Item>
                                    <Form.Item
                                      {...settingRestField}
                                      name={[settingName, "value"]}
                                      className="action-criteria-field"
                                      rules={[{ required: true, message: "Enter a value" }]}
                                    >
                                      <Input placeholder="Value" aria-label="Setting value" />
                                    </Form.Item>
                                    <Button
                                      type="text"
                                      icon={<MinusCircleOutlined />}
                                      aria-label="Remove setting"
                                      onClick={() => removeSetting(settingName)}
                                    />
                                  </Flex>
                                ))}
                                <Form.Item>
                                  <Button type="dashed" onClick={() => addSetting()} block icon={<PlusOutlined />}>
                                    Add setting
                                  </Button>
                                </Form.Item>
                              </div>
                            )}
                          </Form.List>
                        </div>
                      ))}
                      <Form.Item>
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          Add display criteria
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </SettingsSection>
            </div>

            <SettingsSection
              maxWidth="100%"
              title="Action code"
              description="A JavaScript function that returns a React component. Its context depends on the type; see the docs."
            >
              <CodeEditor height="40vh" onMount={handleEditorDidMount} defaultLanguage="javascript" />
              {syntaxError && (
                <Alert
                  type="error"
                  showIcon
                  role="alert"
                  title="Fix the action code before saving"
                  description={syntaxError}
                  className="action-syntax-alert"
                />
              )}
            </SettingsSection>
          </SettingsForm>
          {mode === "edit" && actionId && (
            <DangerZone
              actionName="Delete this action"
              description="Workspaces stop showing this action. This cannot be undone."
              disabled={!managePermission}
              onConfirm={() => {
                onDelete(actionId);
                closeEditor();
              }}
              confirmMessage="Workspaces stop showing this action. This cannot be undone."
            />
          )}
        </>
      )}
    </div>
  );
};
