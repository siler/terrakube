import {
  DeleteOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Flex, Typography, Tag } from "antd";
import dayjs from "dayjs";
import { GridToken } from "./types";
import { formatOrdinalDate, relativeTime } from "@/modules/utils/dates";

type Props = {
  token: GridToken;
  loading: boolean;
  onDelete: (id: string) => void;
};

export default function TokenGridItem({ token, onDelete, loading }: Props) {
  const lifetime = { days: token.days, hours: token.hours ?? 0, minutes: token.minutes ?? 0 };
  const expiryDate =
    token.createdDate && (lifetime.days > 0 || lifetime.hours > 0 || lifetime.minutes > 0)
      ? dayjs(token.createdDate).add(lifetime.days, "day").add(lifetime.hours, "hour").add(lifetime.minutes, "minute")
      : null;
  const expired = expiryDate !== null && expiryDate.isBefore(dayjs());

  // Drives the icon tile and status line colors in TokenList.css.
  const status = expired ? "expired" : expiryDate ? "expiring" : "never";

  return (
    <div className="token-item" data-status={status}>
      <span className="token-item-icon" aria-hidden="true">
        {expired ? <ExclamationCircleOutlined /> : <SafetyCertificateOutlined />}
      </span>

      <div className="token-item-body">
        <Flex gap="small" align="center" wrap>
          <Typography.Text className="token-item-name">{token.description}</Typography.Text>
          {token.source === "CLI_LOGIN" && <Tag color="geekblue">CLI login</Tag>}
        </Flex>

        <span className="token-item-status">
          {expired
            ? `This token expired ${formatOrdinalDate(expiryDate)}`
            : expiryDate
              ? `Expires ${formatOrdinalDate(expiryDate)}`
              : "Never expires"}
        </span>

        <Flex className="token-item-meta" justify="space-between" align="center" gap="middle" wrap>
          <Flex gap="small" align="center" wrap>
            <ClockCircleOutlined />
            <span>Created {relativeTime(token.createdDate) ?? "Unknown"} by user</span>
            <UserOutlined />
            <span>{token.createdBy}</span>
          </Flex>
          <span>{token.lastUsedAt ? `Last used ${relativeTime(token.lastUsedAt) ?? "recently"}` : "Never used"}</span>
        </Flex>
      </div>

      <Button
        icon={<DeleteOutlined />}
        loading={loading}
        aria-label={`Delete token ${token.description}`}
        onClick={() => onDelete(token.id)}
      />
    </div>
  );
}
