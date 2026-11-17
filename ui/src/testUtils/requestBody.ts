import { isRecord } from "@/modules/utils/guards";

/** Returns the value as a record, failing the test when it is not a plain object. */
export const recordOf = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`Expected an object, got ${JSON.stringify(value)}`);
  }
  return value;
};

/** Returns the `data` member of a JSON:API request body, failing the test when it is missing. */
export const requestData = (body: unknown): Record<string, unknown> => recordOf(recordOf(body).data);

/** Returns `data.attributes` of a JSON:API request body, failing the test when it is missing. */
export const requestAttributes = (body: unknown): Record<string, unknown> => recordOf(requestData(body).attributes);
