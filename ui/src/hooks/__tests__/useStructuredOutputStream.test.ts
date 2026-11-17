import { renderHook, waitFor } from "@testing-library/react";
import { useStructuredOutputStream } from "../useStructuredOutputStream";

jest.mock("../../modules/api/eventStream", () => ({
  readEventStream: jest.fn(),
}));

import { readEventStream } from "../../modules/api/eventStream";
import { isRecord } from "../../modules/utils/typeGuards";

const parseChanges = (value: unknown): { changes: { address: string }[] } | undefined => {
  if (!isRecord(value) || !Array.isArray(value.changes)) {
    return undefined;
  }
  const changes = value.changes
    .filter(isRecord)
    .flatMap((change) => (typeof change.address === "string" ? [{ address: change.address }] : []));
  return { changes };
};

describe("useStructuredOutputStream", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("replaces state with each pushed snapshot instead of merging", async () => {
    jest.mocked(readEventStream).mockImplementation(async (_url, { onMessage }) => {
      onMessage(JSON.stringify({ changes: [{ address: "a" }] }), "1");
      onMessage(JSON.stringify({ changes: [{ address: "a" }, { address: "b" }] }), "2");
    });

    const { result } = renderHook(() =>
      useStructuredOutputStream<{ changes: { address: string }[] }>({
        url: "http://localhost/stream",
        enabled: true,
        initial: { changes: [] },
        parse: parseChanges,
      })
    );

    await waitFor(() => expect(result.current.changes).toHaveLength(2));
    expect(result.current.changes.map((c) => c.address)).toEqual(["a", "b"]);
  });

  it("ignores an unparseable snapshot rather than throwing", async () => {
    jest.mocked(readEventStream).mockImplementation(async (_url, { onMessage }) => {
      onMessage("not json", "1");
    });

    const { result } = renderHook(() =>
      useStructuredOutputStream<{ changes: { address: string }[] }>({
        url: "http://localhost/stream",
        enabled: true,
        initial: { changes: [] },
        parse: parseChanges,
      })
    );

    await waitFor(() => expect(result.current).toEqual({ changes: [] }));
  });

  it("keeps the previous snapshot when parse rejects the pushed one", async () => {
    jest.mocked(readEventStream).mockImplementation(async (_url, { onMessage }) => {
      onMessage(JSON.stringify({ changes: [{ address: "a" }] }), "1");
      onMessage(JSON.stringify({ phase: "unexpected" }), "2");
      onMessage("[]", "3");
    });

    const { result } = renderHook(() =>
      useStructuredOutputStream<{ changes: { address: string }[] }>({
        url: "http://localhost/stream",
        enabled: true,
        initial: { changes: [] },
        parse: parseChanges,
      })
    );

    await waitFor(() => expect(readEventStream).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toEqual({ changes: [{ address: "a" }] }));
  });
});
