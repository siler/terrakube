import type { OrgPermissionSet } from "@/modules/permissions/useOrgPermissions";

type OrgPermissionsResult = { permissions: OrgPermissionSet; loading: boolean };

/** A `useOrgPermissions` result denying every flag except those in `granted`. */
export const orgPermissionsResult = (
  granted: Partial<OrgPermissionSet> = {},
  loading = false
): OrgPermissionsResult => ({
  permissions: {
    manageState: false,
    manageWorkspace: false,
    manageModule: false,
    manageProvider: false,
    manageVcs: false,
    manageTemplate: false,
    manageCollection: false,
    manageJob: false,
    planJob: false,
    approveJob: false,
    managePermission: false,
    managePolicies: false,
    ...granted,
  },
  loading,
});
