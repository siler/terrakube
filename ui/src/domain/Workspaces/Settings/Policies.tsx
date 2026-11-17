import { apiUrl } from "@/config/apiUrls";
import { PlayCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Tooltip, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import axiosInstance, { getErrorMessage } from "../../../config/axiosConfig";
import { ORGANIZATION_ARCHIVE } from "../../../config/actionTypes";
import { api, fields } from "../../generated/apiPaths";
import { ids, type Row } from "../../api/fieldSelection";
import { readNames, type ScopeNames } from "../../policyScopeNames";
import type { WorkspacePageRow } from "../workspaceQuery";
import SettingsSection from "@/components/settings/SettingsSection/SettingsSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import PolicyStatusTag from "@/components/display/PolicyStatusTag";
import { useOrgPermissions } from "@/modules/permissions/useOrgPermissions";
import { isRecord } from "@/modules/utils/typeGuards";
import { ExemptionRecord, PolicyExemptionModal, PolicyExemptionTable } from "../../Settings/components";
import "../Workspaces.css";

type Props = {
  workspace: WorkspacePageRow;
  manageWorkspace: boolean;
  planJob?: boolean;
  onWorkspaceUpdate?: () => void;
};

const POLICY_EXEMPTION_FIELDS = fields.policy_exemption(
  "ruleId",
  "ticketReference",
  "justification",
  "expiresAt",
  "createdDate",
  "createdBy",
  // The scope comes from the linkage ids, which arrive even for a related resource this user cannot
  // read; the names are looked up separately because Elide drops such a resource from `included`.
  { policySet: ["name"], workspace: ids, project: ids }
);

/** One policy exemption with the names of what it exempts and scopes to. */
type ExemptionRow = Row<typeof POLICY_EXEMPTION_FIELDS>;

/** The server's `message` from a failed evaluation dispatch, else the thrown error's own message. */
const evaluationErrorMessage = (error: unknown): string | undefined => {
  if (axios.isAxiosError(error) && isRecord(error.response?.data)) {
    const serverMessage = error.response.data.message;
    if (typeof serverMessage === "string" && serverMessage) {
      return serverMessage;
    }
  }
  return error instanceof Error ? error.message : undefined;
};

const WORKSPACE_NAME_SELECTION = fields.workspace("name");
const PROJECT_NAME_SELECTION = fields.project("name");

export const WorkspacePolicies = ({ workspace, manageWorkspace, planJob = false, onWorkspaceUpdate }: Props) => {
  const navigate = useNavigate();
  const organizationId = workspace?.organization?.id || sessionStorage.getItem(ORGANIZATION_ARCHIVE);
  const workspaceId = workspace?.id;
  const workspaceProjectId = workspace?.project?.id;
  const isLocked = workspace?.locked;
  const lastJobStatus = workspace?.lastJobStatus;
  const complianceStatus = workspace?.policyComplianceStatus || "UNKNOWN";

  const { permissions: orgPermissions } = useOrgPermissions(organizationId || undefined);
  const canManagePolicies = orgPermissions.managePolicies;

  const [loading, setLoading] = useState(false);
  const [exemptions, setExemptions] = useState<ExemptionRow[]>([]);
  const [scopeNames, setScopeNames] = useState<ScopeNames>({ workspace: new Map(), project: new Map() });
  const [exemptionsLoading, setExemptionsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingExemption, setEditingExemption] = useState<ExemptionRecord | null>(null);

  const loadExemptions = async () => {
    if (!organizationId) return;
    setExemptionsLoading(true);
    try {
      const rows = await api.organization(organizationId).policyExemption().select(POLICY_EXEMPTION_FIELDS);
      const workspaceIds = [...new Set(rows.flatMap((row) => (row.workspace ? [row.workspace.id] : [])))];
      const projectIds = [...new Set(rows.flatMap((row) => (row.project ? [row.project.id] : [])))];
      const [workspaceNames, projectNames] = await Promise.all([
        readNames(workspaceIds, (scopeIds) =>
          api
            .organization(organizationId)
            .workspace()
            .select(WORKSPACE_NAME_SELECTION)
            .where((w) => w.id.in(scopeIds))
        ),
        readNames(projectIds, (scopeIds) =>
          api
            .organization(organizationId)
            .project()
            .select(PROJECT_NAME_SELECTION)
            .where((p) => p.id.in(scopeIds))
        ),
      ]);
      setExemptions(rows);
      setScopeNames({ workspace: workspaceNames, project: projectNames });
    } catch {
      // The table keeps whatever exemptions it last loaded.
    } finally {
      setExemptionsLoading(false);
    }
  };

  useEffect(() => {
    loadExemptions();
  }, [organizationId, workspaceId]);

  const workspaceExemptions = useMemo<ExemptionRecord[]>(() => {
    return exemptions
      .filter((item) => {
        const wsId = item.workspace?.id;
        const projId = item.project?.id;

        if (wsId && wsId === workspaceId) return true;
        if (projId && projId === workspaceProjectId) return true;
        if (!wsId && !projId) return true;
        return false;
      })
      .map((item) => {
        const psId = item.policySet?.id;
        const wsId = item.workspace?.id;
        const projId = item.project?.id;

        let scopeType: "ORGANIZATION" | "PROJECT" | "WORKSPACE" = "ORGANIZATION";
        if (wsId) scopeType = "WORKSPACE";
        else if (projId) scopeType = "PROJECT";

        return {
          ...item,
          ruleId: item.ruleId || "",
          policySetName: item.policySet?.name || psId || "Policy Set",
          ticketReference: item.ticketReference || "",
          justification: item.justification || "",
          expiresAt: item.expiresAt || null,
          scopeType,
          workspaceName: wsId ? scopeNames.workspace.get(wsId) : undefined,
          projectName: projId ? scopeNames.project.get(projId) : undefined,
          isInherited: wsId !== workspaceId,
        };
      });
  }, [exemptions, scopeNames, workspaceId, workspaceProjectId]);

  const handleCreateExemption = () => {
    setModalMode("create");
    setEditingExemption(null);
    setModalVisible(true);
  };

  const handleEditExemption = (rec: ExemptionRecord) => {
    setModalMode("edit");
    setEditingExemption(rec);
    setModalVisible(true);
  };

  const handleDeleteExemption = async (rec: ExemptionRecord) => {
    try {
      await axiosInstance.delete(`policy_exemption/${rec.id}`);
      message.success(`Policy exemption for ${rec.ruleId} revoked successfully`);
      loadExemptions();
      onWorkspaceUpdate?.();
    } catch (err) {
      message.error(getErrorMessage(err) || "Failed to revoke exemption");
    }
  };

  const canEvaluate = manageWorkspace || planJob;
  const hasCompletedRun = Boolean(lastJobStatus && lastJobStatus !== "NeverExecuted");

  const getDisabledReason = (): string | undefined => {
    if (!canEvaluate) {
      return "You need permission to manage this workspace or plan runs to evaluate policies.";
    }
    const blockers = [
      isLocked && "This workspace is locked. Unlock it to evaluate policies.",
      !hasCompletedRun && "This workspace has no completed run with a plan yet. Run a plan first.",
    ].filter(Boolean);
    return blockers.length > 0 ? blockers.join(" ") : undefined;
  };

  const disabledReason = getDisabledReason();
  const isDisabled = Boolean(disabledReason);

  const handleTriggerEvaluation = () => {
    if (isDisabled) return;

    setLoading(true);
    const origin = apiUrl("");
    axiosInstance
      .post<unknown>(`${origin}/policy/v1/organization/${organizationId}/workspace/${workspaceId}/evaluation`)
      .then((response) => {
        message.success("Policy evaluation dispatched successfully");
        if (onWorkspaceUpdate) {
          onWorkspaceUpdate();
        }
        const jobId = isRecord(response.data) ? response.data.jobId : undefined;
        if (typeof jobId === "string" && jobId) {
          navigate(`/organizations/${organizationId}/workspaces/${workspaceId}/runs/${jobId}`);
        }
      })
      .catch((error: unknown) => {
        const errorMsg = evaluationErrorMessage(error) || "Failed to dispatch policy evaluation";
        message.error("Policy evaluation failed: " + errorMsg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const renderComplianceDescription = () => {
    switch (complianceStatus) {
      case "COMPLIANT":
        return "All evaluated OPA policy checks passed without any blocking violations.";
      case "NON_COMPLIANT":
        return "Violations were detected during policy checks. Review recent runs for policy violation details.";
      case "EXEMPTED":
        return "Violations exist but have been waived by active, unexpired policy exemptions.";
      case "UNKNOWN":
      default:
        return "No policy evaluation has been recorded yet for this workspace.";
    }
  };

  return (
    <div className="generalSettings">
      <SettingsPageHeader
        title="Policies"
        description="Check this workspace against your organization's OPA policies and see which rules are waived."
      />

      <SettingsSection title="Compliance status" description={renderComplianceDescription()}>
        <PolicyStatusTag status={complianceStatus} />
      </SettingsSection>

      <SettingsSection
        title="Evaluate policies"
        description="Checks the last completed plan against every policy that applies to this workspace. Nothing is planned or applied, and no infrastructure changes."
      >
        {disabledReason && canEvaluate && (
          <Alert title={disabledReason} type="warning" showIcon className="workspace-policies-alert" />
        )}
        <Tooltip title={canEvaluate ? undefined : disabledReason}>
          <span>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleTriggerEvaluation}
              loading={loading}
              disabled={isDisabled}
            >
              Evaluate policies now
            </Button>
          </span>
        </Tooltip>
      </SettingsSection>

      <SettingsSection
        maxWidth="100%"
        title="Policy exemptions"
        description="Rules waived for this workspace, including exemptions inherited from the organization and project."
        extra={
          <Tooltip title={!canManagePolicies ? "Requires policy management permission" : undefined}>
            <span>
              <Button
                icon={<PlusOutlined />}
                onClick={handleCreateExemption}
                disabled={!canManagePolicies}
                data-testid="add-workspace-exemption-btn"
              >
                Add exemption
              </Button>
            </span>
          </Tooltip>
        }
      >
        <PolicyExemptionTable
          items={workspaceExemptions}
          loading={exemptionsLoading}
          managePermission={canManagePolicies}
          currentWorkspaceId={workspaceId}
          onEdit={handleEditExemption}
          onDelete={handleDeleteExemption}
          pageSize={5}
        />
      </SettingsSection>

      {organizationId && (
        <PolicyExemptionModal
          visible={modalVisible}
          mode={modalMode}
          lockedScope={{
            scopeType: "WORKSPACE",
            workspaceId: workspaceId,
            workspaceName: workspace?.name,
          }}
          initialData={
            editingExemption
              ? {
                  id: editingExemption.id,
                  policySetId: editingExemption.policySet?.id,
                  ruleId: editingExemption.ruleId,
                  scopeType: editingExemption.scopeType,
                  workspaceId: editingExemption.workspace?.id,
                  projectId: editingExemption.project?.id,
                  ticketReference: editingExemption.ticketReference,
                  justification: editingExemption.justification,
                  expiresAt: editingExemption.expiresAt,
                }
              : undefined
          }
          organizationId={organizationId}
          onCancel={() => setModalVisible(false)}
          onSuccess={() => {
            setModalVisible(false);
            loadExemptions();
            onWorkspaceUpdate?.();
          }}
        />
      )}
    </div>
  );
};
