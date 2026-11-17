import { isRecord } from "@/modules/utils/guards";

/** The HTTP status of a rejected request, from an axios error or any `{ response: { status } }` shape. */
export const responseStatus = (error: unknown): number | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }
  const status = error.response.status;
  return typeof status === "number" ? status : undefined;
};
