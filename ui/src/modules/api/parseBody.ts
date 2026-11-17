import { isRecord, isUnknownArray } from "@/modules/utils/guards";
import { ResponseShapeError } from "./responseShapeError";

/** The body as an object, or a {@link ResponseShapeError} naming `what` was expected. */
export const record = (value: unknown, what: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new ResponseShapeError(`Expected ${what} to be an object`);
  }
  return value;
};

/** The value when `guard` accepts it, otherwise a {@link ResponseShapeError} naming `what`. */
export const field = <T>(value: unknown, guard: (value: unknown) => value is T, what: string): T => {
  if (!guard(value)) {
    throw new ResponseShapeError(`Unexpected ${what}`);
  }
  return value;
};

/** Each element of a list parsed by `parse`; anything but an array is a {@link ResponseShapeError}. */
export const list = <T>(value: unknown, parse: (item: unknown) => T, what: string): T[] =>
  field(value, isUnknownArray, `${what} list`).map(parse);

export const isString = (value: unknown): value is string => typeof value === "string";

export const isNumber = (value: unknown): value is number => typeof value === "number";

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
