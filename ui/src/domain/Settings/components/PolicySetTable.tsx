import React from "react";
import { Button, Flex, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, GlobalOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { type PolicySetRow } from "../policySetFields";
import { attachmentsLabel, enforcementLabel, renderEnforcementTag } from "./policySetLabels";
import "../PolicySets.css";
import "./PolicyComponents.css";

const { Text } = Typography;

type Props = {
  policySets: PolicySetRow[];
  attachmentCounts: Record<string, number>;
  managePermission: boolean;
  onEdit: (id: string) => void;
  onDelete: (item: PolicySetRow) => void;
  orgid: string;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  notificationConfigs?: Record<string, { id: string; name: string; channelType?: string }>;
};

export const PolicySetTable: React.FC<Props> = ({
  policySets,
  attachmentCounts,
  managePermission,
  onEdit,
  onDelete,
  orgid,
  currentPage,
  pageSize,
  onPageChange,
  notificationConfigs,
}) => {
  const columns: ColumnsType<PolicySetRow> = [
    {
      title: "Policy set",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => (a.name || "").localeCompare(b.name || ""),
      render: (_: string, record: PolicySetRow) => {
        return (
          <div className="policy-cell-stack">
            <Link
              to={`/organizations/${orgid}/settings/policies/edit/${record.id}`}
              className="policy-set-table-link"
              data-testid={`policy-set-table-link-${record.id}`}
            >
              {record.name}
            </Link>
            {record.description && (
              <Text type="secondary" className="policy-cell-secondary" ellipsis={{ tooltip: record.description }}>
                {record.description}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Enforcement",
      dataIndex: "enforcementLevel",
      key: "enforcementLevel",
      width: 170,
      render: (level: string, record: PolicySetRow) => {
        return (
          <Flex vertical gap={4} align="flex-start">
            {renderEnforcementTag(level)}
            {record.shadowEnforcementLevel && <Tag>Shadow: {enforcementLabel(record.shadowEnforcementLevel)}</Tag>}
          </Flex>
        );
      },
    },
    {
      title: "Scope",
      key: "scope",
      width: 190,
      render: (_: unknown, record: PolicySetRow) => {
        const notifId = record.notificationConfiguration?.id;
        const notif = notifId && notificationConfigs ? notificationConfigs[notifId] : null;
        return (
          <div className="policy-cell-stack">
            {record.global ? (
              <span>
                <GlobalOutlined /> Global
              </span>
            ) : (
              <span>{attachmentsLabel(attachmentCounts[record.id] ?? 0)}</span>
            )}
            {record.overrideTeam && (
              <Text type="secondary" className="policy-cell-secondary">
                Override: {record.overrideTeam}
              </Text>
            )}
            {notif && (
              <Text
                type="secondary"
                className="policy-cell-secondary"
                ellipsis={{ tooltip: notif.name }}
                data-testid={`policy-set-table-notif-${record.id}`}
              >
                {notif.name}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Source",
      key: "repository",
      render: (_: unknown, record: PolicySetRow) => {
        const ref = [record.branch, record.folder].filter(Boolean).join(" · ");
        return (
          <div className="policy-cell-stack">
            {record.repository && (
              <Text className="policy-mono" ellipsis={{ tooltip: record.repository }}>
                {record.repository}
              </Text>
            )}
            {ref && (
              <Text type="secondary" className="policy-mono" ellipsis={{ tooltip: ref }}>
                {ref}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 96,
      align: "right",
      render: (_: unknown, record: PolicySetRow) => (
        <Flex gap={8} justify="flex-end">
          <Button
            icon={<EditOutlined />}
            onClick={() => onEdit(record.id)}
            disabled={!managePermission}
            aria-label={`Edit ${record.name}`}
            data-testid={`table-edit-policy-set-btn-${record.id}`}
          />
          <Button
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record)}
            disabled={!managePermission}
            aria-label={`Delete ${record.name}`}
            data-testid={`table-delete-policy-set-btn-${record.id}`}
          />
        </Flex>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={policySets}
      tableLayout="fixed"
      scroll={{ x: 720 }}
      pagination={{
        current: currentPage,
        pageSize: pageSize,
        total: policySets.length,
        showSizeChanger: true,
        pageSizeOptions: ["10", "20", "50"],
        onChange: onPageChange,
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} policy sets`,
      }}
      data-testid="policy-sets-compact-table"
    />
  );
};
