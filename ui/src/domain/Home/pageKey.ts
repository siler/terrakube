import type { UIMatch } from "react-router-dom";
import { isRecord } from "@/modules/utils/typeGuards";

/**
 * Route `handle` for routes that are tabs of one page. Switching between them keeps the page mounted,
 * with its loaded data, as long as the URL params stay the same, apart from those in `ignoreParams`.
 */
export type PageHandle = { page: string; ignoreParams?: readonly string[] };

const isPageHandle = (handle: unknown): handle is PageHandle =>
  isRecord(handle) &&
  typeof handle.page === "string" &&
  (handle.ignoreParams === undefined ||
    (Array.isArray(handle.ignoreParams) && handle.ignoreParams.every((name) => typeof name === "string")));

/** Routes that render a tab of the workspace page. It follows `runid` itself, so opening a run keeps it mounted. */
export const workspacePage: PageHandle = { page: "workspace", ignoreParams: ["runid"] };

/**
 * Key for the page element: changes when the route changes, unless both routes share a `page` handle,
 * and whenever a param the handle doesn't ignore changes (another organization, workspace...). Pages without
 * a handle remount on every route change, because several of them (organization settings tabs, for example)
 * load their data on mount and expect a fresh mount after a create or edit form navigates back.
 */
export function pageKey(matches: UIMatch[]): string {
  const leaf = matches[matches.length - 1];
  if (!leaf) return "";
  if (!isPageHandle(leaf.handle)) return `route:${leaf.id}:${JSON.stringify(leaf.params)}`;
  const { page, ignoreParams = [] } = leaf.handle;
  const params = Object.fromEntries(Object.entries(leaf.params).filter(([name]) => !ignoreParams.includes(name)));
  return `${page}:${JSON.stringify(params)}`;
}
