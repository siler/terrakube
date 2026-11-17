import { apiUrl } from "@/config/apiUrls";
import { AutoComplete, Checkbox, Form, Input, Select, Space, Spin, message } from "antd";
import { GlobalOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../../config/axiosConfig";
import { responseStatus } from "@/modules/api/errorStatus";
import { parseVersionIndex } from "../createWorkspaceParsers";
import { api, fields } from "../../generated/apiPaths";
import type { AtomicOperationsBody, FormValues, RelationshipBody } from "../../api/writeBodies";
import type { Row } from "../../api/fieldSelection";
import type { OrgTemplateRow, WorkspacePageRow } from "../workspaceQuery";
import {
  atomicHeader,
  genericHeader,
  getIaCIconById,
  getIaCNameById,
  gitRepoUrlPattern,
  iacTypes,
  validateTerraformVersion,
} from "../Workspaces";
import projectService, { type Project } from "@/modules/projects/projectService";
import { useOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { RadioChoices } from "@/components/settings/RadioChoices";
import { IdField } from "@/components/settings/IdField";
import VcsLogo from "@/components/display/VcsLogo";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";

type Props = {
  organizationId: string;
  workspaceData: WorkspacePageRow;
  orgTemplates: OrgTemplateRow[];
  manageWorkspace: boolean;
  onWorkspaceUpdate?: () => void;
};

const AGENT_FIELDS = fields.agent("name");

/** An executor agent as the settings form lists it. */
type AgentRow = Row<typeof AGENT_FIELDS>;

const VCS_FIELDS = fields.vcs("name", "vcsType");

/** A VCS provider as the settings form lists it. */
type VcsRow = Row<typeof VCS_FIELDS>;

type UpdateWorkspaceForm = Pick<
  FormValues<"workspace">,
  "name" | "executionMode" | "terraformVersion" | "iacType" | "branch"
> & {
  description?: FormValues<"workspace">["description"];
  folder?: FormValues<"workspace">["folder"];
  defaultTemplate?: FormValues<"workspace">["defaultTemplate"];
  restrictApplyToConfiguredBranch?: FormValues<"workspace">["restrictApplyToConfiguredBranch"];
  requireApproveToApply?: FormValues<"workspace">["requireApproveToApply"];
  // Optional: CLI-driven workspaces have no repository field to submit.
  source?: FormValues<"workspace">["source"];
  // Relationship pickers hold ids (or the "default"/"none"/"public" sentinels), not workspace attributes.
  executorAgent: string;
  project?: string;
  vcs?: string;
};

export const WorkspaceGeneral = ({
  organizationId,
  workspaceData,
  orgTemplates,
  manageWorkspace,
  onWorkspaceUpdate,
}: Props) => {
  const id = workspaceData.id;
  const { Option } = Select;
  const [selectedIac, setSelectedIac] = useState("");
  const { permissions: orgPermissions } = useOrgPermissions();
  // Terrakube before 2.34.0 does not know the setting and does not report it.
  const supportsBranchRestriction = workspaceData.restrictApplyToConfiguredBranch !== undefined;
  const supportsApproveRule = workspaceData.requireApproveToApply !== undefined;
  const [terraformVersions, setTerraformVersions] = useState<string[]>([]);
  const [agentList, setAgentList] = useState<AgentRow[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [vcsList, setVcsList] = useState<VcsRow[]>([]);
  const [waiting, setWaiting] = useState(false);
  // Values held back until the user confirms that the webhook on the old repository gets deleted.
  const [pendingValues, setPendingValues] = useState<UpdateWorkspaceForm | null>(null);
  const webhookId = workspaceData.webhook?.id;
  const initialVcsId = workspaceData.vcs?.id ?? "public";
  // CLI-driven workspaces have no repository to point at.
  const vcsDriven = workspaceData.source !== "empty";

  const loadVersions = (iacType: string) => {
    const versionsApi = `${apiUrl("")}/${iacType}/index.json`;
    axiosInstance
      .get<unknown>(versionsApi)
      .then((resp) => setTerraformVersions(parseVersionIndex(iacType, resp.data)))
      .catch((error) => message.error(getErrorMessage(error)));
  };

  useEffect(() => {
    setWaiting(true);
    const iacType = workspaceData.iacType;
    const versionsApi = `${apiUrl("")}/${iacType}/index.json`;

    // Parallel load: versions, agent list, projects, and VCS providers
    Promise.all([
      axiosInstance.get<unknown>(versionsApi),
      api.organization(organizationId).agent().select(AGENT_FIELDS),
      projectService.listProjects(organizationId),
      api.organization(organizationId).vcs().select(VCS_FIELDS),
    ])
      .then(([versionsRes, agents, projects, vcs]) => {
        setTerraformVersions(parseVersionIndex(iacType, versionsRes.data));
        setAgentList(agents);
        if (!projects.isError) setProjectList(projects.data);
        setVcsList(vcs);
        setWaiting(false);
      })
      .catch((error) => {
        console.error("Failed to load workspace configuration data:", error);
        message.error(getErrorMessage(error));
        setWaiting(false);
      });
  }, [organizationId, workspaceData.iacType]);

  const handleIacChange = (iac: string) => {
    setSelectedIac(iac);
    loadVersions(iac);
  };
  const onFinish = (values: UpdateWorkspaceForm) => {
    const repoChanged = values.source !== undefined && values.source !== workspaceData.source;
    const vcsChanged = values.vcs !== undefined && values.vcs !== initialVcsId;
    // The webhook lives on the old repository and was registered with the old connection, so it would keep
    // starting runs from the wrong repository. Delete it first: the API removes the remote hook using the
    // workspace's current repository and connection.
    if (webhookId && (repoChanged || vcsChanged)) {
      setPendingValues(values);
      return;
    }
    return saveWorkspace(values, false);
  };

  const saveWorkspace = async (values: UpdateWorkspaceForm, deleteWebhook: boolean) => {
    setWaiting(true);
    if (deleteWebhook) {
      try {
        await axiosInstance.delete(`organization/${organizationId}/workspace/${id}/webhook/${webhookId}`, {
          headers: { "Content-Type": undefined },
        });
      } catch (error) {
        // 404 means the row is already gone; remote cleanup may still have failed.
        if (responseStatus(error) !== 404) {
          message.error(`Couldn't delete the webhook, the workspace was not changed: ${getErrorMessage(error)}`);
          setWaiting(false);
          return;
        }
      }
      onWorkspaceUpdate?.();
    }
    const updateFailureMessage = deleteWebhook
      ? "Workspace update failed after the webhook was deleted. Set it up again under Webhook."
      : "Workspace update failed";
    const body: AtomicOperationsBody<"workspace"> = {
      "atomic:operations": [
        {
          op: "update",
          href: `/organization/${organizationId}/workspace/${id}`,
          data: {
            type: "workspace",
            id: id,
            attributes: {
              name: values.name,
              description: values.description,
              folder: values.folder,
              executionMode: values.executionMode,
              terraformVersion: values.terraformVersion,
              iacType: values.iacType,
              branch: values.branch,
              source: values.source,
              defaultTemplate: values.defaultTemplate,
              // Only sent to an API that has the setting (it reports it), so a newer UI still saves against an older
              // API. A manager limited to this workspace cannot change it, and the API refuses a change from them.
              ...(supportsBranchRestriction && orgPermissions.manageWorkspace
                ? { restrictApplyToConfiguredBranch: Boolean(values.restrictApplyToConfiguredBranch) }
                : {}),
              ...(supportsApproveRule && orgPermissions.manageWorkspace
                ? { requireApproveToApply: Boolean(values.requireApproveToApply) }
                : {}),
            },
          },
        },
      ],
    };

    const operationsRequest = axiosInstance.post<unknown>("/operations", body, atomicHeader);
    const requests: Promise<unknown>[] = [];

    const bodyAgent: RelationshipBody<"workspace", "agent"> =
      values.executorAgent === "default" ? { data: null } : { data: { type: "agent", id: values.executorAgent } };

    requests.push(
      axiosInstance.patch(
        `/organization/${organizationId}/workspace/${id}/relationships/agent`,
        bodyAgent,
        genericHeader
      )
    );

    const bodyProject: RelationshipBody<"workspace", "project"> =
      values.project && values.project !== "none" ? { data: { type: "project", id: values.project } } : { data: null };

    requests.push(
      axiosInstance.patch(
        `/organization/${organizationId}/workspace/${id}/relationships/project`,
        bodyProject,
        genericHeader
      )
    );

    if (values.vcs !== undefined && values.vcs !== initialVcsId) {
      const bodyVcs: RelationshipBody<"workspace", "vcs"> =
        values.vcs && values.vcs !== "public"
          ? {
              data: {
                type: "vcs",
                id: values.vcs,
              },
            }
          : {
              data: null,
            };

      requests.push(
        axiosInstance.patch(`/organization/${organizationId}/workspace/${id}/relationships/vcs`, bodyVcs, genericHeader)
      );
    }

    try {
      const [operationsRes] = await Promise.all([operationsRequest, ...requests]);
      if (operationsRes.status === 200) {
        message.success("Workspace updated successfully");
        onWorkspaceUpdate?.();
      } else {
        message.error(updateFailureMessage);
      }
    } catch (error) {
      console.error("Error updating workspace:", error);
      message.error(deleteWebhook ? `${updateFailureMessage} ${getErrorMessage(error)}` : getErrorMessage(error));
    } finally {
      setWaiting(false);
    }
  };

  const iacName = getIaCNameById(selectedIac || workspaceData.iacType);

  return (
    <div className="generalSettings">
      <SettingsPageHeader
        docUrl="https://docs.terrakube.io/user-guide/workspaces"
        title="General settings"
        description="Adjust how this workspace behaves: identity, execution mode, IaC tool and version, VCS provider and repository, default template and project."
      />
      <Spin spinning={waiting}>
        <SettingsForm
          onFinish={onFinish}
          saveDisabled={!manageWorkspace}
          initialValues={{
            name: workspaceData.name,
            description: workspaceData.description,
            folder: workspaceData.folder,
            executionMode: workspaceData.executionMode || "remote",
            terraformVersion: workspaceData.terraformVersion,
            iacType: workspaceData.iacType,
            branch: workspaceData.branch,
            defaultTemplate: workspaceData.defaultTemplate,
            restrictApplyToConfiguredBranch: workspaceData.restrictApplyToConfiguredBranch ?? false,
            requireApproveToApply: workspaceData.requireApproveToApply ?? false,
            executorAgent: workspaceData.agent?.id == null ? "default" : workspaceData.agent?.id,
            project: workspaceData.project?.id ?? "none",
            vcs: workspaceData.vcs?.id ?? "public",
            source: workspaceData.source,
          }}
          name="form-settings"
        >
          <SettingsSection title="Identity">
            <IdField id="workspace-id" value={id} copiedMessage="Workspace ID copied" />
            <Form.Item
              name="name"
              rules={[
                { required: true },
                { max: 128 },
                {
                  pattern: /^[A-Za-z0-9_-]+$/,
                  message: "Only dashes, underscores, and alphanumeric characters are permitted.",
                },
              ]}
              label="Name"
            >
              <Input disabled={!manageWorkspace} maxLength={128} />
            </Form.Item>
            <Form.Item name="description" label="Description" extra="Optional">
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 5 }}
                placeholder="Workspace description"
                disabled={!manageWorkspace}
              />
            </Form.Item>
          </SettingsSection>

          <SettingsSection
            title="Execution mode"
            description="Informational only: it tells users where plans and applies are expected to run."
          >
            <Form.Item name="executionMode" label="Execution mode">
              <RadioChoices
                disabled={!manageWorkspace}
                options={[
                  { value: "remote", label: "Remote", help: "Terrakube runs plans and applies." },
                  {
                    value: "local",
                    label: "Local",
                    help: `Users run ${iacName} locally with the remote state or cloud block and upload the state to Terrakube.`,
                  },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="executorAgent"
              label="Executor agent"
              extra="The agent that runs remote jobs for this workspace."
            >
              <Select placeholder="Select an executor agent" disabled={!manageWorkspace}>
                {agentList.map(function (agentKey) {
                  return <Option key={agentKey?.id}>{agentKey?.name}</Option>;
                })}
                <Option key="default">default</Option>
              </Select>
            </Form.Item>
          </SettingsSection>

          <SettingsSection
            title="IaC configuration"
            description="Configure the Infrastructure as Code tool and version used for this workspace."
          >
            <Form.Item name="iacType" label="IaC type">
              <Select onChange={handleIacChange} disabled={!manageWorkspace}>
                {iacTypes.map(function (iacType) {
                  return (
                    <Option key={iacType.id}>
                      {getIaCIconById(iacType.id)} {iacType.name}
                    </Option>
                  );
                })}
              </Select>
            </Form.Item>
            <Form.Item
              name="terraformVersion"
              label={`${iacName} version`}
              rules={[{ validator: validateTerraformVersion(terraformVersions) }]}
              extra="It will not upgrade automatically. Version constraints are supported (e.g. ~>1.11.0, >=1.5.7 <1.9.0)."
            >
              <AutoComplete
                disabled={!manageWorkspace}
                options={terraformVersions.map((v) => ({ value: v }))}
                filterOption={(input, option) => (option?.value ?? "").includes(input)}
                placeholder="e.g. 1.11.0 or ~>1.11.0"
              />
            </Form.Item>
            <Form.Item
              name="folder"
              label="Working directory"
              extra={`The directory ${iacName} runs in, relative to the repository root. Use a subdirectory when one repository holds several environments.`}
            >
              <Input disabled={!manageWorkspace} />
            </Form.Item>
            <Form.Item
              name="branch"
              label="Default branch"
              extra="The branch runs started from the UI use. Only applies to the VCS-driven workflow; leave it as is for CLI-driven workspaces."
            >
              <Input disabled={!manageWorkspace} />
            </Form.Item>
            {supportsBranchRestriction && (
              <Form.Item
                name="restrictApplyToConfiguredBranch"
                valuePropName="checked"
                extra={
                  vcsDriven
                    ? "Plan-only runs and terraform plan from the CLI still work on any branch. A pull request or a push to another branch can only run a plan-only template, and a release only applies commits that are on the default branch. Only a manager of every workspace in the organization can change this."
                    : "This workspace is CLI-driven: its configuration is uploaded by the Terraform CLI, not read from a branch, so there is no branch to restrict. Connect a repository to use this setting."
                }
              >
                <Checkbox disabled={!manageWorkspace || !orgPermissions.manageWorkspace || !vcsDriven}>
                  Only run apply and destroy from the default branch
                </Checkbox>
              </Form.Item>
            )}
            {supportsApproveRule && (
              <Form.Item
                name="requireApproveToApply"
                valuePropName="checked"
                extra="A team that can only plan can still queue a run whose template asks for an approval first, and cannot start an apply that has no approval step. Starting a destroy with no approval step always needs the destroy permission. Only a manager of every workspace in the organization can change this."
              >
                <Checkbox disabled={!manageWorkspace || !orgPermissions.manageWorkspace}>
                  Require the approve permission to start an apply with no approval step
                </Checkbox>
              </Form.Item>
            )}
          </SettingsSection>

          <SettingsSection
            title="Version control system"
            description="Choose Public if this workspace clones a public Git repository without credentials."
          >
            <Form.Item
              name="vcs"
              label="VCS provider"
              extra={
                vcsList.length === 0 ? (
                  <>
                    No VCS providers configured.{" "}
                    {orgPermissions.manageVcs && (
                      <Link to={`/organizations/${organizationId}/settings/vcs`}>Configure a VCS provider</Link>
                    )}
                  </>
                ) : (
                  <>
                    {orgPermissions.manageVcs && (
                      <Link to={`/organizations/${organizationId}/settings/vcs`}>
                        Manage organization VCS providers
                      </Link>
                    )}
                  </>
                )
              }
            >
              <Select placeholder="Select VCS Provider" disabled={!manageWorkspace}>
                <Option key="public" value="public">
                  <Space>
                    <GlobalOutlined />
                    <span>Public (No VCS connection)</span>
                  </Space>
                </Option>
                {vcsList.map((vcsItem) => (
                  <Option key={vcsItem.id} value={vcsItem.id}>
                    <Space>
                      <VcsLogo type={vcsItem.vcsType} size={16} />
                      <span>{vcsItem.name}</span>
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
            {vcsDriven && (
              <Form.Item
                name="source"
                label="Repository URL"
                normalize={(value: unknown) => (typeof value === "string" ? value.trim() : value)}
                extra="The Git repository this workspace clones, over https or ssh. The configured branch must exist in the new repository. State, variables and run history are kept when it changes."
                rules={[
                  { required: true, pattern: gitRepoUrlPattern, message: "Enter a valid https or ssh Git URL." },
                  // "empty" marks a CLI-driven workspace; it is not a repository.
                  {
                    validator: (_, value: unknown) =>
                      typeof value === "string" && value.trim() === "empty"
                        ? Promise.reject(new Error("Enter a Git URL."))
                        : Promise.resolve(),
                  },
                ]}
              >
                <Input disabled={!manageWorkspace} placeholder="https://github.com/org/repo.git" />
              </Form.Item>
            )}
          </SettingsSection>

          <SettingsSection title="Default template">
            <Form.Item
              name="defaultTemplate"
              label="Template"
              extra={
                <>
                  Used by the <code>terrakube apply</code> PR comment command and pre-filled when you start a run.
                </>
              }
            >
              <Select placeholder="Select a default template" disabled={!manageWorkspace}>
                {orgTemplates.map(function (template) {
                  return <Option key={template?.id}>{template?.name}</Option>;
                })}
              </Select>
            </Form.Item>
          </SettingsSection>

          <SettingsSection title="Project">
            <Form.Item name="project" label="Project" extra="Optional. Projects group and filter workspaces.">
              <Select placeholder="No project" disabled={!manageWorkspace}>
                {orgPermissions.manageWorkspace && <Option key="none">(No project)</Option>}
                {projectList.map((p) => (
                  <Option key={p.id}>{p.name}</Option>
                ))}
              </Select>
            </Form.Item>
          </SettingsSection>
        </SettingsForm>
      </Spin>
      <DeleteConfirmationModal
        open={pendingValues !== null}
        title="Delete webhook"
        message="This workspace's webhook is set up on the current repository and VCS connection. Saving deletes it, and repository events stop starting runs until you set it up again under Webhook."
        okText="Delete webhook and save"
        onConfirm={() => {
          if (pendingValues) saveWorkspace(pendingValues, true);
          setPendingValues(null);
        }}
        onCancel={() => setPendingValues(null)}
      />
    </div>
  );
};
