import { useEffect, useRef } from "react";
import { graphql } from "../domain/generated/graphql-subscriptions";
import type { OnJobStatusChangedSubscription } from "../domain/generated/graphql-subscriptions/graphql";
import { subscribe } from "../modules/api/subscriptionClient";

export type JobStatusEvent = OnJobStatusChangedSubscription["jobStatusChanged"];

type UseJobStatusSubscriptionOptions = {
  workspaceId: string;
  enabled: boolean;
  onEvent: (event: JobStatusEvent) => void;
};

const OnJobStatusChanged = graphql(`
  subscription OnJobStatusChanged($workspaceId: ID!) {
    jobStatusChanged(workspaceId: $workspaceId) {
      jobId
      workspaceId
      status
    }
  }
`);

export function useJobStatusSubscription({ workspaceId, enabled, onEvent }: UseJobStatusSubscriptionOptions): void {
  // Callers commonly pass an inline callback that closes over component state (e.g. `() =>
  // loadWorkspace(...)`), which is a new function reference every render. Reading it through a ref -
  // updated on every render, but not part of the effect's dependency array - means the subscription
  // itself isn't torn down and recreated just because the caller re-rendered.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribe(OnJobStatusChanged, { workspaceId }, (data) => onEventRef.current(data.jobStatusChanged));
  }, [workspaceId, enabled]);
}
