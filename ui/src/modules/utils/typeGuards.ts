/** Narrows to a non-null, non-array object whose properties are still unchecked. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Narrows to one of the literal values in `options`, e.g. an `as const` list of allowed strings. */
export const isOneOf = <const T extends readonly unknown[]>(options: T, value: unknown): value is T[number] =>
  options.some((option) => option === value);

/** Narrows to an array without trusting its elements; `Array.isArray` alone yields `any[]`. */
export const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

/** Narrows to an array whose every element is a string. */
export const isStringArray = (value: unknown): value is string[] =>
  isUnknownArray(value) && value.every((item) => typeof item === "string");

/** The value when it is a string, otherwise undefined. */
export const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
