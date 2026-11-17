import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Flex, Grid, message, Table, Tag, Tooltip, Typography } from "antd";
import { Loading } from "@/components/feedback/Loading";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import { LinkButton } from "@/components/navigation/LinkButton";
import axiosInstance, { getErrorMessage, isPermissionError } from "../../config/axiosConfig";
import { api, fields, type Row } from "../api";
import { EditTeam } from "./EditTeam";
import { isTeamRole, teamRoles } from "./teamRoles";
import "./Settings.css";
import "./TeamsTagsVariables.css";
import { AccessDeniedAlert } from "@/components/feedback/AccessDeniedAlert";
import { EmptyState } from "@/components/feedback/EmptyState";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";

// The permission summary lists what a custom role grants, so every right it can name is selected.
const TEAM_FIELDS = fields.team(
  "name",
  "role",
  "manageWorkspace",
  "manageState",
  "manageModule",
  "manageProvider",
  "manageTemplate",
  "manageVcs",
  "manageCollection",
  "managePolicies",
  "planJob",
  "approveJob",
  "destroyJob"
);

/** An organization team as the settings table lists it. */
type TeamRow = Row<typeof TEAM_FIELDS>;

const customPermissionLabels: [keyof TeamRow, string][] = [
  ["manageWorkspace", "workspaces"],
  ["manageState", "state"],
  ["manageModule", "modules"],
  ["manageProvider", "providers"],
  ["manageTemplate", "templates"],
  ["manageVcs", "VCS"],
  ["manageCollection", "collections"],
  ["managePolicies", "policies"],
  ["planJob", "plan runs"],
  ["approveJob", "apply runs"],
  ["destroyJob", "destroy runs"],
];

// Preset roles explain themselves; a custom role lists what it grants.
function permissionSummary(team: TeamRow): string {
  const role = team.role || "custom";
  if (role !== "custom") {
    return isTeamRole(role) ? teamRoles[role].description : "";
  }
  const granted = customPermissionLabels.filter(([key]) => team[key]).map(([, label]) => label);
  return granted.length === 0 ? "No permissions granted." : `Can manage ${granted.join(", ")}.`;
}

type Props = {
  editorMode?: "new" | "edit";
  editorId?: string;
  managePermission?: boolean;
};

export const TeamSettings = ({ editorMode, editorId, managePermission = true }: Props) => {
  const orgid = useRequiredParam("orgid");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<TeamRow | null>(null);
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const mode: "list" | "edit" | "create" = editorMode === "new" ? "create" : (editorMode ?? "list");
  const teamId = editorId;
  const closeEditor = () => navigate(`/organizations/${orgid}/settings/teams`);
  const newTeamPath = `/organizations/${orgid}/settings/teams/new`;
  const editPath = (id: string) => `/organizations/${orgid}/settings/teams/edit/${id}`;

  const onDelete = (id: string) => {
    axiosInstance
      .delete(`organization/${orgid}/team/${id}`)
      .then(() => {
        message.success("Team deleted successfully");
        loadTeams();
      })
      .catch((err) => {
        message.error(`Could not delete the team: ${getErrorMessage(err)}`);
      });
  };

  const loadTeams = async () => {
    try {
      setTeams(await api.organization(orgid).team().select(TEAM_FIELDS));
    } catch (err) {
      if (isPermissionError(err)) {
        setError(getErrorMessage(err));
      } else {
        message.error(`Could not load teams: ${getErrorMessage(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadTeams();
  }, [orgid]);

  const columns = [
    {
      title: "Name",
      key: "name",
      width: "30%",
      ellipsis: true,
      render: (_: unknown, team: TeamRow) =>
        managePermission ? (
          <Link to={editPath(team.id)}>{team.name}</Link>
        ) : (
          <Typography.Text>{team.name}</Typography.Text>
        ),
    },
    {
      title: "Role",
      key: "role",
      width: 140,
      render: (_: unknown, team: TeamRow) => {
        const role = team.role || "custom";
        if (!isTeamRole(role)) {
          return <Tag color="default">{role}</Tag>;
        }
        return <Tag color={teamRoles[role].color}>{teamRoles[role].label}</Tag>;
      },
    },
    {
      title: "Permissions",
      key: "permissions",
      ellipsis: { showTitle: false },
      render: (_: unknown, team: TeamRow) => (
        <Tooltip title={permissionSummary(team)} placement="topLeft">
          <Typography.Text type="secondary" className="team-row-meta">
            {permissionSummary(team)}
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: <span className="settings-list-sr-only">Actions</span>,
      key: "actions",
      width: 104,
      align: "right" as const,
      render: (_: unknown, team: TeamRow) => (
        <Flex gap="small" justify="flex-end">
          <Tooltip title="Edit team">
            <Button
              icon={<EditOutlined />}
              aria-label={`Edit team ${team.name}`}
              disabled={!managePermission}
              onClick={() => navigate(editPath(team.id))}
            />
          </Tooltip>
          <Tooltip title="Delete team">
            <Button
              danger
              icon={<DeleteOutlined />}
              aria-label={`Delete team ${team.name}`}
              disabled={!managePermission}
              onClick={() => setPendingDelete(team)}
            />
          </Tooltip>
        </Flex>
      ),
    },
  ];

  return (
    <div className="setting">
      {error ? (
        <AccessDeniedAlert description={error} />
      ) : mode !== "list" ? (
        <EditTeam
          mode={mode}
          setMode={closeEditor}
          teamId={teamId}
          loadTeams={loadTeams}
          onDeleteTeam={onDelete}
          managePermission={managePermission}
        />
      ) : (
        <>
          <SettingsPageHeader
            docUrl="https://docs.terrakube.io/user-guide/organizations/team-management"
            title="Teams"
            description="A team gives the members of an identity provider group a role in this organization."
            divider={false}
            actions={
              <LinkButton to={newTeamPath} type="primary" icon={<PlusOutlined />} disabled={!managePermission}>
                Create team
              </LinkButton>
            }
          />
          <Loading loading={loading} description="Loading teams...">
            {teams.length === 0 ? (
              <EmptyState simple description="No teams yet. Create one to give a group access to this organization.">
                {managePermission && (
                  <LinkButton to={newTeamPath} icon={<PlusOutlined />}>
                    Create team
                  </LinkButton>
                )}
              </EmptyState>
            ) : (
              <section>
                <Typography.Title level={4} className="settings-list-count">
                  Teams ({teams.length})
                </Typography.Title>
                <Table
                  dataSource={teams}
                  columns={columns}
                  rowKey="id"
                  pagination={false}
                  tableLayout="fixed"
                  // Columns fit the content width from lg up; narrower screens scroll the table instead.
                  scroll={screens.lg ? undefined : { x: "max-content" }}
                />
              </section>
            )}
          </Loading>

          <DeleteConfirmationModal
            open={pendingDelete !== null}
            title="Delete team"
            message={
              <>
                Members of <strong>{pendingDelete?.name}</strong> lose the organization permissions this team grants.
                Team access granted on individual workspaces is not changed. This cannot be undone.
              </>
            }
            confirmValue={pendingDelete?.name}
            okText="Delete team"
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
