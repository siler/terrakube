import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";
import { Client, createClient } from "graphql-ws";
import getUserFromStorage from "../../config/authUser";
import { subscriptionsUrl } from "../../config/apiUrls";

let client: Client | undefined;

export function getSubscriptionClient(): Client {
  if (client == null) {
    const wsUrl = subscriptionsUrl();

    client = createClient({
      url: wsUrl,
      connectionParams: () => {
        const user = getUserFromStorage();
        return { Authorization: `Bearer ${user?.access_token ?? ""}` };
      },
    });
  }
  return client;
}

/** Subscribes a typed document, calling `onData` with each result's data; returns the unsubscribe. */
export function subscribe<R, V extends Record<string, unknown>>(
  document: TypedDocumentNode<R, V>,
  variables: V,
  onData: (data: R) => void
): () => void {
  return getSubscriptionClient().subscribe<R>(
    { query: print(document), variables },
    {
      next: ({ data }) => {
        if (data != null) {
          onData(data);
        }
      },
      error: () => {
        // graphql-ws retries the underlying connection and resubscribes automatically; nothing to do here.
      },
      complete: () => {},
    }
  );
}
