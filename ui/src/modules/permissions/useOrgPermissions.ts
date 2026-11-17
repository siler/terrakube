import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axiosInstance from "../../config/axiosConfig";
import { isRecord } from "@/modules/utils/guards";

/**
 * Represents the full set of permissions returned by the
 * /access-token/v1/teams/permissions/organization/{orgId} endpoint.
 */
export interface OrgPermissionSet {
  manageState: boolean;
  manageWorkspace: boolean;
  manageModule: boolean;
  manageProvider: boolean;
  manageVcs: boolean;
  manageTemplate: boolean;
  manageCollection: boolean;
  manageJob: boolean;
  planJob: boolean;
  approveJob: boolean;
  managePermission: boolean;
  managePolicies: boolean;
}

const defaultPermissions: OrgPermissionSet = {
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
};

const permissionKeys = [
  "manageState",
  "manageWorkspace",
  "manageModule",
  "manageProvider",
  "manageVcs",
  "manageTemplate",
  "manageCollection",
  "manageJob",
  "planJob",
  "approveJob",
  "managePermission",
  "managePolicies",
] as const satisfies readonly (keyof OrgPermissionSet)[];

/**
 * Reads the TeamTokenController PermissionSet body. Any flag that is missing or not a boolean is denied,
 * except `managePolicies`, which falls back to `managePermission` for APIs that predate the flag.
 */
export const parseOrgPermissions = (body: unknown): OrgPermissionSet => {
  if (!isRecord(body)) {
    return defaultPermissions;
  }
  const permissions = { ...defaultPermissions };
  for (const key of permissionKeys) {
    const value = body[key];
    if (typeof value === "boolean") {
      permissions[key] = value;
    }
  }
  if (typeof body.managePolicies !== "boolean") {
    permissions.managePolicies = permissions.managePermission;
  }
  return permissions;
};

/**
 * Hook that fetches organization-level permissions for the current user.
 * Uses the orgid from the URL params.
 *
 * Returns { permissions, loading } where permissions contains all the
 * granular boolean flags from the backend PermissionSet.
 */
export function useOrgPermissions(orgIdOverride?: string) {
  const { orgid } = useParams<{ orgid: string }>();
  const orgId = orgIdOverride ?? orgid;
  const [permissions, setPermissions] = useState<OrgPermissionSet>(defaultPermissions);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setPermissions(defaultPermissions);
    setLoading(true);

    const url = `${
      new URL(window._env_.REACT_APP_TERRAKUBE_API_URL).origin
    }/access-token/v1/teams/permissions/organization/${orgId}`;

    axiosInstance
      .get<unknown>(url)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPermissions(parseOrgPermissions(response.data));
      })
      .catch(() => {
        // Keep default (all false) on error — user sees read-only UI
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { permissions, loading };
}
