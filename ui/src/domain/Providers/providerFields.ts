import { fields } from "../generated/apiPaths";
import { ids, type Row } from "../api/fieldSelection";

export const VERSION_FIELDS = fields.version("versionNumber", { provider: ids });

// The registry list shows these provider fields plus each provider's versions, from which it works out the newest.
export const PROVIDER_FIELDS = fields.provider("name", "description", "registryNamespace", {
  version: VERSION_FIELDS,
});

/** A provider as the registry lists it, with the newest version number worked out from its versions. */
export type FlatProvider = Omit<Row<typeof PROVIDER_FIELDS>, "version"> & { latestVersion?: string };
