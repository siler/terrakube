import React, { useEffect, useMemo, useState } from "react";
import { Button, List, Tabs, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRequiredParam } from "@/hooks/useRequiredParam";
import axiosInstance, { getErrorMessage } from "../../config/axiosConfig";
import { api } from "../generated/apiPaths";
import { POLICY_SET_LIST_FIELDS, type PolicySetRow } from "./policySetFields";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Loading } from "@/components/feedback/Loading";
import { EmptyState } from "@/components/feedback/EmptyState";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";
import { CreateEditPolicySet } from "./CreateEditPolicySet";
import { PolicyExemptionsSettings } from "./PolicyExemptions";
import {
  PolicySetCard,
  PolicySetFilter,
  PolicySetTable,
  PolicySetsViewMode,
  getStoredPolicySetsViewMode,
} from "./components";
import "./Settings.css";
import "./PolicySets.css";

type Props = {
  editorMode?: "new" | "edit";
  editorId?: string;
  managePermission?: boolean;
};

export const PolicySetsSettings: React.FC<Props> = ({ editorMode, editorId, managePermission = true }) => {
  const orgid = useRequiredParam("orgid");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "sets";

  const [policySets, setPolicySets] = useState<PolicySetRow[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PolicySetRow | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [scopeFilter, setScopeFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<PolicySetsViewMode>(getStoredPolicySetsViewMode);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notificationConfigs, setNotificationConfigs] = useState<
    Record<string, { id: string; name: string; channelType: string }>
  >({});

  const loadPolicySets = async () => {
    setLoading(true);
    try {
      const rows = await api.policy_set().select(POLICY_SET_LIST_FIELDS);
      // Filter by organization if needed
      const orgItems = rows.filter((row) => !row.organization || row.organization.id === orgid);
      setPolicySets(orgItems);

      const counts: Record<string, number> = {};
      const notifConfigs: Record<string, { id: string; name: string; channelType: string }> = {};
      orgItems.forEach((row) => {
        counts[row.id] = row.attachments?.length ?? 0;
        if (row.notificationConfiguration) {
          notifConfigs[row.notificationConfiguration.id] = {
            id: row.notificationConfiguration.id,
            name: row.notificationConfiguration.name || row.notificationConfiguration.id,
            channelType: row.notificationConfiguration.channelType || "",
          };
        }
      });
      setAttachmentCounts(counts);
      setNotificationConfigs(notifConfigs);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!editorMode) {
      void loadPolicySets();
    }
  }, [editorMode, orgid]);

  const handleDelete = async (id: string) => {
    try {
      await axiosInstance.delete(`policy_set/${id}`);
      message.success("Policy set deleted successfully");
      setPendingDelete(null);
      void loadPolicySets();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const filteredPolicySets = useMemo(() => {
    return policySets.filter((row) => {
      const name = (row.name || "").toLowerCase();
      const desc = (row.description || "").toLowerCase();
      const repo = (row.repository || "").toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      // 1. Search by name, description, or repository
      if (q && !name.includes(q) && !desc.includes(q) && !repo.includes(q)) {
        return false;
      }

      // 2. Filter by policy category / enforcement level
      if (categoryFilter !== "ALL") {
        if ((row.enforcementLevel || "").toUpperCase() !== categoryFilter) {
          return false;
        }
      }

      // 3. Filter by scope (Global vs Attached)
      if (scopeFilter === "GLOBAL" && !row.global) {
        return false;
      }
      if (scopeFilter === "ATTACHED" && row.global) {
        return false;
      }

      return true;
    });
  }, [policySets, searchQuery, categoryFilter, scopeFilter]);

  const hasActiveFilters = searchQuery.trim() !== "" || categoryFilter !== "ALL" || scopeFilter !== "ALL";

  const handleResetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("ALL");
    setScopeFilter("ALL");
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val);
    setCurrentPage(1);
  };

  const handleScopeChange = (val: string) => {
    setScopeFilter(val);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
  };

  if (editorMode === "new") {
    return <CreateEditPolicySet mode="create" managePermission={managePermission} />;
  }

  if (editorMode === "edit") {
    return <CreateEditPolicySet mode="edit" policySetId={editorId} managePermission={managePermission} />;
  }

  const openCreate = () => navigate(`/organizations/${orgid}/settings/policies/new`);
  const openEdit = (id: string) => navigate(`/organizations/${orgid}/settings/policies/edit/${id}`);

  const renderPolicySets = () => {
    if (loading) {
      return <Loading loading description="Loading policy sets..." />;
    }
    if (policySets.length === 0) {
      return (
        <EmptyState simple description="No policy sets yet. Create one to check plans against OPA policies.">
          {managePermission && (
            <Button icon={<PlusOutlined />} onClick={openCreate}>
              Create policy set
            </Button>
          )}
        </EmptyState>
      );
    }
    return (
      <>
        <PolicySetFilter
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          categoryFilter={categoryFilter}
          onCategoryChange={handleCategoryChange}
          scopeFilter={scopeFilter}
          onScopeChange={handleScopeChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onResetFilters={handleResetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {filteredPolicySets.length === 0 ? (
          <EmptyState simple description="No policy sets match these filters.">
            <Button onClick={handleResetFilters} data-testid="empty-clear-filters-btn">
              Clear filters
            </Button>
          </EmptyState>
        ) : viewMode === "compact" ? (
          <PolicySetTable
            policySets={filteredPolicySets}
            attachmentCounts={attachmentCounts}
            managePermission={managePermission}
            onEdit={openEdit}
            onDelete={(item) => setPendingDelete(item)}
            orgid={orgid}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            notificationConfigs={notificationConfigs}
          />
        ) : (
          <List
            dataSource={filteredPolicySets}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredPolicySets.length,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              onChange: handlePageChange,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} policy sets`,
            }}
            renderItem={(row) => {
              return (
                <PolicySetCard
                  key={row.id}
                  item={row}
                  attachmentsCount={attachmentCounts[row.id] ?? 0}
                  managePermission={managePermission}
                  onEdit={openEdit}
                  onDelete={(item) => setPendingDelete(item)}
                  orgid={orgid}
                  notificationConfig={
                    row.notificationConfiguration ? notificationConfigs[row.notificationConfiguration.id] : undefined
                  }
                />
              );
            }}
          />
        )}
      </>
    );
  };

  return (
    <div>
      <SettingsPageHeader
        title="Policy sets"
        description="Check every plan against OPA policies, and waive specific rules with exemptions."
        divider={false}
        actions={
          activeTab === "sets" ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
              disabled={!managePermission}
              data-testid="add-policy-set-btn"
            >
              Create policy set
            </Button>
          ) : null
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
        items={[
          {
            key: "sets",
            label: `Policy sets (${policySets.length})`,
            children: renderPolicySets(),
          },
          {
            key: "exemptions",
            label: "Exemptions",
            children: <PolicyExemptionsSettings managePermission={managePermission} />,
          },
        ]}
      />

      <DeleteConfirmationModal
        open={pendingDelete !== null}
        title="Delete policy set"
        message={`Workspaces will no longer be checked against ${pendingDelete?.name}. Its attachments, parameters and exemptions are deleted too. This cannot be undone.`}
        confirmValue={pendingDelete?.name}
        okText="Delete policy set"
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
