import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Flex, List, message, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import { LinkButton } from "@/components/navigation/LinkButton";
import axiosInstance, { getErrorMessage, isPermissionError } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import type { Row } from "../api/fieldSelection";
import { AddTemplate } from "./AddTemplate";
import { EditTemplate } from "./EditTemplate";
import "./Settings.css";
import { EmptyState } from "@/components/feedback/EmptyState";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import { Loading } from "@/components/feedback/Loading";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";

type Props = {
  editorMode?: "new" | "edit";
  editorId?: string;
  managePermission?: boolean;
};

const TEMPLATE_FIELDS = fields.template("name", "description");
type TemplateRow = Row<typeof TEMPLATE_FIELDS>;

export const TemplatesSettings = ({ editorMode, editorId, managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);
  const navigate = useNavigate();
  const mode = editorMode ?? "list";
  const templateID = editorId;
  const closeEditor = () => navigate(`/organizations/${orgid}/settings/templates`);

  const onDelete = (id: string) => {
    axiosInstance
      .delete(`organization/${orgid}/template/${id}`)
      .then(() => {
        message.success("Template deleted");
        loadTemplates();
      })
      .catch((err) => {
        message.error(getErrorMessage(err));
      });
  };

  useEffect(() => {
    setLoading(true);
    loadTemplates();
  }, [orgid, templateID]);

  const loadTemplates = async () => {
    try {
      setTemplates(await api.organization(orgid).template().select(TEMPLATE_FIELDS));
    } catch (err) {
      if (isPermissionError(err)) {
        setError(getErrorMessage(err));
      } else {
        message.error("Failed to load templates");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setting">
      {error ? (
        <AccessDeniedAlert description={error} />
      ) : (
        (mode === "new" && <AddTemplate setMode={closeEditor} loadTemplates={loadTemplates} />) ||
        (mode === "edit" && templateID && (
          <EditTemplate
            setMode={closeEditor}
            templateId={templateID}
            loadTemplates={loadTemplates}
            managePermission={managePermission}
          />
        )) || (
          <div>
            <SettingsPageHeader
              docUrl="https://docs.terrakube.io/user-guide/organizations/templates"
              title="Templates"
              description="Templates define the job flows a workspace can run, such as plan, apply, or custom steps."
              divider={false}
              actions={
                <LinkButton
                  to={`/organizations/${orgid}/settings/templates/new`}
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={!managePermission}
                >
                  Create template
                </LinkButton>
              }
            />
            {loading ? (
              <Loading loading description="Loading templates..." />
            ) : templates.length === 0 ? (
              <EmptyState simple description="No templates yet. Workspaces need one to run a job.">
                {managePermission && (
                  <LinkButton to={`/organizations/${orgid}/settings/templates/new`} icon={<PlusOutlined />}>
                    Create template
                  </LinkButton>
                )}
              </EmptyState>
            ) : (
              <section>
                <Typography.Title level={4}>Templates ({templates.length})</Typography.Title>
                <List
                  itemLayout="horizontal"
                  dataSource={templates}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Flex key="actions" gap={8}>
                          <LinkButton
                            to={`/organizations/${orgid}/settings/templates/edit/${item.id}`}
                            icon={<EditOutlined />}
                            disabled={!managePermission}
                            aria-label={`Edit ${item.name}`}
                          />
                          <Button
                            icon={<DeleteOutlined />}
                            disabled={!managePermission}
                            aria-label={`Delete ${item.name}`}
                            onClick={() => setPendingDelete(item)}
                          />
                        </Flex>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          managePermission ? (
                            <Link to={`/organizations/${orgid}/settings/templates/edit/${item.id}`}>{item.name}</Link>
                          ) : (
                            item.name
                          )
                        }
                        description={item.description}
                      />
                    </List.Item>
                  )}
                />
              </section>
            )}
            <DeleteConfirmationModal
              open={pendingDelete !== null}
              title="Delete template"
              message={
                <>
                  Workspaces can no longer run jobs with <strong>{pendingDelete?.name}</strong>. Notifications filtered
                  only to this template then fire for every template. This cannot be undone.
                </>
              }
              okText="Delete template"
              onConfirm={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
              onCancel={() => setPendingDelete(null)}
            />
          </div>
        )
      )}
    </div>
  );
};
