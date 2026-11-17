import { Button, Checkbox, Form, Select, Spin, Table, Typography, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import axiosInstance, { getErrorMessage } from "../../../config/axiosConfig";
import { api, fields } from "../../generated/apiPaths";
import type { AtomicOperationsBody } from "../../api/writeBodies";
import type { Row } from "../../api/fieldSelection";
import type { WorkspacePageRow } from "../workspaceQuery";
import { atomicHeader } from "../Workspaces";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import "../Workspaces.css";

type Props = {
  organizationId: string;
  workspace: WorkspacePageRow;
  manageWorkspace: boolean;
  onWorkspaceUpdate?: () => void;
};

type UpdateStateSharedForm = {
  globalRemoteState: boolean;
};

const WORKSPACE_NAME_SELECTION = fields.workspace("name");

/** A workspace as the state-sharing picker and access table read it. */
type SharedWorkspace = Row<typeof WORKSPACE_NAME_SELECTION>;

const SEARCH_DEBOUNCE_MS = 300;

export const WorkspaceStateShared = ({ organizationId, workspace, manageWorkspace, onWorkspaceUpdate }: Props) => {
  const [form] = Form.useForm<UpdateStateSharedForm>();
  const globalRemoteState = Form.useWatch("globalRemoteState", form);
  const id = workspace.id;
  const [waiting, setWaiting] = useState(false);
  const [sharedWorkspaces, setSharedWorkspaces] = useState<SharedWorkspace[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [options, setOptions] = useState<SharedWorkspace[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<SharedWorkspace | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Bumped on every keystroke so only the response to the latest query may land.
  const latestSearch = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(searchTimer.current);
      latestSearch.current += 1;
    },
    []
  );

  useEffect(() => {
    const ids =
      workspace.sharedIds
        ?.split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "") || [];
    if (ids.length === 0) {
      setSharedWorkspaces([]);
      return;
    }

    setLoadingTable(true);
    Promise.resolve(
      api
        .organization(organizationId)
        .workspace()
        .select(WORKSPACE_NAME_SELECTION)
        .where((w) => w.id.in(ids))
    )
      .then((found) => new Map(found.map((item) => [item.id, item.name])))
      .catch(() => new Map<string, string>())
      .then((names) => {
        // A deleted or unreadable workspace stays listed so its access can still be revoked.
        setSharedWorkspaces(
          ids.map((workspaceId) => ({ id: workspaceId, name: names.get(workspaceId) ?? "Unknown workspace" }))
        );
        setLoadingTable(false);
      });
  }, [organizationId, workspace.sharedIds]);

  const fetchWorkspaceOptions = async (search: string, request: number) => {
    try {
      const found = await api
        .organization(organizationId)
        .workspace()
        .select(WORKSPACE_NAME_SELECTION)
        .where((w) => w.name.contains(search));
      if (request !== latestSearch.current) {
        return;
      }
      setOptions(found);
    } catch (error) {
      if (request === latestSearch.current) {
        console.error("Error fetching workspaces:", error);
      }
    } finally {
      if (request === latestSearch.current) {
        setFetching(false);
      }
    }
  };

  const searchWorkspaces = (search: string) => {
    clearTimeout(searchTimer.current);
    latestSearch.current += 1;
    const request = latestSearch.current;
    if (!search) {
      setOptions([]);
      setFetching(false);
      return;
    }
    setFetching(true);
    searchTimer.current = setTimeout(() => void fetchWorkspaceOptions(search, request), SEARCH_DEBOUNCE_MS);
  };

  const updateSharedIds = async (updatedWorkspaces: SharedWorkspace[]) => {
    const sharedIdsString = updatedWorkspaces.map((ws) => ws.id).join(",");
    const body: AtomicOperationsBody<"workspace"> = {
      "atomic:operations": [
        {
          op: "update",
          href: `/organization/${organizationId}/workspace/${id}`,
          data: {
            type: "workspace",
            id: id,
            attributes: {
              sharedIds: sharedIdsString,
            },
          },
        },
      ],
    };

    const response = await axiosInstance.post("/operations", body, atomicHeader);
    if (response.status === 200) {
      setSharedWorkspaces(updatedWorkspaces);
      message.success("Shared workspaces updated");
      onWorkspaceUpdate?.();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  };

  const handleSelectWorkspace = async (workspaceId: string) => {
    if (sharedWorkspaces.find((ws) => ws.id === workspaceId)) {
      message.warning("This workspace already has access");
      return;
    }

    const selectedWs = options.find((ws) => ws.id === workspaceId);
    if (!selectedWs) {
      return;
    }

    setWaiting(true);
    try {
      await updateSharedIds([...sharedWorkspaces, selectedWs]);
    } catch (error) {
      message.error(`Could not give ${selectedWs.name} access: ${getErrorMessage(error)}`);
    } finally {
      setWaiting(false);
    }
  };

  const handleRemoveWorkspace = async (removed: SharedWorkspace) => {
    setPendingRemoval(null);
    setWaiting(true);
    try {
      await updateSharedIds(sharedWorkspaces.filter((ws) => ws.id !== removed.id));
    } catch (error) {
      message.error(`Could not remove access for ${removed.name}: ${getErrorMessage(error)}`);
    } finally {
      setWaiting(false);
    }
  };

  const onFinish = (values: UpdateStateSharedForm) => {
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
              globalRemoteState: values.globalRemoteState,
            },
          },
        },
      ],
    };

    axiosInstance
      .post("/operations", body, atomicHeader)
      .then((response) => {
        if (response.status === 200) {
          message.success("State sharing updated");
          onWorkspaceUpdate?.();
        } else {
          message.error(`Could not update state sharing (HTTP ${response.status})`);
        }
      })
      .catch((error) => message.error(`Could not update state sharing: ${getErrorMessage(error)}`))
      .finally(() => setWaiting(false));
  };

  return (
    <div className="generalSettings">
      <SettingsPageHeader
        docUrl="https://docs.terrakube.io/user-guide/workspaces/share-workspace-state"
        title="State shared"
        description="Choose which other workspaces can read this workspace's state."
        divider={false}
      />
      <Spin spinning={waiting}>
        <SettingsForm
          form={form}
          name="state-shared"
          onFinish={onFinish}
          initialValues={{ globalRemoteState: workspace.globalRemoteState }}
          disabled={!manageWorkspace}
          saveDisabled={!manageWorkspace}
        >
          <Form.Item
            name="globalRemoteState"
            valuePropName="checked"
            label="Organization access"
            extra="State can contain secrets, and every workspace in the organization will be able to read it."
          >
            <Checkbox>{"Share this workspace's state with all workspaces in the organization"}</Checkbox>
          </Form.Item>
        </SettingsForm>

        {!globalRemoteState && (
          <div className="state-shared-access">
            <SettingsSection
              maxWidth={680}
              title="Workspaces with access"
              description="These workspaces can read this workspace's state. Adding or removing one applies immediately."
            >
              <Select<string>
                showSearch
                aria-label="Add a workspace by name"
                placeholder="Add a workspace by name"
                filterOption={false}
                onSearch={searchWorkspaces}
                onSelect={handleSelectWorkspace}
                value={null}
                loading={fetching}
                className="state-shared-picker"
                disabled={!manageWorkspace}
                notFoundContent={fetching ? "Searching..." : null}
                options={options
                  .filter((option) => option.id !== id)
                  .map((option) => ({ value: option.id, label: option.name }))}
              />
              <Table
                dataSource={sharedWorkspaces}
                loading={loadingTable}
                rowKey="id"
                columns={[
                  {
                    title: "Name",
                    dataIndex: "name",
                    key: "name",
                  },
                  {
                    title: "ID",
                    dataIndex: "id",
                    key: "id",
                    render: (value: string) => <Typography.Text className="state-shared-id">{value}</Typography.Text>,
                  },
                  {
                    title: "Action",
                    key: "action",
                    render: (_, record) => (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`Remove access for ${record.name}`}
                        onClick={() => setPendingRemoval(record)}
                        disabled={!manageWorkspace}
                      />
                    ),
                  },
                ]}
              />
            </SettingsSection>
          </div>
        )}
      </Spin>
      <DeleteConfirmationModal
        open={pendingRemoval !== null}
        title={`Remove access for ${pendingRemoval?.name}?`}
        message={`${pendingRemoval?.name} will no longer be able to read this workspace's state.`}
        okText="Remove access"
        onConfirm={() => pendingRemoval && handleRemoveWorkspace(pendingRemoval)}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
};
