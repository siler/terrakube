import { act, renderHook } from "@testing-library/react";
import { createCoalescedReload, LOAD_DEADLINE_MS, LoadDeadlineError, useCoalescedReload } from "../useCoalescedReload";

type Deferred = {
  resolve: () => void;
  reject: (err: Error) => void;
  isCurrent: () => boolean;
  signal: AbortSignal;
};

// A load whose calls each stay in flight until the test settles them.
const controlledLoad = () => {
  const calls: Deferred[] = [];
  const load = jest.fn(
    (isCurrent: () => boolean, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ resolve, reject, isCurrent, signal });
      })
  );
  return { load, calls };
};

const flush = () => act(async () => {});

describe("createCoalescedReload", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("does not start a second load while one is in flight", async () => {
    const { load } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    runner.reload();
    runner.reload();
    await flush();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("runs exactly one more load after the current one when calls arrived meanwhile", async () => {
    const { load, calls } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    await flush();
    runner.reload();
    runner.reload();
    calls[0].resolve();
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
    calls[1].resolve();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps going after a load fails", async () => {
    const { load, calls } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    await flush();
    runner.reload();
    calls[0].reject(new Error("boom"));
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("marks the load in flight as stale on cancel and drops the queued load", async () => {
    const { load, calls } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    await flush();
    runner.reload();
    runner.cancel();

    expect(calls[0].isCurrent()).toBe(false);
    calls[0].resolve();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("abandons a load that never settles once the deadline passes, then runs the queued reload", async () => {
    const { load, calls } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    await flush();
    runner.reload();
    jest.advanceTimersByTime(LOAD_DEADLINE_MS - 1);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await flush();
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[0].isCurrent()).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    expect(calls[1].isCurrent()).toBe(true);
  });

  it("lets the next reload run after a load times out with nothing queued", async () => {
    const { load } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    jest.advanceTimersByTime(LOAD_DEADLINE_MS);
    await flush();
    runner.reload();
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("already reports a load as stale when its request rejects on the deadline abort", async () => {
    let currentWhenRejected: boolean | undefined;
    const load = jest.fn(async (isCurrent: () => boolean, signal: AbortSignal) => {
      try {
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("canceled"))));
      } catch {
        currentWhenRejected = isCurrent();
      }
    });
    createCoalescedReload(load).reload();
    await flush();

    jest.advanceTimersByTime(LOAD_DEADLINE_MS);
    await flush();

    expect(currentWhenRejected).toBe(false);
  });

  it("aborts the signal of the load in flight on cancel", async () => {
    const { load, calls } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    await flush();
    runner.cancel();

    expect(calls[0].signal.aborted).toBe(true);
  });

  it("starts fresh after cancel, without waiting on the stale load", async () => {
    const { load, calls } = controlledLoad();
    const runner = createCoalescedReload(load);

    runner.reload();
    await flush();
    runner.cancel();
    runner.reload();
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
    expect(calls[1].isCurrent()).toBe(true);
    calls[0].resolve();
    await flush();
    expect(calls[1].isCurrent()).toBe(true);
  });
});

describe("createCoalescedReload deadline reporting", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reports a load abandoned at the deadline, worded like an axios timeout", async () => {
    const { load } = controlledLoad();
    const onDeadline = jest.fn();
    createCoalescedReload(load, { onDeadline }).reload();
    await flush();

    jest.advanceTimersByTime(LOAD_DEADLINE_MS);
    await flush();

    expect(onDeadline).toHaveBeenCalledTimes(1);
    expect(onDeadline.mock.calls[0][0]).toBeInstanceOf(LoadDeadlineError);
    expect(onDeadline.mock.calls[0][0].message).toBe(`timeout of ${LOAD_DEADLINE_MS}ms exceeded`);
  });

  it("does not report a cancelled load, a failed load or a load that finishes in time", async () => {
    const { load, calls } = controlledLoad();
    const onDeadline = jest.fn();
    const runner = createCoalescedReload(load, { onDeadline });

    runner.reload();
    await flush();
    runner.cancel();
    runner.reload();
    await flush();
    calls[1].reject(new Error("boom"));
    await flush();
    runner.reload();
    await flush();
    calls[2].resolve();
    await flush();
    jest.advanceTimersByTime(LOAD_DEADLINE_MS);
    await flush();

    expect(onDeadline).not.toHaveBeenCalled();
  });
});

describe("useCoalescedReload", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs the load from the latest render", async () => {
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ load }) => useCoalescedReload(load), {
      initialProps: { load: first },
    });

    rerender({ load: second });
    result.current.reload();
    await flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reports the deadline to the latest render's callback", async () => {
    const load = jest.fn(() => new Promise<void>(() => {}));
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = renderHook(({ onDeadline }) => useCoalescedReload(load, { onDeadline }), {
      initialProps: { onDeadline: first },
    });

    rerender({ onDeadline: second });
    result.current.reload();
    await flush();
    jest.advanceTimersByTime(LOAD_DEADLINE_MS);
    await flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
