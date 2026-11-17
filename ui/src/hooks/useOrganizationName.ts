import { useEffect, useSyncExternalStore } from "react";
import { ORGANIZATION_NAME } from "@/config/actionTypes";
import { isOrgId } from "@/config/orgId";
import { api } from "@/domain/generated/apiPaths";

// Names are cached per organization id, so a page never shows the name of another organization.
const names = new Map<string, string>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

const storageKey = (orgId: string) => `${ORGANIZATION_NAME}:${orgId}`;

function readName(orgId: string): string | undefined {
  if (!names.has(orgId)) {
    try {
      const stored = sessionStorage.getItem(storageKey(orgId));
      if (stored) names.set(orgId, stored);
    } catch {
      // Storage unavailable: the in-memory cache still works.
    }
  }
  return names.get(orgId);
}

export function cacheOrganizationName(orgId: string, name: string) {
  names.set(orgId, name);
  try {
    sessionStorage.setItem(storageKey(orgId), name);
  } catch {
    // Storage unavailable: the in-memory cache still works.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The name of the organization with this id, or undefined while it loads (or if it cannot be read). */
export function useOrganizationName(orgId: string | null | undefined): string | undefined {
  const id = isOrgId(orgId) ? orgId : undefined;
  const name = useSyncExternalStore(subscribe, () => (id ? readName(id) : undefined));

  useEffect(() => {
    if (!id || readName(id) || loading.has(id)) return;
    loading.add(id);
    void (async () => {
      try {
        const row = await api.organization(id).select("name");
        if (row.name) cacheOrganizationName(id, row.name);
      } catch {
        // Leave the name empty; the page shows its own error for an unreadable organization.
      } finally {
        loading.delete(id);
      }
    })();
  }, [id]);

  return name;
}
