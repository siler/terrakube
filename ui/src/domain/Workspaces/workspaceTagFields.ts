import { fields, type Row } from "../api";

// Shared by the tag editor's read and the binding type the workspace list and chips use.
export const WORKSPACETAG_FIELDS = fields.workspacetag("tagId", "value");

export type WorkspaceTagRow = Row<typeof WORKSPACETAG_FIELDS>;
