import { isRecord } from "@/modules/utils/typeGuards";

/** One display criterion: a JavaScript filter over `context` and the settings it attaches when it matches. */
export type DisplayCriterion = {
  filter: string;
  settings?: { key: string; value: unknown }[];
};

const isSetting = (value: unknown): value is { key: string; value: unknown } =>
  isRecord(value) && typeof value.key === "string" && "value" in value;

const isDisplayCriterion = (value: unknown): value is DisplayCriterion =>
  isRecord(value) &&
  typeof value.filter === "string" &&
  (value.settings === undefined || (Array.isArray(value.settings) && value.settings.every(isSetting)));

// Filters are stored JS written against `context`; a direct eval keeps their completion-value semantics.
const evaluateFilter = new Function("context", "filter", "return eval(filter);");

/**
 * Matches an action's stored `displayCriteria` JSON against `context`.
 * Returns the settings of the first criterion whose filter is truthy, or null when none match or the JSON is malformed.
 */
export const matchDisplayCriteria = (displayCriteria: string, context: object): Record<string, unknown> | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(displayCriteria);
  } catch (error) {
    console.error("Error parsing displayCriteria JSON:", error);
    return null;
  }
  if (!Array.isArray(parsed)) {
    console.error("displayCriteria is not an array:", parsed);
    return null;
  }

  for (const criterion of parsed) {
    if (!isDisplayCriterion(criterion)) {
      console.error("Skipping malformed display criterion:", criterion);
      continue;
    }
    let matched: unknown;
    try {
      matched = Reflect.apply(evaluateFilter, undefined, [context, criterion.filter]);
    } catch (error) {
      console.error("Error evaluating criteria:", error);
      continue;
    }
    if (matched) {
      return Object.fromEntries((criterion.settings ?? []).map((setting) => [setting.key, setting.value]));
    }
  }
  return null;
};

/**
 * Parses an action's stored `displayCriteria` JSON for the editor. A blank value means no criteria; anything that
 * is not a list of criteria throws, so a malformed action is never silently saved back without its criteria.
 */
export const parseDisplayCriteria = (displayCriteria: string | null | undefined): DisplayCriterion[] => {
  if (!displayCriteria?.trim()) {
    return [];
  }
  const parsed: unknown = JSON.parse(displayCriteria);
  if (parsed === null) {
    return [];
  }
  if (!Array.isArray(parsed)) {
    throw new Error("The action's display criteria are not a list of filters and settings");
  }
  const criteria: unknown[] = parsed;
  if (!criteria.every(isDisplayCriterion)) {
    throw new Error("The action's display criteria are not a list of filters and settings");
  }
  return criteria;
};
