import { fields } from "../generated/apiPaths";
import type { Row } from "../api/fieldSelection";

// Shared by the tag editor's read and the binding type the workspace list and chips use.
export const WORKSPACETAG_FIELDS = fields.workspacetag("tagId", "value");

export type WorkspaceTagRow = Row<typeof WORKSPACETAG_FIELDS>;
