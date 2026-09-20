import { z } from "zod";

export const channelSchema = z.enum(["facebook", "meta_ads"]);
export type Channel = z.infer<typeof channelSchema>;
export const channelNames: Record<Channel, string> = {
  facebook: "Facebook",
  meta_ads: "Meta Ads",
};
export const publicationStates = [
  "draft",
  "needs_review",
  "changes_requested",
  "rejected",
  "approved",
  "scheduled",
  "publishing",
  "processing",
  "published",
  "failed",
  "delivery_unknown",
  "cancelled",
] as const;
export type PublicationState = (typeof publicationStates)[number];
export type Secret = { ciphertext: string; iv: string; tag: string };
export type ConnectionDetails = {
  permissions: string[];
  tasks: string[];
  capabilities: Array<"read" | "publish" | "insights">;
  pageId?: string;
  pageName?: string;
  currency?: string;
  timezone?: string;
  expiresAtMs?: number | null;
  warnings: string[];
};
export const scopeSchema = z.object({
  organizationId: z.number().int().positive(),
});
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export const timezoneSchema = z
  .string()
  .max(100)
  .refine(validTimezone, "Choose a valid time zone.");
export function validDate(value: string) {
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validDate, "Choose a valid date.");
export const rangeSchema = z
  .object({ since: dateSchema, until: dateSchema })
  .refine(
    ({ since, until }) =>
      until >= since && Date.parse(until) - Date.parse(since) < 93 * 86400000,
    "Select a range of 1 to 93 days."
  );
export type DateRange = z.infer<typeof rangeSchema>;
export const linkSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS destination URL.");
export const contentSchema = z.object({
  title: z.string().trim().min(1).max(180),
  message: z.string().trim().max(5000).default(""),
  link: linkSchema.default(""),
  headline: z.string().trim().max(200).default(""),
  description: z.string().trim().max(300).default(""),
  callToAction: z
    .enum(["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "GET_OFFER"])
    .default("LEARN_MORE"),
  campaignLabel: z.string().trim().max(180).default(""),
  adSetId: z.string().regex(/^\d*$/).max(100).default(""),
});
export type PublicationContent = z.infer<typeof contentSchema>;
export const publicationDraftSchema = scopeSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  channel: channelSchema,
  connectionId: z.string().uuid().nullable(),
  assetKey: z
    .string()
    .regex(/^(asset|creative):[1-9][0-9]*$/)
    .nullable(),
  content: contentSchema,
  scheduledAtMs: z.number().int().safe().positive().nullable(),
  timezone: timezoneSchema,
});
export const planSchema = scopeSchema
  .extend({
    channel: channelSchema,
    timezone: timezoneSchema,
    postsPerWeek: z.number().int().min(0).max(14),
    slots: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          time: z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/),
        })
      )
      .max(14),
  })
  .refine(
    p =>
      new Set(p.slots.map(s => s.day + "/" + s.time)).size === p.slots.length,
    "Preferred time slots must be unique."
  );
export type ContentPlan = z.infer<typeof planSchema>;
export function editablePublication(state: string) {
  return [
    "draft",
    "needs_review",
    "changes_requested",
    "rejected",
    "approved",
    "scheduled",
    "cancelled",
  ].includes(state);
}
export const statusLabel = (state: string) =>
  state.replaceAll("_", " ").replace(/^./, s => s.toUpperCase());
export function dateInZone(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
/** Reject nonexistent and ambiguous DST times instead of guessing a publishing time. */
export function localScheduleToUtc(local: string, timezone: string): number {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ||
    !validTimezone(timezone) ||
    !validDate(local.slice(0, 10))
  )
    throw new Error("Choose a valid date, time and time zone.");
  const base = Date.parse(local + ":00Z");
  if (!Number.isFinite(base)) throw new Error("Choose a valid date and time.");
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = base + hours * 3600000;
    offsets.add(Date.parse(dateInZone(sample, timezone) + ":00Z") - sample);
  }
  const matches = Array.from(offsets)
    .map(offset => base - offset)
    .filter(time => dateInZone(time, timezone) === local);
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "That time occurs twice during daylight saving time. Choose another time."
        : "That local time does not exist. Choose another time."
    );
  return matches[0];
}
export function moveDate(date: string, days: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  return moveDate(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
}
export function previousRange(range: DateRange): DateRange {
  const days =
    Math.round((Date.parse(range.until) - Date.parse(range.since)) / 86400000) +
    1;
  return {
    since: moveDate(range.since, -days),
    until: moveDate(range.since, -1),
  };
}
export function actionValue(values: unknown, names: string[]): number | null {
  if (!Array.isArray(values)) return null;
  for (const name of names) {
    const found = values.find(v => v?.action_type === name);
    if (found && Number.isFinite(Number(found.value)))
      return Number(found.value);
  }
  return 0;
}
export function finiteMetric(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
