import React, { useEffect, useState } from "react";
import { Form, Input, Select, Tabs, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";
import type { CreateBody, Linkage, UpdateBody, WriteAttributes } from "../api/writeBodies";
import type { PolicyEnforcementLevel } from "../generated/apiResources";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { RadioChoices } from "@/components/settings/RadioChoices";
import { DangerZone } from "@/components/settings/DangerZone";
import LoadingFallback from "@/components/feedback/LoadingFallback";
import { PolicySetParameters } from "./components";
import { createdResourceId } from "@/domain/api/parseDocument";
import "./PolicySets.css";

const { Option } = Select;
const { TextArea } = Input;

// Every picker lists one name per row.
const VCS_NAME_FIELDS = fields.vcs("name");
const WORKSPACE_FIELDS = fields.workspace("name");
const PROJECT_NAME_FIELDS = fields.project("name");
const TAG_NAME_FIELDS = fields.tag("name");
const NOTIFICATION_NAME_FIELDS = fields.notification_configuration("name");
const TEAM_NAME_FIELDS = fields.team("name");
type WorkspaceName = Row<typeof WORKSPACE_FIELDS>;

// The form reads these attributes; the vcs and notification ids come from the linkage so they survive
// the related resource being unreadable.
const POLICY_SET_FORM_FIELDS = fields.policy_set(
  "name",
  "description",
  "enforcementLevel",
  "shadowEnforcementLevel",
  "overrideTeam",
  "global",
  "repository",
  "branch",
  "folder",
  "opaVersion",
  { vcs: ids, notificationConfiguration: ids }
);
// Each attachment links exactly one scope target; the read only needs those ids.
const ATTACHMENT_SCOPE_FIELDS = fields.policy_attachment({ workspace: ids, project: ids, tag: ids });
// The delete sweep deletes by id; the required policySet linkage keeps the fieldset non-empty.
const ATTACHMENT_ID_FIELDS = fields.policy_attachment({ policySet: ids });

// Nullable attributes stay nullable because the edit form is filled straight from the API row.
type PolicySetForm = {
  name: string;
  description?: string | null;
  enforcementLevel: PolicyEnforcementLevel;
  shadowEnforcementLevel?: PolicyEnforcementLevel | null;
  overrideTeam?: string | null;
  global: boolean;
  repository?: string | null;
  branch?: string;
  folder?: string;
  opaVersion?: string | null;
  vcsId?: string;
  notificationConfigurationId?: string;
  workspaces?: string[];
  projects?: string[];
  tags?: string[];
};

type Props = {
  mode: "create" | "edit";
  policySetId?: string;
  managePermission?: boolean;
};

export const CreateEditPolicySet: React.FC<Props> = ({ mode, policySetId, managePermission = true }) => {
  const orgid = useRequiredParam("orgid");
  const navigate = useNavigate();
  const [form] = Form.useForm<PolicySetForm>();

  const [loading, setLoading] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  const [vcsProviders, setVcsProviders] = useState<Row<typeof VCS_NAME_FIELDS>[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceName[]>([]);
  const [projects, setProjects] = useState<Row<typeof PROJECT_NAME_FIELDS>[]>([]);
  const [tags, setTags] = useState<Row<typeof TAG_NAME_FIELDS>[]>([]);
  const [notificationConfigs, setNotificationConfigs] = useState<Row<typeof NOTIFICATION_NAME_FIELDS>[]>([]);
  const [teams, setTeams] = useState<Row<typeof TEAM_NAME_FIELDS>[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [policySetName, setPolicySetName] = useState("");
  const [activeTab, setActiveTab] = useState("settings");
  const isGlobal = Form.useWatch("global", form);

  const backUrl = `/organizations/${orgid}/settings/policies`;

  useEffect(() => {
    // Load reference data
    const loadReferences = async () => {
      try {
        setLoadingTeams(true);
        // A query is a thenable, not a Promise, so a per-read fallback wraps it in Promise.resolve;
        // a failed reference list only costs the options in its picker.
        const [vcsRows, wsRows, projRows, tagRows, notifRows, teamRows] = await Promise.all([
          Promise.resolve(api.organization(orgid).vcs().select(VCS_NAME_FIELDS)).catch(() => []),
          Promise.resolve(api.organization(orgid).workspace().select(WORKSPACE_FIELDS)).catch(() => []),
          Promise.resolve(api.organization(orgid).project().select(PROJECT_NAME_FIELDS)).catch(() => []),
          Promise.resolve(api.organization(orgid).tag().select(TAG_NAME_FIELDS)).catch(() => []),
          Promise.resolve(api.organization(orgid).notificationConfiguration().select(NOTIFICATION_NAME_FIELDS)).catch(
            () => []
          ),
          Promise.resolve(api.organization(orgid).team().select(TEAM_NAME_FIELDS)).catch(() => []),
        ]);

        setVcsProviders(vcsRows);
        setWorkspaces(wsRows);
        setProjects(projRows);
        setTags(tagRows);
        setNotificationConfigs(notifRows);
        setTeams(teamRows.map((team) => ({ id: team.id, name: team.name || team.id })));
      } catch (e) {
        console.error("Failed to load reference data", e);
      } finally {
        setLoadingTeams(false);
      }
    };

    void loadReferences();

    const loadPolicySet = async (id: string) => {
      try {
        const item = await api.policy_set(id).select(POLICY_SET_FORM_FIELDS);
        setPolicySetName(item.name);

        let attachments: Row<typeof ATTACHMENT_SCOPE_FIELDS>[] = [];
        try {
          attachments = await api.policy_set(id).attachments().select(ATTACHMENT_SCOPE_FIELDS);
        } catch {
          // attachments query fallback
        }

        form.setFieldsValue({
          name: item.name,
          description: item.description,
          enforcementLevel: item.enforcementLevel || "HARD_MANDATORY",
          shadowEnforcementLevel: item.shadowEnforcementLevel || undefined,
          overrideTeam: item.overrideTeam,
          global: item.global || false,
          repository: item.repository,
          branch: item.branch || "main",
          folder: item.folder || "/",
          opaVersion: item.opaVersion,
          vcsId: item.vcs?.id || undefined,
          notificationConfigurationId: item.notificationConfiguration?.id || undefined,
          workspaces: attachments.flatMap((att) => (att.workspace ? [att.workspace.id] : [])),
          projects: attachments.flatMap((att) => (att.project ? [att.project.id] : [])),
          tags: attachments.flatMap((att) => (att.tag ? [att.tag.id] : [])),
        });
      } catch (err) {
        message.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    if (mode === "edit" && policySetId) {
      void loadPolicySet(policySetId);
    } else {
      form.setFieldsValue({
        enforcementLevel: "HARD_MANDATORY",
        branch: "main",
        folder: "/",
        global: false,
      });
    }
  }, [form, mode, orgid, policySetId]);

  const onFinish = async (values: PolicySetForm) => {
    setSubmitting(true);
    try {
      const attributes: WriteAttributes<"policy_set"> = {
        name: values.name,
        description: values.description,
        enforcementLevel: values.enforcementLevel,
        shadowEnforcementLevel: values.shadowEnforcementLevel || null,
        overrideTeam: values.overrideTeam || null,
        global: values.global || false,
        repository: values.repository,
        branch: values.branch,
        folder: values.folder,
        // A blank version means "inherit the system default", which the API spells as null.
        opaVersion: values.opaVersion?.trim() || null,
      };

      const relationships: Linkage<"policy_set"> = {
        organization: {
          data: {
            type: "organization",
            id: orgid,
          },
        },
      };

      if (values.vcsId) {
        relationships.vcs = {
          data: {
            type: "vcs",
            id: values.vcsId,
          },
        };
      }

      if (values.notificationConfigurationId) {
        relationships.notificationConfiguration = {
          data: {
            type: "notification_configuration",
            id: values.notificationConfigurationId,
          },
        };
      } else if (mode === "edit") {
        relationships.notificationConfiguration = {
          data: null,
        };
      }

      let savedId = policySetId;

      if (mode === "create") {
        const body: CreateBody<"policy_set"> = {
          data: { type: "policy_set", attributes, relationships },
        };
        const createRes = await axiosInstance.post<unknown>("policy_set", body, {
          headers: { "Content-Type": "application/vnd.api+json" },
        });
        savedId = createdResourceId(createRes.data);
        message.success("Policy set created");
      } else {
        if (!policySetId) throw new Error("No policy set is selected to update");
        const body: UpdateBody<"policy_set"> = {
          data: { type: "policy_set", id: policySetId, attributes, relationships },
        };
        await axiosInstance.patch(`policy_set/${policySetId}`, body, {
          headers: { "Content-Type": "application/vnd.api+json" },
        });
        message.success("Policy set updated");
      }

      // Sync attachments if not global
      if (savedId && !values.global) {
        try {
          // Fetch existing attachments and remove
          const existing = await api.policy_set(savedId).attachments().select(ATTACHMENT_ID_FIELDS);
          await Promise.all(existing.map((att) => axiosInstance.delete(`policy_set/${savedId}/attachments/${att.id}`)));

          // Add new workspace attachments
          const wsPromises = (values.workspaces ?? []).map((wsId) =>
            axiosInstance.post(
              `policy_set/${savedId}/attachments`,
              {
                data: {
                  type: "policy_attachment",
                  relationships: {
                    policySet: { data: { type: "policy_set", id: savedId } },
                    workspace: { data: { type: "workspace", id: wsId } },
                  },
                },
              } satisfies CreateBody<"policy_attachment">,
              { headers: { "Content-Type": "application/vnd.api+json" } }
            )
          );

          // Add new project attachments
          const projPromises = (values.projects ?? []).map((projId) =>
            axiosInstance.post(
              `policy_set/${savedId}/attachments`,
              {
                data: {
                  type: "policy_attachment",
                  relationships: {
                    policySet: { data: { type: "policy_set", id: savedId } },
                    project: { data: { type: "project", id: projId } },
                  },
                },
              } satisfies CreateBody<"policy_attachment">,
              { headers: { "Content-Type": "application/vnd.api+json" } }
            )
          );

          // Add new tag attachments
          const tagPromises = (values.tags ?? []).map((tagId) =>
            axiosInstance.post(
              `policy_set/${savedId}/attachments`,
              {
                data: {
                  type: "policy_attachment",
                  relationships: {
                    policySet: { data: { type: "policy_set", id: savedId } },
                    tag: { data: { type: "tag", id: tagId } },
                  },
                },
              } satisfies CreateBody<"policy_attachment">,
              { headers: { "Content-Type": "application/vnd.api+json" } }
            )
          );

          await Promise.all([...wsPromises, ...projPromises, ...tagPromises]);
        } catch (attErr) {
          console.error("Failed to sync attachments", attErr);
        }
      }

      navigate(backUrl);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const currentOverrideTeam = Form.useWatch("overrideTeam", form);
  const teamOptions = [...teams];
  if (currentOverrideTeam && !teamOptions.some((t) => t.name === currentOverrideTeam)) {
    teamOptions.push({
      id: currentOverrideTeam,
      name: currentOverrideTeam,
    });
  }

  if (loading) {
    return <LoadingFallback />;
  }

  const onDelete = () => {
    axiosInstance
      .delete(`policy_set/${policySetId}`)
      .then(() => {
        message.success("Policy set deleted");
        navigate(backUrl);
      })
      .catch((err) => message.error(getErrorMessage(err)));
  };

  const settingsForm = (
    <>
      <SettingsForm
        form={form}
        onFinish={onFinish}
        saveLabel={mode === "create" ? "Create policy set" : "Update policy set"}
        saveDisabled={!managePermission}
        saving={submitting}
      >
        <SettingsSection title="Identity">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name for the policy set" }]}>
            <Input placeholder="security-baseline" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="What these rules check" />
          </Form.Item>
        </SettingsSection>

        <SettingsSection title="Enforcement" description="What happens to a run that violates a rule in this set.">
          <Form.Item
            name="enforcementLevel"
            label="Enforcement level"
            rules={[{ required: true, message: "Choose an enforcement level" }]}
          >
            <RadioChoices
              options={[
                { value: "HARD_MANDATORY", label: "Hard mandatory", help: "The run stops before apply." },
                {
                  value: "SOFT_MANDATORY",
                  label: "Soft mandatory",
                  help: "The run waits until a member of the override team approves it.",
                },
                { value: "ADVISORY", label: "Advisory", help: "The violation is reported and the run continues." },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="overrideTeam"
            label="Override team"
            extra="Members of this team can approve soft-mandatory violations."
          >
            <Select
              showSearch
              allowClear
              placeholder="No override team"
              data-testid="policy-set-override-team-select"
              loading={loadingTeams}
              filterOption={(input, option) =>
                String(option?.value ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            >
              {teamOptions.map((t) => (
                <Option key={t.id} value={t.name}>
                  {t.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="shadowEnforcementLevel"
            label="Shadow enforcement"
            extra="Also evaluates the rules at this level and records the result, without changing the run."
          >
            <Select allowClear placeholder="Off">
              <Option value="HARD_MANDATORY">Hard mandatory</Option>
              <Option value="SOFT_MANDATORY">Soft mandatory</Option>
              <Option value="ADVISORY">Advisory</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="opaVersion"
            label="OPA version"
            extra={
              <>
                Leave empty to use the default version. See{" "}
                <Typography.Link
                  href="https://github.com/open-policy-agent/opa/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OPA releases
                </Typography.Link>
                .
              </>
            }
          >
            <Input
              className="policy-mono"
              placeholder="Inherit system default (e.g. 1.20.2)"
              data-testid="policy-set-opa-version-input"
            />
          </Form.Item>
          <Form.Item
            name="notificationConfigurationId"
            label="Notification"
            extra="Sends a message to this channel when a run violates a rule in this set."
          >
            <Select
              allowClear
              placeholder="No notification"
              data-testid="policy-set-notification-select"
              options={notificationConfigs.map((nc) => ({
                value: nc.id,
                label: nc.name || nc.id,
              }))}
            />
          </Form.Item>
        </SettingsSection>

        <SettingsSection title="Source" description="The repository folder that holds the Rego files.">
          <Form.Item name="vcsId" label="VCS provider">
            <Select
              allowClear
              placeholder="No VCS provider"
              options={vcsProviders.map((v) => ({ value: v.id, label: v.name || v.id }))}
            />
          </Form.Item>
          <Form.Item
            name="repository"
            label="Repository"
            rules={[{ required: true, message: "Enter the repository URL" }]}
          >
            <Input className="policy-mono" placeholder="https://github.com/org/opa-policies.git" />
          </Form.Item>
          <Form.Item name="branch" label="Branch">
            <Input className="policy-mono" placeholder="main" />
          </Form.Item>
          <Form.Item name="folder" label="Folder">
            <Input className="policy-mono" placeholder="/" />
          </Form.Item>
        </SettingsSection>

        <SettingsSection title="Scope" description="The workspaces checked against this policy set.">
          <Form.Item
            name="global"
            label="Applies to"
            getValueProps={(value) => ({ value: value ? "all" : "selected" })}
            normalize={(value) => value === "all"}
          >
            <RadioChoices
              options={[
                { value: "all", label: "All workspaces", help: "Every workspace in the organization." },
                {
                  value: "selected",
                  label: "Selected workspaces",
                  help: "Only the workspaces, projects and tags chosen below.",
                },
              ]}
            />
          </Form.Item>

          {!isGlobal && (
            <>
              <Form.Item name="workspaces" label="Workspaces">
                <Select
                  mode="multiple"
                  placeholder="Choose workspaces"
                  allowClear
                  optionFilterProp="label"
                  options={workspaces.map((ws) => ({ value: ws.id, label: ws.name || ws.id }))}
                />
              </Form.Item>
              <Form.Item name="projects" label="Projects" extra="Includes every workspace in the project.">
                <Select
                  mode="multiple"
                  placeholder="Choose projects"
                  allowClear
                  optionFilterProp="label"
                  options={projects.map((p) => ({ value: p.id, label: p.name || p.id }))}
                />
              </Form.Item>
              <Form.Item name="tags" label="Tags" extra="Includes every workspace with the tag.">
                <Select
                  mode="multiple"
                  placeholder="Choose tags"
                  allowClear
                  optionFilterProp="label"
                  options={tags.map((t) => ({ value: t.id, label: t.name || t.id }))}
                />
              </Form.Item>
            </>
          )}
        </SettingsSection>
      </SettingsForm>

      {mode === "edit" && policySetId && (
        <DangerZone
          actionName="Delete this policy set"
          description="Workspaces stop being checked against these rules. Its attachments, parameters and exemptions are deleted too. This cannot be undone."
          disabled={!managePermission}
          onConfirm={onDelete}
          confirmValue={policySetName}
          confirmMessage={`Workspaces will no longer be checked against ${policySetName}. Its attachments, parameters and exemptions are deleted too. This cannot be undone.`}
        />
      )}
    </>
  );

  return (
    <div>
      <SettingsPageHeader
        title={mode === "create" ? "Create policy set" : "Edit policy set"}
        description="Choose the rules to enforce, how strictly, and on which workspaces."
        divider={mode === "create"}
      />

      {mode === "edit" && policySetId ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "settings",
              label: "Settings",
              children: settingsForm,
            },
            {
              key: "parameters",
              label: "Parameters",
              children: <PolicySetParameters policySetId={policySetId} managePermission={managePermission} />,
            },
          ]}
        />
      ) : (
        settingsForm
      )}
    </div>
  );
};
