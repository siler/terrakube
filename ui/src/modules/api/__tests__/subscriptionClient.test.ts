import { parse } from "graphql";
import { type Client, createClient, type FormattedExecutionResult, type Sink, type SubscribePayload } from "graphql-ws";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { getSubscriptionClient, subscribe } from "../subscriptionClient";

jest.mock("graphql-ws");

const clientSubscribe = jest.fn<() => void, [SubscribePayload, Sink<FormattedExecutionResult<unknown, unknown>>]>();

const fakeClient: Client = {
  on: () => () => {},
  subscribe: clientSubscribe,
  iterate: () => {
    throw new Error("not implemented");
  },
  dispose: () => {},
  terminate: () => {},
};

describe("getSubscriptionClient", () => {
  beforeAll(() => {
    jest.mocked(createClient).mockReturnValue(fakeClient);
  });

  // getSubscriptionClient() caches a module-level singleton, so both behaviors are asserted from the
  // same pair of calls in one test rather than split across tests - a second `it()` calling
  // getSubscriptionClient() again would just hit the cache and never call createClient again, since Jest
  // doesn't reset module-level state between tests in the same file the way it resets mocks.
  it("creates the client once, reuses it on subsequent calls, and configures connectionParams with the access token", async () => {
    const first = getSubscriptionClient();
    const second = getSubscriptionClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    const [{ connectionParams }] = jest.mocked(createClient).mock.calls[0];
    const params = typeof connectionParams === "function" ? await connectionParams() : connectionParams;

    expect(params).toHaveProperty("Authorization");
    expect(params?.Authorization).toMatch(/^Bearer /);
  });
});

describe("subscribe", () => {
  type Data = { changed: { id: string } };
  const document: TypedDocumentNode<Data, { id: string }> = parse(
    "subscription OnChanged($id: ID!) { changed(id: $id) { id } }"
  );
  const unsubscribe = jest.fn();

  beforeEach(() => {
    clientSubscribe.mockReset().mockReturnValue(unsubscribe);
  });

  it("sends the printed document with variables, not interpolated ids", () => {
    subscribe(document, { id: "abc" }, jest.fn());

    const [payload] = clientSubscribe.mock.calls[0];
    expect(payload.variables).toEqual({ id: "abc" });
    expect(payload.query).toContain("changed(id: $id)");
    expect(payload.query).not.toContain("abc");
  });

  it("forwards each result's data and skips results without data", () => {
    const onData = jest.fn();
    subscribe(document, { id: "abc" }, onData);

    const [, sink] = clientSubscribe.mock.calls[0];
    sink.next({ errors: [{ message: "Not authorized" }] });
    sink.next({ data: { changed: { id: "abc" } } });

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith({ changed: { id: "abc" } });
  });

  it("returns the client's unsubscribe", () => {
    expect(subscribe(document, { id: "abc" }, jest.fn())).toBe(unsubscribe);
  });
});
