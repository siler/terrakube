import { FakeResponse } from "@/testUtils/fakeFetchResponse";
import { readEventStream } from "../eventStream";

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

describe("readEventStream", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("invokes onMessage for each SSE data line", async () => {
    const response = new FakeResponse({ chunks: ["data: line 1\n\n", "data: line 2\n\n"] });
    fetchMock.mockResolvedValue(response);

    const received: string[] = [];
    await readEventStream("http://localhost/stream", {
      onMessage: (data) => received.push(data),
      signal: new AbortController().signal,
    });

    expect(received).toEqual(["line 1", "line 2"]);
  });

  it("ignores SSE comment lines", async () => {
    const response = new FakeResponse({ chunks: [": heartbeat\n\n", "data: line 1\n\n"] });
    fetchMock.mockResolvedValue(response);

    const received: string[] = [];
    await readEventStream("http://localhost/stream", {
      onMessage: (data) => received.push(data),
      signal: new AbortController().signal,
    });

    expect(received).toEqual(["line 1"]);
  });

  it("rejects when the response is not ok", async () => {
    const response = new FakeResponse({ status: 401 });
    fetchMock.mockResolvedValue(response);

    await expect(
      readEventStream("http://localhost/stream", {
        onMessage: jest.fn(),
        signal: new AbortController().signal,
      })
    ).rejects.toThrow("401");
  });

  it("passes the event's id alongside its data", async () => {
    const response = new FakeResponse({ chunks: ["id: 100-0\ndata: line 1\n\n"] });
    fetchMock.mockResolvedValue(response);

    const received: Array<[string, string | undefined]> = [];
    await readEventStream("http://localhost/stream", {
      onMessage: (data, id) => received.push([data, id]),
      signal: new AbortController().signal,
    });

    expect(received).toEqual([["line 1", "100-0"]]);
  });

  it("preserves indentation beyond the single SSE-spec leading space", async () => {
    const response = new FakeResponse({ chunks: ["data:      + arn = (known after apply)\n\n"] });
    fetchMock.mockResolvedValue(response);

    const received: string[] = [];
    await readEventStream("http://localhost/stream", {
      onMessage: (data) => received.push(data),
      signal: new AbortController().signal,
    });

    expect(received).toEqual(["     + arn = (known after apply)"]);
  });

  it("sends Last-Event-ID as a request header when provided", async () => {
    const response = new FakeResponse({ chunks: ["data: line 1\n\n"] });
    fetchMock.mockResolvedValue(response);

    await readEventStream("http://localhost/stream", {
      onMessage: jest.fn(),
      signal: new AbortController().signal,
      lastEventId: "100-0",
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit?.headers).toMatchObject({ "Last-Event-ID": "100-0" });
  });

  it("passes the event name of a named event, and none for plain data", async () => {
    const response = new FakeResponse({
      chunks: [
        "id: 5-0\ndata: line\n\n",
        'event: gap\ndata: {"reason":"trimmed"}\n\n',
        'event: end\ndata: {"reason":"rotate"}\n\n',
      ],
    });
    fetchMock.mockResolvedValue(response);

    const received: Array<[string, string | undefined, string | undefined]> = [];
    await readEventStream("http://localhost/stream", {
      onMessage: (data, id, event) => received.push([data, id, event]),
      signal: new AbortController().signal,
    });

    expect(received).toEqual([
      ["line", "5-0", undefined],
      ['{"reason":"trimmed"}', undefined, "gap"],
      ['{"reason":"rotate"}', undefined, "end"],
    ]);
  });
});
