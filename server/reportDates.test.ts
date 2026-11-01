import { describe, it, expect } from "vitest";
import { presetRange, splitDateRange } from "../shared/reportDates";
import { previousRange, rangeSchema } from "../shared/channels";
describe("shared reporting dates", () => {
  it("resolves rolling and calendar ranges across leap years and January", () => {
    const now = Date.parse("2028-03-01T12:00:00Z");
    expect(presetRange("yesterday", now)).toEqual({
      since: "2028-02-29",
      until: "2028-02-29",
    });
    expect(presetRange("14", now)).toEqual({
      since: "2028-02-17",
      until: "2028-03-01",
    });
    expect(presetRange("last_month", now)).toEqual({
      since: "2028-02-01",
      until: "2028-02-29",
    });
    expect(presetRange("this_month", now)).toEqual({
      since: "2028-03-01",
      until: "2028-03-01",
    });
    expect(
      presetRange("last_month", Date.parse("2026-01-20T12:00:00Z"))
    ).toEqual({ since: "2025-12-01", until: "2025-12-31" });
    const year = presetRange("last_year", Date.parse("2029-01-01T12:00:00Z"));
    expect(year).toEqual({ since: "2028-01-01", until: "2028-12-31" });
    expect(rangeSchema.safeParse(year).success).toBe(true);
    expect(rangeSchema.safeParse(previousRange(year)).success).toBe(true);
  });
  it("uses the supplied reporting timezone at a day boundary", () => {
    expect(
      presetRange(
        "today",
        Date.parse("2026-09-30T01:00:00Z"),
        "America/New_York"
      )
    ).toEqual({ since: "2026-09-29", until: "2026-09-29" });
  });
  it("splits a leap year into bounded contiguous requests without overlap", () => {
    const ranges = splitDateRange({ since: "2028-01-01", until: "2028-12-31" });
    expect(ranges).toEqual([
      { since: "2028-01-01", until: "2028-03-30" },
      { since: "2028-03-31", until: "2028-06-28" },
      { since: "2028-06-29", until: "2028-09-26" },
      { since: "2028-09-27", until: "2028-12-25" },
      { since: "2028-12-26", until: "2028-12-31" },
    ]);
  });
});
