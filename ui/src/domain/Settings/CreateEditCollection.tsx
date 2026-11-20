import { Button, Form, Input, InputNumber, Select, Space, Spin, Table, Tag, Typography, message } from "antd";
import { createdResourceId } from "@/domain/api/parseDocument";
import type { TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import type { CreateBody, UpdateBody } from "../api/writeBodies";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { IdField } from "@/components/settings/IdField";
import { EmptyState } from "@/components/feedback/EmptyState";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import "./Settings.css";
import "./VariableCollections.css";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { CollectionVariableModal, CollectionVariableFormValues } from "./components";
import { DangerZone } from "@/components/settings/DangerZone";
import { deleteCollection } from "./deleteCollection";

type CreateEditCollectionProps = {
  mode: "create" | "edit";
  collectionId?: string;
  managePermission?: boolean;
};

const WORKSPACE_FIELDS = fields.workspace("name");
const COLLECTION_FIELDS = fields.collection("name", "description", "priority");
const ITEM_FIELDS = fields.item("key", "value", "category", "description", "hcl", "sensitive");
// The references are read for their workspace linkage only; a null workspace means the workspace was deleted.
const REFERENCE_WORKSPACES = fields.reference({ workspace: ids });
type WorkspaceRow = Row<typeof WORKSPACE_FIELDS>;
type CollectionItemRow = Row<typeof ITEM_FIELDS>;

const referenceBody = (workspaceId: string): CreateBody<"reference"> => ({
  data: {
    type: "reference",
    attributes: {
      description: `Reference to workspace ${workspaceId}`,
    },
    relationships: {
      workspace: {
        data: {
          type: "workspace",
          id: workspaceId,
        },
      },
    },
  },
});

// Without the new id there is no collection to open.
const createdId = (body: unknown): string => {
  const id = createdResourceId(body);
  if (id === undefined) {
    throw new Error("The server did not return the new collection's id");
  }
  return id;
};

export const CreateEditCollection = ({
  mode,
  collectionId: propCollectionId,
  managePermission = true,
}: CreateEditCollectionProps) => {
  const orgid = useRequiredParam("orgid");
  const { collectionid: urlCollectionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [variableLoading, setVariableLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [variables, setVariables] = useState<CollectionItemRow[]>([]);
  const [variableForm] = Form.useForm<CollectionVariableFormValues>();
  const [collectionForm] = Form.useForm();
  const [addingVariable, setAddingVariable] = useState(false);
  const [variableMode, setVariableMode] = useState<"create" | "edit">("create");
  const [editingVariableId, setEditingVariableId] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<CollectionItemRow | null>(null);
  const [collectionName, setCollectionName] = useState("");

  // Use either the prop or URL parameter for collection ID
  const collectionid = propCollectionId || urlCollectionId;

  // Load collection data if in edit mode
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      if (mode === "edit" && collectionid) {
        // Parallel load: workspaces, collection data, collection items, and collection references
        try {
          const [workspaceRows, collection, items, references] = await Promise.all([
            api.organization(orgid).workspace().select(WORKSPACE_FIELDS),
            api.organization(orgid).collection(collectionid).select(COLLECTION_FIELDS),
            api.organization(orgid).collection(collectionid).item().select(ITEM_FIELDS),
            api.organization(orgid).collection(collectionid).reference().select(REFERENCE_WORKSPACES),
          ]);

          setWorkspaces(workspaceRows);

          setCollectionName(collection.name);
          collectionForm.setFieldsValue({
            name: collection.name,
            description: collection.description,
            priority: collection.priority || 10,
          });

          setVariables(items);

          setSelectedWorkspaces(
            references.flatMap((reference) => (reference.workspace ? [reference.workspace.id] : []))
          );
        } catch (error) {
          message.error(`Could not load the variable collection: ${getErrorMessage(error)}`);
        } finally {
          setLoading(false);
        }
      } else {
        // For create mode, just load workspaces
        try {
          setWorkspaces(await api.organization(orgid).workspace().select(WORKSPACE_FIELDS));
          setVariables([]);
          setSelectedWorkspaces([]);
        } catch (error) {
          message.error(`Could not load workspaces: ${getErrorMessage(error)}`);
        } finally {
          setLoading(false);
        }
      }
    };
    load();
  }, [orgid, collectionid, mode, collectionForm]);

  const handleSave = async (values: { name: string; description?: string; priority?: number }) => {
    try {
      setSaveLoading(true);

      // Match exact payload format shown in example - without global field
      const collectionData: CreateBody<"collection"> = {
        data: {
          type: "collection",
          attributes: {
            name: values.name,
            description: values.description || "",
            priority: values.priority || 10,
          },
        },
      };

      if (mode === "create") {
        // Create collection - use the format from the example
        const response = await axiosInstance.post<unknown>(`organization/${orgid}/collection`, collectionData, {
          headers: { "Content-Type": "application/vnd.api+json" },
        });

        const newCollectionId = createdId(response.data);

        // Add workspace references
        for (const workspaceId of selectedWorkspaces) {
          await axiosInstance.post(
            `organization/${orgid}/collection/${newCollectionId}/reference`,
            referenceBody(workspaceId),
            { headers: { "Content-Type": "application/vnd.api+json" } }
          );
        }

        message.success("Variable collection created");
        // Variables can only be added to a saved collection.
        navigate(`/organizations/${orgid}/settings/collection/edit/${newCollectionId}`);
        return;
      } else if (mode === "edit" && collectionid) {
        // Update collection - match exact format without global field
        const collectionUpdate: UpdateBody<"collection"> = {
          data: {
            type: "collection",
            id: collectionid,
            attributes: {
              name: values.name,
              description: values.description || "",
              priority: values.priority || 10,
            },
          },
        };
        await axiosInstance.patch(`organization/${orgid}/collection/${collectionid}`, collectionUpdate, {
          headers: { "Content-Type": "application/vnd.api+json" },
        });

        // Handle workspace references
        // First get current references
        const existingRefs = await api
          .organization(orgid)
          .collection(collectionid)
          .reference()
          .select(REFERENCE_WORKSPACES);

        const existingWorkspaceIds = existingRefs.flatMap((ref) => (ref.workspace ? [ref.workspace.id] : []));

        // Delete references that are not in the new selection or where the workspace is null because it was deleted
        for (const ref of existingRefs) {
          if (ref.workspace == null || !selectedWorkspaces.includes(ref.workspace.id)) {
            await axiosInstance.delete(`organization/${orgid}/collection/${collectionid}/reference/${ref.id}`);
          }
        }

        // Add new references
        for (const workspaceId of selectedWorkspaces) {
          if (!existingWorkspaceIds.includes(workspaceId)) {
            await axiosInstance.post(
              `organization/${orgid}/collection/${collectionid}/reference`,
              referenceBody(workspaceId),
              { headers: { "Content-Type": "application/vnd.api+json" } }
            );
          }
        }

        message.success("Variable collection updated");
      }

      // Navigate back to collection list
      navigate(`/organizations/${orgid}/settings/collection`);
    } catch (error) {
      message.error(`Could not save the variable collection: ${getErrorMessage(error)}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteCollection = async () => {
    try {
      if (!collectionid) {
        return;
      }
      setLoading(true);
      await deleteCollection(orgid, collectionid);
      message.success("Variable collection deleted");
      navigate(`/organizations/${orgid}/settings/collection`);
    } catch (error) {
      message.error(`Could not delete the variable collection: ${getErrorMessage(error)}`);
      setLoading(false);
    }
  };

  const closeVariableModal = () => {
    setAddingVariable(false);
    setVariableMode("create");
    setEditingVariableId("");
    variableForm.resetFields();
  };

  const handleUpdateVariable = async (values: CollectionVariableFormValues) => {
    try {
      setVariableLoading(true);

      // Update local state for temp variables
      if (editingVariableId.startsWith("temp-")) {
        setVariables(
          variables.map((v) =>
            v.id === editingVariableId
              ? {
                  ...v,
                  key: values.key?.trim(),
                  value: typeof values.value === "string" ? values.value.trim() : values.value,
                  category: values.category,
                  description: values.description?.trim() ?? null,
                  hcl: values.hcl,
                  sensitive: values.sensitive,
                }
              : v
          )
        );
        message.success("Variable updated");
      } else if (mode === "edit" && collectionid) {
        // Update variable in collection via API
        try {
          const itemUpdate: UpdateBody<"item"> = {
            data: {
              type: "item",
              id: editingVariableId,
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
          await axiosInstance.patch(
            `organization/${orgid}/collection/${collectionid}/item/${editingVariableId}`,
            itemUpdate,
            { headers: { "Content-Type": "application/vnd.api+json" } }
          );

          // Refresh variables
          setVariables(await api.organization(orgid).collection(collectionid).item().select(ITEM_FIELDS));
          message.success("Variable updated");
        } catch (error) {
          message.error(`Could not update the variable: ${getErrorMessage(error)}`);
        }
      }

      closeVariableModal();
    } catch (error) {
      message.error(`Could not update the variable: ${getErrorMessage(error)}`);
    } finally {
      setVariableLoading(false);
    }
  };

  const handleAddVariable = async (values: CollectionVariableFormValues) => {
    try {
      setVariableLoading(true);

      // Add variable to local state
      const newVariable: CollectionItemRow = {
        id: `temp-${Date.now()}`,
        key: values.key?.trim(),
        value: typeof values.value === "string" ? values.value.trim() : values.value,
        category: values.category,
        description: values.description?.trim() ?? null,
        hcl: values.hcl,
        sensitive: values.sensitive,
      };

      setVariables([...variables, newVariable]);

      // Add to collection if in edit mode and id exists
      if (mode === "edit" && collectionid) {
        try {
          const itemCreate: CreateBody<"item"> = {
            data: {
              type: "item",
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
          await axiosInstance.post(`organization/${orgid}/collection/${collectionid}/item`, itemCreate, {
            headers: { "Content-Type": "application/vnd.api+json" },
          });

          // Refresh variables
          setVariables(await api.organization(orgid).collection(collectionid).item().select(ITEM_FIELDS));
          message.success("Variable added");
        } catch (error) {
          message.error(`Could not add the variable: ${getErrorMessage(error)}`);
        }
      } else {
        message.success("Variable added to collection");
      }

      closeVariableModal();
    } catch (error) {
      message.error(`Could not add the variable: ${getErrorMessage(error)}`);
    } finally {
      setVariableLoading(false);
    }
  };

  const handleEditVariable = (record: CollectionItemRow) => {
    setVariableMode("edit");
    setEditingVariableId(record.id);
    setAddingVariable(true);
    variableForm.setFieldsValue({
      key: record.key?.trim(),
      value: typeof record.value === "string" ? record.value.trim() : undefined,
      category: record.category,
      description: record.description?.trim(),
      hcl: record.hcl,
      sensitive: record.sensitive,
    });
  };

  const handleRemoveVariable = async (variableId: string) => {
    try {
      setLoading(true);
      // Remove from local state if it's a temp variable
      if (variableId.startsWith("temp-")) {
        setVariables(variables.filter((v) => v.id !== variableId));
        message.success("Variable deleted");
        return;
      }

      // Delete from collection if in edit mode
      if (mode === "edit" && collectionid) {
        try {
          await axiosInstance.delete(`organization/${orgid}/collection/${collectionid}/item/${variableId}`);

          // Refresh variables
          setVariables(await api.organization(orgid).collection(collectionid).item().select(ITEM_FIELDS));
          message.success("Variable deleted");
        } catch (error) {
          message.error(`Could not delete the variable: ${getErrorMessage(error)}`);
        }
      } else {
        setVariables(variables.filter((v) => v.id !== variableId));
        message.success("Variable deleted");
      }
    } finally {
      setLoading(false);
    }
  };

  const variableColumns: TableColumnsType<CollectionItemRow> = [
    {
      title: "Key",
      key: "key",
      render: (_: unknown, record: CollectionItemRow) => (
        <>
          <span className="collection-mono">{record.key}</span>
          <span className="collection-variable-meta">
            {record.category === "ENV" ? "Environment" : "Terraform"}
            {record.hcl && <Tag>HCL</Tag>}
            {record.sensitive && <Tag>Sensitive</Tag>}
          </span>
        </>
      ),
    },
    {
      title: "Value",
      key: "value",
      render: (_: unknown, record: CollectionItemRow) =>
        record.sensitive ? (
          <Typography.Text type="secondary" italic>
            Sensitive, write only
          </Typography.Text>
        ) : (
          <span className="collection-mono">{record.value}</span>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 96,
      render: (_: unknown, record: CollectionItemRow) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`Edit variable ${record.key}`}
            onClick={() => handleEditVariable(record)}
            disabled={!managePermission}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete variable ${record.key}`}
            onClick={() => setPendingDelete(record)}
            disabled={!managePermission}
          />
        </Space>
      ),
    },
  ];

  const openNewVariable = () => {
    setVariableMode("create");
    setEditingVariableId("");
    variableForm.resetFields();
    setAddingVariable(true);
  };

  const addVariableButton = (
    <Button icon={<PlusOutlined />} onClick={openNewVariable} disabled={!managePermission}>
      Add variable
    </Button>
  );

  return (
    <div className="setting">
      <Spin spinning={loading}>
        <SettingsPageHeader
          title={mode === "create" ? "Create a variable collection" : "Edit variable collection"}
          divider={false}
        />

        <SettingsForm
          form={collectionForm}
          name="collection"
          onFinish={handleSave}
          initialValues={{ name: "", description: "", priority: 10 }}
          saveLabel={mode === "create" ? "Create variable collection" : "Update variable collection"}
          saveDisabled={!managePermission}
          saving={saveLoading}
        >
          {mode === "edit" && collectionid && <IdField id="collection-id" value={collectionid} />}
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Enter a name for the collection" }, { max: 128 }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ max: 512 }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={512} showCount />
          </Form.Item>
          <Form.Item
            name="priority"
            label="Priority"
            rules={[{ required: true, message: "Enter a priority from 1 to 100" }]}
            extra="When several collections set the same variable, the one with the higher priority wins."
          >
            <InputNumber min={1} max={100} precision={0} />
          </Form.Item>
          <Form.Item
            label="Workspaces"
            htmlFor="collection-workspaces"
            extra="Only these workspaces receive the variables in this collection."
          >
            <Select
              id="collection-workspaces"
              mode="multiple"
              placeholder="Select workspaces"
              value={selectedWorkspaces}
              onChange={setSelectedWorkspaces}
              optionFilterProp="label"
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
            />
          </Form.Item>
        </SettingsForm>

        {mode === "create" ? (
          <section className="collection-variables">
            <Typography.Title level={4} className="collections-heading">
              Variables
            </Typography.Title>
            <Typography.Text type="secondary">You can add variables once the collection is created.</Typography.Text>
          </section>
        ) : (
          <section className="collection-variables">
            <SettingsSection
              maxWidth={680}
              title={`Variables (${variables.length})`}
              description="Jobs in the selected workspaces receive these variables. Adding, editing or deleting a variable applies immediately."
              extra={variables.length > 0 && addVariableButton}
            >
              {variables.length === 0 ? (
                <EmptyState simple description="This collection has no variables yet.">
                  {addVariableButton}
                </EmptyState>
              ) : (
                <Table
                  dataSource={variables}
                  columns={variableColumns}
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: 520 }}
                />
              )}
            </SettingsSection>
          </section>
        )}

        {mode === "edit" && collectionName && (
          <DangerZone
            actionName="Delete this variable collection"
            description="The collection, its variables and its workspace references are deleted. Its workspaces stop receiving these variables. This cannot be undone."
            disabled={!managePermission}
            confirmValue={collectionName}
            confirmMessage={
              <>
                The collection <strong>{collectionName}</strong>, its variables and its workspace references will be
                deleted, and its workspaces stop receiving these variables. This cannot be undone.
              </>
            }
            onConfirm={handleDeleteCollection}
          />
        )}
      </Spin>

      <CollectionVariableModal
        open={addingVariable}
        mode={variableMode}
        form={variableForm}
        confirmLoading={variableLoading}
        onCancel={closeVariableModal}
        onSubmit={variableMode === "edit" ? handleUpdateVariable : handleAddVariable}
      />

      <DeleteConfirmationModal
        open={pendingDelete !== null}
        title="Delete variable"
        message={
          <>
            Workspaces using this collection will no longer receive{" "}
            <span className="collection-mono">{pendingDelete?.key}</span>. This cannot be undone.
          </>
        }
        okText="Delete variable"
        onConfirm={() => {
          if (pendingDelete) handleRemoveVariable(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
