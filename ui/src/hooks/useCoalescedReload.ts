import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const LOAD_DEADLINE_MS = 30_000;

export type CoalescedLoad = (isCurrent: () => boolean, signal: AbortSignal) => Promise<void>;

/** A load abandoned at the deadline; worded like an axios timeout so it reads like the page's other errors. */
export class LoadDeadlineError extends Error {
  constructor(ms: number) {
    super(`timeout of ${ms}ms exceeded`);
    this.name = "LoadDeadlineError";
  }
}

export interface CoalescedReloadOptions {
  deadlineMs?: number;
  /** Called when a load is abandoned at the deadline, not when it is cancelled. */
  onDeadline?: (error: LoadDeadlineError) => void;
}

export interface CoalescedReload {
  /** Loads now, or exactly once more after the load in flight finishes. */
  reload: () => void;
  /** Drops the queued load and aborts the load in flight. */
  cancel: () => void;
}

// Rejects at the deadline even when the request ignores the signal it was given.
function withDeadline(request: (signal: AbortSignal) => Promise<void>, ms: number, parent: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort);
  const timer = setTimeout(() => controller.abort(new LoadDeadlineError(ms)), ms);
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(controller.signal.reason));
  });
  return Promise.race([Promise.resolve().then(() => request(controller.signal)), aborted]).finally(() => {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  });
}

/** Single-flight load with one queued follow-up; a load past the deadline is dropped so a hung request can't block later reloads. */
export function createCoalescedReload(
  load: CoalescedLoad,
  { deadlineMs = LOAD_DEADLINE_MS, onDeadline }: CoalescedReloadOptions = {}
): CoalescedReload {
  let inFlight: AbortController | undefined;
  let queued = false;

  const reload = () => {
    if (inFlight) {
      queued = true;
      return;
    }
    const controller = new AbortController();
    inFlight = controller;
    withDeadline((signal) => load(() => !signal.aborted, signal), deadlineMs, controller.signal)
      // The load reports its own errors; a rejection here is the deadline or a cancel.
      .catch((error) => {
        controller.abort();
        if (error instanceof LoadDeadlineError) {
          onDeadline?.(error);
        }
      })
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

  const cancel = () => {
    inFlight?.abort();
    inFlight = undefined;
    queued = false;
  };

  return { reload, cancel };
}

export function useCoalescedReload(load: CoalescedLoad, options: CoalescedReloadOptions = {}): CoalescedReload {
  const loadRef = useRef(load);
  const onDeadlineRef = useRef(options.onDeadline);
  // Layout effects run before the component's own effects, so those already see this render's callbacks.
  useLayoutEffect(() => {
    loadRef.current = load;
    onDeadlineRef.current = options.onDeadline;
  });
  const [runner] = useState(() =>
    createCoalescedReload((isCurrent, signal) => loadRef.current(isCurrent, signal), {
      deadlineMs: options.deadlineMs,
      onDeadline: (error) => onDeadlineRef.current?.(error),
    })
  );
  useEffect(() => () => runner.cancel(), [runner]);
  return runner;
}
