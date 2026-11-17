import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const LOAD_DEADLINE_MS = 30_000;

export type CoalescedLoad = (isCurrent: () => boolean, signal: AbortSignal) => Promise<void>;

export interface CoalescedReload {
  /** Loads now, or exactly once more after the load in flight finishes. */
  reload: () => void;
  /** Loads once the calls have stopped for the debounce period. */
  reloadSoon: () => void;
  /** Drops queued and debounced loads and aborts the load in flight. */
  cancel: () => void;
}

// Rejects at the deadline even when the request ignores the signal it was given.
function withDeadline(request: (signal: AbortSignal) => Promise<void>, ms: number, parent: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort);
  const timer = setTimeout(abort, ms);
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
  return Promise.race([Promise.resolve().then(() => request(controller.signal)), aborted]).finally(() => {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  });
}

/** Single-flight load with one queued follow-up; a load past the deadline is dropped so a hung request can't block later reloads. */
export function createCoalescedReload(
  load: CoalescedLoad,
  debounceMs: number,
  deadlineMs = LOAD_DEADLINE_MS
): CoalescedReload {
  let inFlight: AbortController | undefined;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reload = () => {
    clearTimeout(timer);
    timer = undefined;
    if (inFlight) {
      queued = true;
      return;
    }
    const controller = new AbortController();
    inFlight = controller;
    withDeadline((signal) => load(() => !signal.aborted, signal), deadlineMs, controller.signal)
      // The load reports its own errors; a rejection here is the deadline.
      .catch(() => controller.abort())
      .finally(() => {
        if (inFlight !== controller) {
          return;
        }
        inFlight = undefined;
        if (queued) {
          queued = false;
          reload();
        }
      });
  };

  const reloadSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(reload, debounceMs);
  };

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    inFlight?.abort();
    inFlight = undefined;
    queued = false;
  };

  return { reload, reloadSoon, cancel };
}

export function useCoalescedReload(load: CoalescedLoad, debounceMs = 750): CoalescedReload {
  const loadRef = useRef(load);
  // Layout effects run before the component's own effects, so those already see this render's load.
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const [runner] = useState(() =>
    createCoalescedReload((isCurrent, signal) => loadRef.current(isCurrent, signal), debounceMs)
  );
  useEffect(() => () => runner.cancel(), [runner]);
  return runner;
}
