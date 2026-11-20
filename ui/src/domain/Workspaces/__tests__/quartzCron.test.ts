import { toQuartzCron } from "../quartzCron";

describe("toQuartzCron", () => {
  it("converts a Unix cron expression to Quartz", () => {
    expect(toQuartzCron("* * * * *")).toBe("0 * * ? * * *");
  });

  it("keeps the day-of-month expression when both day fields are set", () => {
    expect(toQuartzCron("0 1 15 * 1")).toBe("0 0 1 15 * ? *");
  });
});
