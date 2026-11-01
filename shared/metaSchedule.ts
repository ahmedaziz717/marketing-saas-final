export type MetaScheduleIssue = {
  field: "startTime" | "endTime";
  message: string;
};
export function metaScheduleIssue(
  start: string | undefined,
  end: string | undefined,
  requiresEnd: boolean,
  now = Date.now()
): MetaScheduleIssue | null {
  if (requiresEnd && !end)
    return {
      field: "endTime",
      message: "Lifetime budgets require an ad-set end date.",
    };
  if (end && (!Number.isFinite(Date.parse(end)) || Date.parse(end) <= now))
    return { field: "endTime", message: "Choose a future end date." };
  if (
    start &&
    (!Number.isFinite(Date.parse(start)) || Date.parse(start) <= now)
  )
    return {
      field: "startTime",
      message:
        "Choose a future start date, or leave it blank to start when activated.",
    };
  if (start && end && Date.parse(end) <= Date.parse(start))
    return {
      field: "endTime",
      message: "End date must be after the start date.",
    };
  return null;
}
