import { useEffect, useRef } from "react";
import { graphql } from "../domain/generated/graphql-subscriptions";
import { subscribe } from "../modules/api/subscriptionClient";
import { JobStatusEvent } from "./useJobStatusSubscription";

type UseOrganizationJobStatusSubscriptionOptions = {
  organizationId: string;
  enabled: boolean;
  onEvent: (event: JobStatusEvent) => void;
};

const OnOrganizationJobStatusChanged = graphql(`
  subscription OnOrganizationJobStatusChanged($organizationId: ID!) {
    organizationJobStatusChanged(organizationId: $organizationId) {
      jobId
      workspaceId
      status
    }
  }
`);

export function useOrganizationJobStatusSubscription({
  organizationId,
  enabled,
  onEvent,
}: UseOrganizationJobStatusSubscriptionOptions): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribe(OnOrganizationJobStatusChanged, { organizationId }, (data) =>
      onEventRef.current(data.organizationJobStatusChanged)
    );
  }, [organizationId, enabled]);
}
