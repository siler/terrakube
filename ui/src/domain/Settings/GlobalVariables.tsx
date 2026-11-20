import { DeleteOutlined, EditOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Flex, Form, message, Space, Table, Tag, Tooltip, Typography } from "antd";
import { Loading } from "@/components/feedback/Loading";
import { useEffect, useState } from "react";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import axiosInstance, { getErrorMessage, isPermissionError } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import type { CreateBody, UpdateBody } from "../api/writeBodies";
import type { Row } from "../api/fieldSelection";
import { CreateVariableForm, UpdateVariableForm } from "../types";
import "./Settings.css";
import "./TeamsTagsVariables.css";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { EmptyState } from "@/components/feedback/EmptyState";
import GlobalVariableFormModal from "./components/GlobalVariableFormModal";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";

type Props = {
  managePermission?: boolean;
};

// The list never reads the description; the edit modal's own read selects it.
const GLOBALVAR_LIST_FIELDS = fields.globalvar("key", "value", "hcl", "sensitive", "category");
const GLOBALVAR_EDIT_FIELDS = fields.globalvar("key", "value", "hcl", "sensitive", "category", "description");
type GlobalVarRow = Row<typeof GLOBALVAR_LIST_FIELDS>;

export const GlobalVariablesSettings = ({ managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  const [globalVariables, setGlobalVariables] = useState<GlobalVarRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [visible, setVisible] = useState(false);
  const [variableKey, setVariableKey] = useState<string>();
  const [mode, setMode] = useState("create");
  const [variableId, setVariableId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<GlobalVarRow | null>(null);
  const [form] = Form.useForm<CreateVariableForm>();

  const columns = [
    {
      title: "Key",
      key: "key",
      // Same width in both tables so the columns line up.
      width: 320,
      sorter: (a: GlobalVarRow, b: GlobalVarRow) => a.key.localeCompare(b.key),
      defaultSortOrder: "ascend" as const,
      render: (_: unknown, record: GlobalVarRow) => (
        <Space size={4} wrap>
          <span className="settings-list-mono global-variable-key">{record.key}</span>
          {record.hcl && <Tag>HCL</Tag>}
          {record.sensitive && <Tag icon={<LockOutlined />}>Sensitive</Tag>}
        </Space>
      ),
    },
    {
      title: "Value",
      key: "value",
      render: (_: unknown, record: GlobalVarRow) =>
        record.sensitive ? (
          <span className="global-variable-value global-variable-value-sensitive">Sensitive, write-only</span>
        ) : (
          <span className="settings-list-mono global-variable-value">{record.value}</span>
        ),
    },
    {
      title: <span className="settings-list-sr-only">Actions</span>,
      key: "actions",
      align: "right" as const,
      render: (_: unknown, record: GlobalVarRow) => (
        <Flex gap="small" justify="flex-end">
          <Tooltip title="Edit variable">
            <Button
              icon={<EditOutlined />}
              aria-label={`Edit variable ${record.key}`}
              disabled={!managePermission}
              onClick={() => onEdit(record.id)}
            />
          </Tooltip>
          <Tooltip title="Delete variable">
            <Button
              danger
              icon={<DeleteOutlined />}
              aria-label={`Delete variable ${record.key}`}
              disabled={!managePermission}
              onClick={() => setPendingDelete(record)}
            />
          </Tooltip>
        </Flex>
      ),
    },
  ];
  const onCancel = () => {
    setVisible(false);
  };
  const onEdit = async (id: string) => {
    setMode("edit");
    setVariableId(id);
    setVisible(true);
    try {
      const variable = await api.organization(orgid).globalvar(id).select(GLOBALVAR_EDIT_FIELDS);
      setVariableKey(variable.key);
      form.setFieldsValue({
        key: variable.key,
        // An unreadable secret must not become an empty string, or saving would wipe it.
        value: variable.value ?? undefined,
        hcl: variable.hcl,
        sensitive: variable.sensitive,
        category: variable.category,
        description: variable.description,
      });
    } catch (err) {
      message.error(`Could not load the variable: ${getErrorMessage(err)}`);
    }
  };

  const onNew = () => {
    form.resetFields();
    setVisible(true);
    setVariableKey("");
    setMode("create");
  };

  const onDelete = (id: string) => {
    axiosInstance
      .delete(`organization/${orgid}/globalvar/${id}`)
      .then(() => {
        message.success("Global variable deleted successfully");
        loadGlobalVariables();
      })
      .catch((err) => {
        message.error(`Could not delete the variable: ${getErrorMessage(err)}`);
      });
  };

  const onCreate = (values: CreateVariableForm) => {
    const body: CreateBody<"globalvar"> = {
      data: {
        type: "globalvar",
        attributes: {
          key: values.key?.trim(),
          value: typeof values.value === "string" ? values.value.trim() : values.value,
          sensitive: values.sensitive,
          description: values.description?.trim(),
          hcl: values.hcl,
          category: values.category,
        },
      },
    };

    axiosInstance
      .post(`organization/${orgid}/globalvar`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        message.success("Global variable created successfully");
        loadGlobalVariables();
        setVisible(false);
        form.resetFields();
      })
      .catch((err) => {
        message.error(`Could not create the variable: ${getErrorMessage(err)}`);
      });
  };

  const onUpdate = (values: UpdateVariableForm) => {
    if (!variableId) {
      message.error("Could not save the variable: no variable is selected");
      return;
    }
    const body: UpdateBody<"globalvar"> = {
      data: {
        type: "globalvar",
        id: variableId,
        attributes: {
          key: values.key?.trim(),
          value: typeof values.value === "string" ? values.value.trim() : values.value,
          description: values.description?.trim(),
          hcl: values.hcl,
          category: values.category,
        },
      },
    };

    axiosInstance
      .patch(`organization/${orgid}/globalvar/${variableId}`, body, {
        headers: {
          "Content-Type": "application/vnd.api+json",
        },
      })
      .then(() => {
        message.success("Global variable updated successfully");
        loadGlobalVariables();
        setVisible(false);
        form.resetFields();
      })
      .catch((err) => {
        message.error(`Could not save the variable: ${getErrorMessage(err)}`);
      });
  };

  const loadGlobalVariables = async () => {
    try {
      setGlobalVariables(await api.organization(orgid).globalvar().select(GLOBALVAR_LIST_FIELDS));
    } catch (err) {
      if (isPermissionError(err)) {
        setError(getErrorMessage(err));
      } else {
        message.error(`Could not load global variables: ${getErrorMessage(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    loadGlobalVariables();
  }, [orgid]);

  const terraformVariables = globalVariables.filter((v) => v.category === "TERRAFORM");
  const envVariables = globalVariables.filter((v) => v.category !== "TERRAFORM");

  return (
    <div className="setting">
      {error ? (
        <AccessDeniedAlert description={error} />
      ) : (
        <>
          <SettingsPageHeader
            docUrl="https://docs.terrakube.io/user-guide/organizations/global-variables"
            title="Global variables"
            description="Applied to every workspace in this organization, unless a workspace sets the same key."
            divider={false}
            actions={
              <Button
                type="primary"
                onClick={onNew}
                htmlType="button"
                icon={<PlusOutlined />}
                disabled={!managePermission}
              >
                Create variable
              </Button>
            }
          />
          <Loading loading={loading} description="Loading global variables...">
            {globalVariables.length === 0 ? (
              <EmptyState simple description="No global variables yet.">
                {managePermission && (
                  <Button icon={<PlusOutlined />} onClick={onNew}>
                    Create variable
                  </Button>
                )}
              </EmptyState>
            ) : (
              [
                { title: "Terraform variables", items: terraformVariables },
                { title: "Environment variables", items: envVariables },
              ].map((group) => (
                <section key={group.title} className="settings-list-section">
                  <Typography.Title level={4} className="settings-list-count">
                    {group.title} ({group.items.length})
                  </Typography.Title>
                  {group.items.length === 0 ? (
                    <Typography.Text type="secondary" className="settings-list-empty">
                      No {group.title.toLowerCase()} yet.
                    </Typography.Text>
                  ) : (
                    <Table
                      dataSource={group.items}
                      columns={columns}
                      rowKey="id"
                      pagination={false}
                      scroll={{ x: "max-content" }}
                    />
                  )}
                </section>
              ))
            )}
          </Loading>

          <GlobalVariableFormModal
            open={visible}
            mode={mode === "create" ? "create" : "edit"}
            variableKey={variableKey}
            existingKeys={globalVariables.map((v) => v.key)}
            form={form}
            onCancel={onCancel}
            onSubmit={(values) => {
              if (mode === "create") onCreate(values);
              else onUpdate(values);
            }}
          />

          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete global variable"
            message={
              <>
                The global variable <strong>{pendingDelete?.key}</strong> will no longer be passed to runs in any
                workspace. This cannot be undone.
              </>
            }
            okText="Delete variable"
            onConfirm={() => {
              if (pendingDelete) onDelete(pendingDelete.id);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        </>
      )}
    </div>
  );
};
