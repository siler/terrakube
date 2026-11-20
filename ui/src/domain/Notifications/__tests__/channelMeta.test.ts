import { CHANNEL_META, channelMetaFor, isNotificationChannelType } from "../channelMeta";

describe("channelMeta", () => {
  it("recognises only the API's channel types", () => {
    expect(isNotificationChannelType("SLACK")).toBe(true);
    expect(isNotificationChannelType("WEBHOOK")).toBe(true);
    expect(isNotificationChannelType("slack")).toBe(false);
    expect(isNotificationChannelType("toString")).toBe(false);
    expect(isNotificationChannelType(null)).toBe(false);
  });

  it("looks up metadata without throwing for an unknown type", () => {
    expect(channelMetaFor("TEAMS")).toBe(CHANNEL_META.TEAMS);
    expect(channelMetaFor("PAGERDUTY")).toBeUndefined();
    expect(channelMetaFor(undefined)).toBeUndefined();
  });
});
