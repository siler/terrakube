import React from "react";
import { Button, Flex, Tag, Typography } from "antd";
import {
  BellOutlined,
  BranchesOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  GlobalOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { type PolicySetRow } from "../policySetFields";
import { attachmentsLabel, enforcementLabel, renderEnforcementTag } from "./policySetLabels";
import "../PolicySets.css";

type Props = {
  item: PolicySetRow;
  attachmentsCount: number;
  managePermission: boolean;
  onEdit: (id: string) => void;
  onDelete: (item: PolicySetRow) => void;
  orgid: string;
  notificationConfig?: { name: string; channelType?: string };
};

// A flat resource card: 1px border, no shadow, outlined icon actions named after the policy set.
export const PolicySetCard: React.FC<Props> = ({
  item,
  attachmentsCount,
  managePermission,
  onEdit,
  onDelete,
  orgid,
  notificationConfig,
}) => {
  return (
    <article className="policy-set-card" data-testid={`policy-set-card-${item.id}`}>
      <div className="policy-set-card-body">
        <div className="policy-set-card-title">
          <Link
            to={`/organizations/${orgid}/settings/policies/edit/${item.id}`}
            data-testid={`policy-set-title-link-${item.id}`}
          >
            {item.name}
          </Link>
          {renderEnforcementTag(item.enforcementLevel)}
          {item.shadowEnforcementLevel && <Tag>Shadow: {enforcementLabel(item.shadowEnforcementLevel)}</Tag>}
          {item.global ? <Tag icon={<GlobalOutlined />}>Global</Tag> : <Tag>{attachmentsLabel(attachmentsCount)}</Tag>}
        </div>

        {item.description && (
          <Typography.Paragraph type="secondary" className="policy-set-card-description">
            {item.description}
          </Typography.Paragraph>
        )}

        <div className="policy-set-card-meta">
          {item.repository && (
            <span className="policy-mono">
              <GlobalOutlined />
              {item.repository}
            </span>
          )}
          {item.branch && (
            <span className="policy-mono">
              <BranchesOutlined />
              {item.branch}
            </span>
          )}
          {item.folder && (
            <span className="policy-mono">
              <FolderOutlined />
              {item.folder}
            </span>
          )}
          {item.overrideTeam && (
            <span>
              <TeamOutlined />
              Override team: {item.overrideTeam}
            </span>
          )}
          {notificationConfig && (
            <span data-testid={`policy-set-notification-${item.id}`}>
              <BellOutlined />
              Notification: {notificationConfig.name}
            </span>
          )}
        </div>
      </div>

      <Flex gap={8}>
        <Button
          icon={<EditOutlined />}
          onClick={() => onEdit(item.id)}
          disabled={!managePermission}
          aria-label={`Edit ${item.name}`}
          data-testid={`edit-policy-set-btn-${item.id}`}
        />
        <Button
          icon={<DeleteOutlined />}
          onClick={() => onDelete(item)}
          disabled={!managePermission}
          aria-label={`Delete ${item.name}`}
          data-testid={`delete-policy-set-btn-${item.id}`}
        />
      </Flex>
    </article>
  );
};
