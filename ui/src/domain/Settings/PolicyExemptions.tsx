import React, { useEffect, useMemo, useState } from "react";
import { Button, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api, fields } from "../generated/apiPaths";
import { ids } from "../api/fieldSelection";
import { readNames, type ScopeNames } from "../policyScopeNames";
import { POLICY_EXEMPTION_FIELDS, type ExemptionRow } from "./policyExemptionFields";
import {
  ExemptionRecord,
  ExemptionScopeFilter,
  ExemptionStatusFilter,
  PolicyExemptionFilter,
  PolicyExemptionModal,
  PolicyExemptionTable,
} from "./components";
import { EmptyState } from "@/components/feedback/EmptyState";
import "./PolicySets.css";

type Props = {
  managePermission?: boolean;
};

// The picker lists a policy set's name; the org filter counts on the organization linkage.
const POLICY_SET_PICKER_FIELDS = fields.policy_set("name", { organization: ids });
const WORKSPACE_NAME_SELECTION = fields.workspace("name");
const PROJECT_NAME_SELECTION = fields.project("name");

export const PolicyExemptionsSettings: React.FC<Props> = ({ managePermission = true }) => {
  const { orgid } = useParams<{ orgid: string }>();

  const [rawExemptions, setRawExemptions] = useState<ExemptionRow[]>([]);
  const [scopeNames, setScopeNames] = useState<ScopeNames>({ workspace: new Map(), project: new Map() });
  const [policySets, setPolicySets] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExemptionStatusFilter>("ALL");
  const [scopeFilter, setScopeFilter] = useState<ExemptionScopeFilter>("ALL");
  const [policySetFilter, setPolicySetFilter] = useState("ALL");

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingExemption, setEditingExemption] = useState<ExemptionRecord | null>(null);

  const loadExemptions = async () => {
    if (!orgid) return;
    setLoading(true);
    try {
      // 1. Fetch policy sets for policySet filter dropdown
      try {
        const rows = await api.policy_set().select(POLICY_SET_PICKER_FIELDS);
        setPolicySets(
          rows
            .filter((row) => !row.organization || row.organization.id === orgid)
            .map((row) => ({ id: row.id, name: row.name || row.id }))
        );
      } catch {
        // Fallback if policy set query fails
      }

      // 2. Fetch exemptions, then the names of what they scope to
      const rows = await api.organization(orgid).policyExemption().select(POLICY_EXEMPTION_FIELDS);
      const workspaceIds = [...new Set(rows.flatMap((row) => (row.workspace ? [row.workspace.id] : [])))];
      const projectIds = [...new Set(rows.flatMap((row) => (row.project ? [row.project.id] : [])))];
      const [workspaceNames, projectNames] = await Promise.all([
        readNames(workspaceIds, (scopeIds) =>
          api
            .organization(orgid)
            .workspace()
            .select(WORKSPACE_NAME_SELECTION)
            .where((w) => w.id.in(scopeIds))
        ),
        readNames(projectIds, (scopeIds) =>
          api
            .organization(orgid)
            .project()
            .select(PROJECT_NAME_SELECTION)
            .where((p) => p.id.in(scopeIds))
        ),
      ]);
      setRawExemptions(rows);
      setScopeNames({ workspace: workspaceNames, project: projectNames });
    } catch (err) {
      message.error(getErrorMessage(err) || "Failed to load policy exemptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExemptions();
  }, [orgid]);

  // Transform raw Elide exemptions to UI records
  const exemptionRecords = useMemo<ExemptionRecord[]>(() => {
    return rawExemptions.map((row) => {
      const psId = row.policySet?.id;
      const wsId = row.workspace?.id;
      const projId = row.project?.id;

      const psName = policySets.find((p) => p.id === psId)?.name || psId || "Policy Set";
      const wsName = wsId ? scopeNames.workspace.get(wsId) : undefined;
      const projName = projId ? scopeNames.project.get(projId) : undefined;

      let scopeType: "ORGANIZATION" | "PROJECT" | "WORKSPACE" = "ORGANIZATION";
      if (wsId) {
        scopeType = "WORKSPACE";
      } else if (projId) {
        scopeType = "PROJECT";
      }

      return {
        ...row,
        ruleId: row.ruleId || "",
        policySetName: psName,
        ticketReference: row.ticketReference || "",
        justification: row.justification || "",
        expiresAt: row.expiresAt || null,
        scopeType,
        workspaceName: wsName,
        projectName: projName,
      };
    });
  }, [rawExemptions, scopeNames, policySets]);

  // Compute status counts
  const statusCounts = useMemo(() => {
    let all = 0;
    let active = 0;
    let expiringSoon = 0;
    let expired = 0;
    let indefinite = 0;

    const now = new Date();

    exemptionRecords.forEach((record) => {
      all++;
      if (!record.expiresAt) {
        indefinite++;
        active++;
      } else {
        const expDate = new Date(record.expiresAt);
        const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          expired++;
        } else if (diffDays <= 7) {
          expiringSoon++;
          active++;
        } else {
          active++;
        }
      }
    });

    return { all, active, expiringSoon, expired, indefinite };
  }, [exemptionRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    const now = new Date();

    return exemptionRecords.filter((rec) => {
      // 1. Status filter
      if (statusFilter === "INDEFINITE") {
        if (rec.expiresAt) return false;
      } else if (statusFilter === "EXPIRED") {
        if (!rec.expiresAt) return false;
        const diffDays = Math.ceil((new Date(rec.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) return false;
      } else if (statusFilter === "EXPIRING_SOON") {
        if (!rec.expiresAt) return false;
        const diffDays = Math.ceil((new Date(rec.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays > 7) return false;
      } else if (statusFilter === "ACTIVE") {
        if (rec.expiresAt) {
          const diffDays = Math.ceil((new Date(rec.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) return false;
        }
      }

      // 2. Scope filter
      if (scopeFilter !== "ALL" && rec.scopeType !== scopeFilter) {
        return false;
      }

      // 3. Policy set filter
      if (policySetFilter !== "ALL" && rec.policySet?.id !== policySetFilter) {
        return false;
      }

      // 4. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRule = rec.ruleId.toLowerCase().includes(q);
        const matchesTicket = rec.ticketReference.toLowerCase().includes(q);
        const matchesJustification = rec.justification.toLowerCase().includes(q);
        const matchesSetName = rec.policySetName.toLowerCase().includes(q);
        const matchesWs = rec.workspaceName?.toLowerCase().includes(q);
        const matchesProj = rec.projectName?.toLowerCase().includes(q);

        if (!matchesRule && !matchesTicket && !matchesJustification && !matchesSetName && !matchesWs && !matchesProj) {
          return false;
        }
      }

      return true;
    });
  }, [exemptionRecords, statusFilter, scopeFilter, policySetFilter, searchQuery]);

  const handleCreate = () => {
    setModalMode("create");
    setEditingExemption(null);
    setModalVisible(true);
  };

  const handleEdit = (record: ExemptionRecord) => {
    setModalMode("edit");
    setEditingExemption(record);
    setModalVisible(true);
  };

  const handleDelete = async (record: ExemptionRecord) => {
    try {
      await axiosInstance.delete(`policy_exemption/${record.id}`);
      message.success(`Policy exemption for ${record.ruleId} revoked successfully`);
      void loadExemptions();
    } catch (err) {
      message.error(getErrorMessage(err) || "Failed to revoke policy exemption");
    }
  };

  const createButton = (primary: boolean) => (
    <Button
      type={primary ? "primary" : "default"}
      icon={<PlusOutlined />}
      onClick={handleCreate}
      disabled={!managePermission}
      data-testid={primary ? "add-exemption-btn" : undefined}
    >
      Create exemption
    </Button>
  );

  return (
    <div>
      <div className="policy-list-header">
        <div>
          <Typography.Title level={4}>Exemptions ({exemptionRecords.length})</Typography.Title>
          <Typography.Text type="secondary">
            Time-bounded waivers for specific rules, recorded with a ticket and a justification.
          </Typography.Text>
        </div>
        {createButton(true)}
      </div>

      {!loading && exemptionRecords.length === 0 ? (
        <EmptyState simple description="No exemptions. Every rule applies to every workspace it covers.">
          {managePermission && createButton(false)}
        </EmptyState>
      ) : (
        <>
          <PolicyExemptionFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            scopeFilter={scopeFilter}
            onScopeFilterChange={setScopeFilter}
            policySetFilter={policySetFilter}
            onPolicySetFilterChange={setPolicySetFilter}
            policySets={policySets}
            statusCounts={statusCounts}
          />

          <PolicyExemptionTable
            items={filteredRecords}
            loading={loading}
            managePermission={managePermission}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </>
      )}

      {orgid && (
        <PolicyExemptionModal
          visible={modalVisible}
          mode={modalMode}
          initialData={
            editingExemption
              ? {
                  id: editingExemption.id,
                  policySetId: editingExemption.policySet?.id || "",
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
          organizationId={orgid}
          onCancel={() => setModalVisible(false)}
          onSuccess={() => {
            setModalVisible(false);
            void loadExemptions();
          }}
        />
      )}
    </div>
  );
};
