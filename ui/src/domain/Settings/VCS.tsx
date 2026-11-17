import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Tag, Tooltip, Typography, message } from "antd";
import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { LinkButton } from "@/components/navigation/LinkButton";
import { useOrganizationName } from "@/hooks/useOrganizationName";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import axiosInstance, { getErrorMessage, isPermissionError } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import { VcsStatus, VcsType } from "../generated/apiResources";
import { AddVCS } from "./AddVCS";
import { EditVCS } from "./EditVCS";
import "./Settings.css";
import "./VCS.css";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import VcsLogo from "@/components/display/VcsLogo";
import { Loading } from "@/components/feedback/Loading";
import { EmptyState } from "@/components/feedback/EmptyState";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import ResourceCard from "./components/ResourceCard";
import { relativeTime } from "@/modules/utils/dates";
import { getCallbackUrl, getConnectUrl, getVcsTypeExtended, usesOAuthFlow, vcsLabel } from "./vcsProviders";

type Props = {
  vcsMode?: "new" | "edit" | "list";
  vcsId?: string;
  managePermission?: boolean;
};

// Leaves out clientSecret, privateKey and accessToken, which the list never shows.
const VCS_LIST_FIELDS = fields.vcs(
  "name",
  "vcsType",
  "connectionType",
  "endpoint",
  "clientId",
  "callback",
  "apiUrl",
  "status",
  "createdBy",
  "createdDate"
);

/** One VCS provider as the list card shows it. */
type ListedVcs = Row<typeof VCS_LIST_FIELDS>;

// The linkage alone counts the workspaces; including them would download each one whole.
const VCS_WORKSPACE_IDS = fields.vcs({ workspace: ids });
const MODULE_VCS_IDS = fields.module({ vcs: ids });
const POLICY_SET_VCS_IDS = fields.policy_set({ vcs: ids });

const providerLabel = (item: ListedVcs) =>
  vcsLabel(getVcsTypeExtended(item.vcsType, item.connectionType, item.endpoint));

const plural = (count: number, noun: string) => (count > 0 ? `${count} ${noun}${count === 1 ? "" : "s"}` : "");

const STATUS_TAGS: Record<VcsStatus, { color: string; label: string }> = {
  [VcsStatus.COMPLETED]: { color: "success", label: "Connected" },
  [VcsStatus.PENDING]: { color: "warning", label: "Not connected" },
  [VcsStatus.ERROR]: { color: "error", label: "Connection failed" },
};

