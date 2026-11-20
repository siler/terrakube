import dayjs from "dayjs";
import { formatDateTimeWithZone, formatOrdinalDate } from "../dates";

describe("formatDateTimeWithZone", () => {
  it("gives the date, the time and the timezone", () => {
    const text = formatDateTimeWithZone("2026-10-17T19:56:00.000Z");
    expect(text).toContain("2026");
    expect(text).toMatch(/\d{1,2}:\d{2}/);
    expect(text).toMatch(/UTC|GMT|[A-Z]{3,5}/);
  });

  it("is empty when there is no date and returns an unreadable one as it came", () => {
    expect(formatDateTimeWithZone(undefined)).toBe("");
    expect(formatDateTimeWithZone(null)).toBe("");
    expect(formatDateTimeWithZone("not a date")).toBe("not a date");
  });
});

describe("formatOrdinalDate", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [30, "30th"],
  ])("gives day %i the suffix in %s", (day, expected) => {
    expect(formatOrdinalDate(dayjs(new Date(2026, 2, day)))).toBe(`March ${expected}, 2026`);
  });
});
