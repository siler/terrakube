import { fields } from "../generated/apiPaths";
import type { Row } from "../api/fieldSelection";

// The registry list shows exactly these module fields.
export const MODULE_FIELDS = fields.module(
  "name",
  "description",
  "provider",
  "latestVersion",
  "downloadQuantity",
  "updatedDate"
);

/** A module as the registry lists it. */
export type FlatModule = Row<typeof MODULE_FIELDS>;
