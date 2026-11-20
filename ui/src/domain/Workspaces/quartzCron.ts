import { isStringArray } from "@/modules/utils/typeGuards";
import * as C2Q from "cron-to-quartz";

/**
 * Converts a Unix cron expression to the Quartz expression the schedule API stores. When the expression sets both
 * day of month and day of week, Quartz needs two expressions; only the day-of-month one is returned.
 * Returns undefined when the library yields nothing usable.
 */
export const toQuartzCron = (cron: string): string | undefined => {
  const entries: unknown = C2Q.getQuartz(cron);
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const first: unknown = entries[0];
  return isStringArray(first) ? first.join(" ") : undefined;
};
