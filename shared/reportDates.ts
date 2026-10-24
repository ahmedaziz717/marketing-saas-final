import { dateInZone, moveDate, type DateRange } from "./channels";

export const datePresets = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7", "Last 7 days"],
  ["14", "Last 14 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_year", "This year"],
  ["last_year", "Last year"],
  ["365", "Last 365 days"],
] as const;
export type DatePreset = (typeof datePresets)[number][0];
export function presetRange(
  preset: DatePreset,
  now = Date.now(),
  timezone = "UTC"
): DateRange {
  const today = dateInZone(now, timezone).slice(0, 10);
  const year = Number(today.slice(0, 4));
  const first = today.slice(0, 7) + "-01";
  switch (preset) {
    case "today":
      return { since: today, until: today };
    case "yesterday":
      return { since: moveDate(today, -1), until: moveDate(today, -1) };
    case "this_month":
      return { since: first, until: today };
    case "last_month": {
      const until = moveDate(first, -1);
      return { since: until.slice(0, 7) + "-01", until };
    }
    case "this_year":
      return { since: `${year}-01-01`, until: today };
    case "last_year":
      return { since: `${year - 1}-01-01`, until: `${year - 1}-12-31` };
    default:
      return { since: moveDate(today, 1 - Number(preset)), until: today };
  }
}
// Inclusive, non-overlapping provider requests. Date arithmetic avoids DST drift.
export function splitDateRange(range: DateRange, days = 90): DateRange[] {
  const result: DateRange[] = [];
  for (let since = range.since; since <= range.until; ) {
    const until = [moveDate(since, days - 1), range.until].sort()[0];
    result.push({ since, until });
    since = moveDate(until, 1);
  }
  return result;
}
