import { Alert, Flex, Typography } from "antd";
import { useState } from "react";
import { ApiResponse } from "@/modules/api/types";
import { GridToken } from "./types";
import TokenGridItem from "./TokenGridItem";
import "./TokenList.css";
import useApiRequest from "@/modules/api/useApiRequest";
import DeleteConfirmationModal from "@/components/modals/DeleteConfirmationModal/DeleteConfirmationModal";

type Props = {
  tokens: GridToken[];
  onDeleted: () => void;
  action: (id: string) => Promise<ApiResponse<unknown>>;
  // Hide the count heading when the page already titles the section.
  hideTitle?: boolean;
};

export default function TokenGrid({ tokens, action, onDeleted, hideTitle }: Props) {
  const [pendingDelete, setPendingDelete] = useState<GridToken | null>(null);
  const { loading, execute, error } = useApiRequest({
    action: action,
    returnsData: false,
    onReturn: () => {
      onDeleted();
    },
  });

  return (
    <div className="token-list">
      {!hideTitle && (
        <Typography.Title level={4} className="list-header">
          Tokens ({tokens.length})
        </Typography.Title>
      )}
      {error && <Alert title="Failed to delete token" type="error" showIcon banner />}
      <Flex vertical gap="middle" className={error !== undefined ? "token-list-items-after-error" : undefined}>
        {tokens.map((tkn) => (
          <TokenGridItem key={tkn.id} token={tkn} onDelete={() => setPendingDelete(tkn)} loading={loading} />
        ))}
      </Flex>
      <DeleteConfirmationModal
        open={pendingDelete !== null}
        title="Delete token"
        message={`This will permanently delete the token "${pendingDelete?.description}". This operation is irreversible.`}
        okText="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            execute(pendingDelete.id);
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
