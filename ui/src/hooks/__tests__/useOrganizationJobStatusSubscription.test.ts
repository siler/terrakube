import { renderHook } from "@testing-library/react";
import { useOrganizationJobStatusSubscription } from "../useOrganizationJobStatusSubscription";
import { print } from "graphql";
import { subscribe as subscribeDocument } from "../../modules/api/subscriptionClient";

jest.mock("../../modules/api/subscriptionClient");

describe("useOrganizationJobStatusSubscription", () => {
  const unsubscribe = jest.fn<void, []>();
  const subscribe = jest.mocked(subscribeDocument);

  beforeEach(() => {
    jest.resetAllMocks();
    subscribe.mockReturnValue(unsubscribe);
  });

  it("subscribes with the organizationId variable and forwards each event", () => {
    const onEvent = jest.fn();

    renderHook(() => useOrganizationJobStatusSubscription({ organizationId: "org-1", enabled: true, onEvent }));

    expect(subscribe).toHaveBeenCalledTimes(1);
    const [document, variables, onData] = subscribe.mock.calls[0];
    expect(print(document)).toContain("$organizationId: ID!");
    expect(variables).toEqual({ organizationId: "org-1" });

    onData({ organizationJobStatusChanged: { jobId: 1, workspaceId: "workspace-1", status: "running" } });

    expect(onEvent).toHaveBeenCalledWith({ jobId: 1, workspaceId: "workspace-1", status: "running" });
  });

  it("does not subscribe when disabled", () => {
    renderHook(() =>
      useOrganizationJobStatusSubscription({ organizationId: "org-1", enabled: false, onEvent: jest.fn() })
    );

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() =>
      useOrganizationJobStatusSubscription({ organizationId: "org-1", enabled: true, onEvent: jest.fn() })
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not resubscribe when the caller passes a new onEvent reference on every render", () => {
    const { rerender } = renderHook(
      ({ onEvent }) => useOrganizationJobStatusSubscription({ organizationId: "org-1", enabled: true, onEvent }),
      { initialProps: { onEvent: () => {} } }
    );

    expect(subscribe).toHaveBeenCalledTimes(1);

    rerender({ onEvent: () => {} });
    rerender({ onEvent: () => {} });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
