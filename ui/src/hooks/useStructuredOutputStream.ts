import { useEventStream } from "./useEventStream";

type UseStructuredOutputStreamOptions<T> = {
  url: string;
  enabled: boolean;
  initial: T;
  /** Validates one parsed snapshot; returning undefined drops it and keeps the previous value. */
  parse: (value: unknown) => T | undefined;
};

/** Streams JSON snapshots, each replacing the previous value once `parse` accepts it. */
export function useStructuredOutputStream<T>({ url, enabled, initial, parse }: UseStructuredOutputStreamOptions<T>): T {
  return useEventStream<T>({
    url,
    enabled,
    initial,
    reduce: (previous, data) => {
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        return previous;
      }
      return parse(value) ?? previous;
    },
  });
}