export const VCSSettings = ({ vcsMode, vcsId, managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [vcs, setVCS] = useState<ListedVcs[]>([]);
  const [pendingDelete, setPendingDelete] = useState<ListedVcs | null>(null);

  const mode: "list" | "new" | "edit" = vcsMode ?? "list";
  const closeEditor = () => navigate(`/organizations/${orgid}/settings/vcs`);
  const organizationName = useOrganizationName(orgid);

  const onDelete = (item: ListedVcs) => {
    Promise.all([
      api.organization(orgid).vcs(item.id).select(VCS_WORKSPACE_IDS),
      api
        .organization(orgid)
        .module()
        .select(MODULE_VCS_IDS)
        .where((module) => module.vcs.id.eq(item.id)),
      api
        .policy_set()
        .select(POLICY_SET_VCS_IDS)
        .where((policySet) => policySet.vcs.id.eq(item.id)),
    ])
      .then(([vcsItem, modules, policySets]) => {
        const workspaces = vcsItem?.workspace?.length ?? 0;
        const usage = [
          plural(workspaces, "workspace"),
          plural(modules.length, "module"),
          plural(policySets.length, "policy set"),
        ].filter(Boolean);
        if (usage.length > 0) {
          message.error(
            `${item.name} is used by ${new Intl.ListFormat("en").format(usage)}. Move them to another VCS provider first.`
          );
          return;
        }
        return axiosInstance.delete(`organization/${orgid}/vcs/${item.id}`).then(() => {
          message.success("VCS provider deleted");
          loadVCS();
        });
      })
      .catch((err) => {
        // Shared repository webhooks also reference the provider but are not exposed by the API, so the
        // usage check above can't see them; the delete then fails with a 409.
        message.error(
          axios.isAxiosError(err) && err.response?.status === 409
            ? `Could not delete ${item.name}: it is still in use. A shared repository webhook created with this provider is not listed here; it is removed once no workspace on its repository uses a shared webhook.`
            : `Could not delete the VCS provider: ${getErrorMessage(err)}`
        );
      });
  };

  useEffect(() => {
    setLoading(true);
    loadVCS();
  }, [orgid]);

  const loadVCS = async () => {
    try {
      setVCS(await api.organization(orgid).vcs().select(VCS_LIST_FIELDS));
    } catch (err) {
      if (isPermissionError(err)) {
        setError(getErrorMessage(err));
      } else {
        message.error(`Could not load VCS providers: ${getErrorMessage(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderConnection = (item: ListedVcs) => {
    const provider = providerLabel(item);
    if (!usesOAuthFlow(item.vcsType, item.connectionType)) return null;
    if (item.status === VcsStatus.COMPLETED) {
      return (
        <Typography.Text className="resource-card-meta">
          Connected through OAuth by <strong>{item.createdBy}</strong>. Every Terrakube user in{" "}
          {organizationName ?? "this organization"} uses this token for {provider} API calls.
        </Typography.Text>
      );
    }
    return (
      <div className="vcs-connect">
        <Typography.Text className="resource-card-meta">
          Connecting signs you in to {provider}. Your token is then used for every {provider} API call in{" "}
          {organizationName ?? "this organization"}.
        </Typography.Text>
        <Button
          size="small"
          target="_blank"
          disabled={!managePermission}
          href={getConnectUrl(
            item.vcsType,
            item.clientId ?? "",
            getCallbackUrl(item.callback ?? item.id),
            item.endpoint
          )}
        >
          Connect to {provider}
        </Button>
      </div>
    );
  };

  const renderList = () => {
    if (loading) return <Loading loading description="Loading VCS providers..." />;
    if (vcs.length === 0) {
      return (
        <EmptyState simple description="No VCS providers yet. Workspaces and modules need one to read repositories.">
          {managePermission && (
            <LinkButton to={`/organizations/${orgid}/settings/vcs/new`} icon={<PlusOutlined />}>
              Add a VCS provider
            </LinkButton>
          )}
        </EmptyState>
      );
    }
    return (
      <>
        <Typography.Title level={4} className="resource-list-title">
          VCS providers ({vcs.length})
        </Typography.Title>
        <div className="resource-list">
          {vcs.map((item) => {
            const status = usesOAuthFlow(item.vcsType, item.connectionType) ? STATUS_TAGS[item.status] : undefined;
            return (
              <ResourceCard
                key={item.id}
                icon={
                  // VcsLogo has no managed identity variant; it is still Azure DevOps.
                  <VcsLogo
                    type={item.vcsType === VcsType.AZURE_SP_MI ? VcsType.AZURE_DEVOPS : item.vcsType}
                    size={20}
                  />
                }
                name={item.name}
                tags={
                  <>
                    <Tag>{providerLabel(item)}</Tag>
                    {status && <Tag color={status.color}>{status.label}</Tag>}
                  </>
                }
                actions={
                  <>
                    <Tooltip title="Edit">
                      <LinkButton
                        to={`/organizations/${orgid}/settings/vcs/edit/${item.id}`}
                        icon={<EditOutlined />}
                        disabled={!managePermission}
                        aria-label={`Edit VCS provider ${item.name}`}
                      />
                    </Tooltip>
                    <Tooltip title="Delete">
                      <Button
                        icon={<DeleteOutlined />}
                        disabled={!managePermission}
                        aria-label={`Delete VCS provider ${item.name}`}
                        onClick={() => setPendingDelete(item)}
                      />
                    </Tooltip>
                  </>
                }
              >
                <dl className="resource-card-fields">
                  <dt>Callback URL</dt>
                  <dd>
                    <Typography.Text className="resource-mono" copyable>
                      {getCallbackUrl(item.callback ?? item.id)}
                    </Typography.Text>
                  </dd>
                  {item.apiUrl && (
                    <>
                      <dt>API URL</dt>
                      <dd className="resource-mono">{item.apiUrl}</dd>
                    </>
                  )}
                  <dt>Created</dt>
                  <dd>
                    {relativeTime(item.createdDate) ?? "Unknown"}
                    {item.createdBy && ` by ${item.createdBy}`}
                  </dd>
                </dl>
                {renderConnection(item)}
              </ResourceCard>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="setting">
      {error ? (
        <AccessDeniedAlert description={error} />
      ) : mode === "list" ? (
        <div>
          <SettingsPageHeader
            docUrl="https://docs.terrakube.io/user-guide/vcs-providers"
            title="VCS providers"
            description="Let workspaces and modules read your Git repositories."
            divider={false}
            actions={
              <LinkButton
                to={`/organizations/${orgid}/settings/vcs/new`}
                type="primary"
                icon={<PlusOutlined />}
                disabled={!managePermission}
              >
                Add a VCS provider
              </LinkButton>
            }
          />
          {renderList()}
          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete VCS provider"
            message={
              <>
                Deleting <strong>{pendingDelete?.name}</strong> removes its stored credentials. It only works when no
                workspace, module, policy set or shared repository webhook uses this provider. This cannot be undone.
              </>
            }
            confirmValue={pendingDelete?.name ?? ""}
            okText="Delete VCS provider"
            onConfirm={() => {
              if (pendingDelete) onDelete(pendingDelete);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        </div>
      ) : mode === "new" ? (
        <AddVCS setMode={closeEditor} loadVCS={loadVCS} />
      ) : (
        vcsId && <EditVCS vcsId={vcsId} setMode={closeEditor} loadVCS={loadVCS} />
      )}
    </div>
  );
};
