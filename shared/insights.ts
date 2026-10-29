import { z } from "zod";
import {
  dateInZone,
  dateSchema,
  localScheduleToUtc,
  moveDate,
  previousRange,
  rangeSchema,
  timezoneSchema,
  type DateRange,
  type ConnectionChannel,
} from "./channels";
import { presetRange } from "./reportDates";

export const insightMetrics = {
  spend: {
    label: "Ad spend",
    unit: "currency",
    channel: "meta_ads",
    direction: "neutral",
  },
  purchaseValue: {
    label: "Attributed purchase value",
    unit: "currency",
    channel: "meta_ads",
    direction: "up",
  },
  purchases: {
    label: "Attributed purchases",
    unit: "number",
    channel: "meta_ads",
    direction: "up",
  },
  roas: {
    label: "Purchase ROAS",
    unit: "ratio",
    channel: "meta_ads",
    direction: "up",
  },
  impressions: {
    label: "Ad impressions",
    unit: "number",
    channel: "meta_ads",
    direction: "up",
  },
  linkClicks: {
    label: "Link clicks",
    unit: "number",
    channel: "meta_ads",
    direction: "up",
  },
  ctr: {
    label: "Link CTR",
    unit: "percent",
    channel: "meta_ads",
    direction: "up",
  },
  cpa: {
    label: "Cost per purchase",
    unit: "currency",
    channel: "meta_ads",
    direction: "down",
  },
  leads: {
    label: "Leads",
    unit: "number",
    channel: "meta_ads",
    direction: "up",
  },
  registrations: {
    label: "Registrations",
    unit: "number",
    channel: "meta_ads",
    direction: "up",
  },
  clicks: {
    label: "Clicks",
    unit: "number",
    channel: "google_ads",
    direction: "up",
  },
  clickCtr: {
    label: "Click CTR",
    unit: "percent",
    channel: "google_ads",
    direction: "up",
  },
  cpc: {
    label: "Cost per click",
    unit: "currency",
    channel: "google_ads",
    direction: "down",
  },
  conversions: {
    label: "Conversions",
    unit: "number",
    channel: "google_ads",
    direction: "up",
  },
  conversionValue: {
    label: "Conversion value",
    unit: "currency",
    channel: "google_ads",
    direction: "up",
  },
  conversionRoas: {
    label: "Conversion value / cost",
    unit: "ratio",
    channel: "google_ads",
    direction: "up",
  },
  costPerConversion: {
    label: "Cost per conversion",
    unit: "currency",
    channel: "google_ads",
    direction: "down",
  },
  posts: {
    label: "Posts published",
    unit: "number",
    channel: "facebook",
    direction: "neutral",
  },
  followers: {
    label: "Followers now",
    unit: "number",
    channel: "facebook",
    direction: "up",
  },
  views: {
    label: "Page media views",
    unit: "number",
    channel: "facebook",
    direction: "up",
  },
  engagements: {
    label: "Page post engagements",
    unit: "number",
    channel: "facebook",
    direction: "up",
  },
  reactions: {
    label: "Lifetime reactions",
    unit: "number",
    channel: "facebook",
    direction: "up",
  },
  comments: {
    label: "Lifetime comments",
    unit: "number",
    channel: "facebook",
    direction: "up",
  },
  shares: {
    label: "Lifetime shares",
    unit: "number",
    channel: "facebook",
    direction: "up",
  },
} as const;
export type InsightMetric = keyof typeof insightMetrics;
export type InsightChannel = ConnectionChannel;
export const insightChannels = ["meta_ads", "google_ads", "facebook"] as const;
export const insightChannelLabels: Record<InsightChannel, string> = {
  meta_ads: "Meta advertising",
  google_ads: "Google Ads",
  facebook: "Facebook Page",
};
export const insightChannelLogos: Record<InsightChannel, string> = {
  meta_ads: "meta",
  google_ads: "googleads",
  facebook: "facebook",
};
export function isInsightChannel(channel: string): channel is InsightChannel {
  return (insightChannels as readonly string[]).includes(channel);
}
export function supportsInsightMetric(
  metric: InsightMetric,
  channel: string | undefined
) {
  return (
    insightMetrics[metric].channel === channel ||
    (channel === "google_ads" &&
      [
        "spend",
        "impressions",
        "purchases",
        "purchaseValue",
        "roas",
        "cpa",
      ].includes(metric))
  );
}
export function insightMetricSources(metric: InsightMetric) {
  return insightChannels
    .filter(channel => supportsInsightMetric(metric, channel))
    .map(channel => insightChannelLabels[channel])
    .join(" · ");
}
export const metricSchema = z.enum(
  Object.keys(insightMetrics) as [InsightMetric, ...InsightMetric[]]
);
export const selectableMetrics = Object.keys(insightMetrics).filter(
  k => !["reactions", "comments", "shares"].includes(k)
) as InsightMetric[];
export const TODAY_REPORT_NOTE =
  "Today uses the report timezone, from midnight to the latest available data, not a rolling 24 hours. Results are partial and may lag behind current activity.";
export const reportPeriods = [
  ["today", "Today"],
  ["7", "Last 7 days"],
  ["14", "Last 14 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["days", "Custom number of days"],
  ["yesterday", "Yesterday"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_year", "This year"],
  ["custom", "Custom dates"],
] as const;
export const reportScheduleSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    weekday: z.number().int().min(0).max(6),
    monthDay: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    startDate: dateSchema.nullable(),
    endDate: dateSchema.nullable(),
  })
  .refine(
    s => !s.startDate || !s.endDate || s.startDate <= s.endDate,
    "Schedule end must be on or after the start date."
  );
export const insightConfigSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name your report.")
      .max(120)
      .regex(/^[^\r\n]+$/, "Use a single-line report name."),
    description: z.string().trim().max(1000),
    connectionIds: z
      .array(z.string().uuid())
      .min(1, "Select at least one account or Page.")
      .max(8)
      .refine(v => new Set(v).size === v.length),
    timezone: timezoneSchema,
    period: z.enum(
      reportPeriods.map(p => p[0]) as [
        (typeof reportPeriods)[number][0],
        ...(typeof reportPeriods)[number][0][],
      ]
    ),
    customRange: rangeSchema,
    rollingDays: z.number().int().min(1).max(366).optional(),
    includeToday: z.boolean(),
    includeInactiveCampaigns: z.boolean().optional(),
    googleDetailLevel: z
      .enum([
        "campaign",
        "ad_group",
        "asset_group",
        "ad",
        "device",
        "country",
        "hour",
      ])
      .optional(),
    compare: z.boolean(),
    metrics: z
      .array(metricSchema)
      .min(1, "Choose at least one metric.")
      .max(14)
      .refine(v => new Set(v).size === v.length),
    sections: z.object({
      summary: z.boolean(),
      trends: z.boolean(),
      details: z.boolean(),
    }),
    chartMetric: metricSchema,
    schedule: reportScheduleSchema,
    delivery: z.object({
      email: z.boolean(),
      recipientUserIds: z
        .array(z.number().int().positive())
        .max(20)
        .refine(v => new Set(v).size === v.length),
      attachPdf: z.boolean(),
      notifyFailure: z.boolean(),
    }),
  })
  .superRefine((c, ctx) => {
    if (c.delivery.email && !c.delivery.recipientUserIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["delivery"],
        message: "Choose at least one email recipient.",
      });
    if (c.schedule.enabled && c.period === "custom")
      ctx.addIssue({
        code: "custom",
        path: ["period"],
        message: "Use a rolling reporting period for scheduled reports.",
      });
    if (!c.metrics.includes(c.chartMetric))
      ctx.addIssue({
        code: "custom",
        path: ["chartMetric"],
        message: "Choose a chart metric included in your report.",
      });
  });
export type InsightConfig = z.infer<typeof insightConfigSchema>;

export function selectedInsightMetrics(
  config: Pick<InsightConfig, "connectionIds" | "metrics" | "chartMetric">,
  connections: Array<{ id: string; channel: string }>
) {
  const channels = Array.from(
    new Set(
      connections
        .filter(c => config.connectionIds.includes(c.id))
        .map(c => c.channel)
        .filter(isInsightChannel)
    )
  );
  const available = selectableMetrics.filter(m =>
    channels.some(c => supportsInsightMetric(m, c))
  );
  const metrics = config.metrics.filter(m => available.includes(m));
  return {
    channels,
    available,
    metrics,
    removed: config.metrics.filter(m => !available.includes(m)),
    chartMetric: metrics.includes(config.chartMetric)
      ? config.chartMetric
      : (metrics[0] ?? available[0] ?? "spend"),
  };
}

export function defaultInsightConfig(
  timezone = "America/New_York",
  now = Date.now()
): InsightConfig {
  return {
    name: "Weekly performance report",
    description: "",
    connectionIds: [],
    timezone,
    period: "7",
    customRange: presetRange("7", now, timezone),
    includeToday: false,
    includeInactiveCampaigns: false,
    compare: true,
    metrics: [
      "spend",
      "purchaseValue",
      "purchases",
      "roas",
      "views",
      "engagements",
    ],
    chartMetric: "spend",
    sections: { summary: true, trends: true, details: true },
    schedule: {
      enabled: false,
      frequency: "weekly",
      weekday: 1,
      monthDay: 1,
      hour: 9,
      minute: 0,
      startDate: null,
      endDate: null,
    },
    delivery: {
      email: false,
      recipientUserIds: [],
      attachPdf: true,
      notifyFailure: true,
    },
  };
}
export function insightRange(
  config: InsightConfig,
  now = Date.now()
): DateRange {
  if (config.period === "custom") return rangeSchema.parse(config.customRange);
  const today = dateInZone(now, config.timezone).slice(0, 10);
  if (config.period === "days") {
    const until = moveDate(today, config.includeToday ? 0 : -1);
    return rangeSchema.parse({
      since: moveDate(until, 1 - (config.rollingDays ?? 30)),
      until,
    });
  }
  const range = presetRange(config.period, now, config.timezone);
  if (
    !config.includeToday &&
    !["today", "yesterday", "last_month"].includes(config.period)
  ) {
    range.until = moveDate(today, -1);
    if (["7", "14", "30", "90"].includes(config.period))
      range.since = moveDate(range.since, -1);
    // On the first day of a month/year, there are no completed days in that period.
    if (range.since > range.until)
      throw new Error(
        "This reporting period has no completed days yet. Include today or choose the previous period."
      );
  }
  return rangeSchema.parse(range);
}
export function nextInsightRun(
  config: Pick<InsightConfig, "schedule" | "timezone">,
  after = Date.now()
): number | null {
  const s = config.schedule;
  if (!s.enabled) return null;
  const today = dateInZone(after, config.timezone).slice(0, 10);
  const start = s.startDate && s.startDate > today ? s.startDate : today;
  for (let offset = 0; offset < 370; offset++) {
    const day = moveDate(start, offset);
    if (s.endDate && day > s.endDate) return null;
    const d = new Date(day + "T12:00:00Z");
    if (s.frequency === "weekly" && d.getUTCDay() !== s.weekday) continue;
    const days = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
    ).getUTCDate();
    if (
      s.frequency === "monthly" &&
      d.getUTCDate() !== Math.min(s.monthDay, days)
    )
      continue;
    // Shift a DST gap or repeated local time to the next unambiguous minute.
    for (
      let minute = s.hour * 60 + s.minute;
      minute < Math.min(1440, s.hour * 60 + s.minute + 181);
      minute++
    ) {
      try {
        const at = localScheduleToUtc(
          `${day}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
          config.timezone
        );
        if (at > after) return at;
        break;
      } catch {
        /* Examine the next local minute across the DST transition. */
      }
    }
  }
  return null;
}
export function scheduleDescription(config: InsightConfig) {
  if (!config.schedule.enabled) return "Manual runs only";
  const s = config.schedule;
  const cadence =
    s.frequency === "daily"
      ? "Every day"
      : s.frequency === "weekly"
        ? `Every ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][s.weekday]}`
        : `Day ${s.monthDay} of each month`;
  return `${cadence} at ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")} · ${config.timezone}`;
}
export type InsightMetricValue = {
  key: InsightMetric;
  value: number | null;
  previous: number | null;
  change: number | null;
};
export type InsightAccount = {
  connectionId: string;
  name: string;
  channel: InsightChannel;
  currency: string | null;
  timezone: string | null;
  status: "ready" | "unavailable";
  error?: string;
  warnings: string[];
  metrics: InsightMetricValue[];
  series: Array<{
    date: string;
    values: Partial<Record<InsightMetric, number | null>>;
  }>;
  previousSeries?: Array<{
    date: string;
    values: Partial<Record<InsightMetric, number | null>>;
  }>;
  detailLabel: string;
  detailMetrics: InsightMetric[];
  details: Array<{
    name: string;
    values: Partial<Record<InsightMetric, number | null>>;
  }>;
};
export type InsightResult = {
  version: 1;
  name: string;
  description: string;
  generatedAtMs: number;
  range: DateRange;
  previousRange: DateRange | null;
  timezone: string;
  accounts: InsightAccount[];
  findings: string[];
  warnings: string[];
};
export function metricChange(value: number | null, prior: number | null) {
  return value === null || prior === null || prior === 0
    ? null
    : ((value - prior) / Math.abs(prior)) * 100;
}
export function insightNumber(
  value: number | null | undefined,
  metric: InsightMetric,
  currency?: string | null
) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "Unavailable";
  const def = insightMetrics[metric];
  const number = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: def.unit === "currency" ? 2 : 0,
    maximumFractionDigits:
      def.unit === "number" && !["purchases", "conversions"].includes(metric)
        ? 0
        : 2,
  }).format(value);
  return def.unit === "currency"
    ? `${currency || "Currency not supplied"} ${number}`
    : def.unit === "ratio"
      ? `${number}x`
      : def.unit === "percent"
        ? `${number}%`
        : number;
}
export const widgetPalettes = {
  canvas: {
    label: "Canvas",
    background: "#ffffff",
    foreground: "#202637",
    accent: "#7150c5",
  },
  lavender: {
    label: "Lavender",
    background: "#f0ebfc",
    foreground: "#30214f",
    accent: "#7250bd",
  },
  ocean: {
    label: "Ocean",
    background: "#e5f1fa",
    foreground: "#193c58",
    accent: "#166d9c",
  },
  sage: {
    label: "Sage",
    background: "#e6f2eb",
    foreground: "#214a38",
    accent: "#287752",
  },
  peach: {
    label: "Peach",
    background: "#fff0e4",
    foreground: "#583326",
    accent: "#b4532b",
  },
  midnight: {
    label: "Midnight",
    background: "#202b44",
    foreground: "#f1f5fc",
    accent: "#bba6ff",
  },
} as const;
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color.");
export const widgetAppearanceSchema = z.object({
  palette: z.enum(["canvas", "lavender", "ocean", "sage", "peach", "midnight"]),
  custom: z
    .object({ background: hexColor, foreground: hexColor, accent: hexColor })
    .optional(),
});
export type WidgetAppearance = z.infer<typeof widgetAppearanceSchema>;
export function widgetColors(appearance?: WidgetAppearance) {
  return appearance?.custom ?? widgetPalettes[appearance?.palette ?? "canvas"];
}
export function insightPeriodLabel(
  config: Pick<InsightConfig, "period" | "rollingDays" | "customRange">
) {
  return config.period === "days"
    ? `Last ${config.rollingDays ?? 30} days`
    : config.period === "custom"
      ? `${config.customRange.since} – ${config.customRange.until}`
      : (reportPeriods.find(p => p[0] === config.period)?.[1] ??
        "Reporting period");
}
export function widgetTitle(
  widget: Pick<DashboardWidget, "title" | "kind" | "metric">,
  config?: Pick<InsightConfig, "name">
) {
  return (
    widget.title?.trim() ||
    (widget.kind === "report"
      ? config?.name || "Performance summary"
      : insightMetrics[widget.metric].label)
  );
}
/** A widget owns a copy of its reporting setup. It never inherits email delivery. */
export function independentWidgetConfig(config: InsightConfig): InsightConfig {
  const copy = structuredClone(config);
  copy.delivery = {
    email: false,
    recipientUserIds: [],
    attachPdf: false,
    notifyFailure: false,
  };
  if (copy.period === "custom") copy.schedule.enabled = false;
  return copy;
}
export const dashboardWidgetSchema = z
  .object({
    id: z.string().uuid(),
    reportId: z.string().uuid(),
    kind: z.enum(["report", "kpi", "trend"]),
    visualization: z
      .enum([
        "area",
        "line",
        "bar",
        "ranking",
        "distribution",
        "combo",
        "table",
        "platform",
      ])
      .optional(),
    aggregation: z.enum(["day", "week", "month"]).optional(),
    dateMode: z.enum(["dashboard", "custom"]).optional(),
    connectionId: z.string().uuid().nullable(),
    metric: metricSchema,
    size: z.enum(["small", "half", "medium", "wide"]),
    height: z.enum(["compact", "standard", "tall"]),
    autoSize: z.boolean().optional(),
    title: z
      .string()
      .trim()
      .max(120)
      .regex(/^[^\r\n]*$/)
      .optional(),
    appearance: widgetAppearanceSchema.optional(),
    components: z
      .array(z.enum(["summary", "metrics", "trends", "details"]))
      .min(1)
      .max(4)
      .refine(v => new Set(v).size === v.length)
      .optional(),
  })
  .refine(
    w => w.kind === "report" || !!w.connectionId,
    "Choose an account for a metric or chart."
  );
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;
/** New widgets get sensible defaults; existing deliberate layouts stay intact. */
export function recommendedWidgetLayout(
  kind: DashboardWidget["kind"],
  components: NonNullable<DashboardWidget["components"]> = [],
  metricCount = 0
): Pick<DashboardWidget, "size" | "height" | "autoSize"> {
  if (kind === "kpi")
    return { size: "small", height: "compact", autoSize: false };
  if (kind === "trend")
    return { size: "half", height: "standard", autoSize: false };
  const detailed =
    components.includes("details") || components.includes("trends");
  return {
    size:
      detailed || (components.includes("metrics") && metricCount > 3)
        ? "wide"
        : "half",
    height: detailed ? "tall" : "standard",
    autoSize: true,
  };
}
export const dashboardLayoutSchema = z.object({
  name: z.string().trim().min(1).max(80),
  surface: z.enum(["main", "measure"]),
  widgets: z
    .array(dashboardWidgetSchema)
    .max(30)
    .refine(v => new Set(v.map(w => w.id)).size === v.length),
});
export const reportPreviousRange = previousRange;
export function insightChartMetric(
  preferred: InsightMetric,
  account: Pick<InsightAccount, "series" | "metrics">
): InsightMetric {
  const available = (key: InsightMetric) =>
    account.series.some(p => typeof p.values[key] === "number");
  return available(preferred)
    ? preferred
    : (account.metrics.find(m => available(m.key))?.key ??
        account.metrics[0]?.key ??
        preferred);
}

export function insightChartPoints(
  account: Pick<InsightAccount, "series">,
  metric: InsightMetric
) {
  const byDate = new Map(
    account.series
      .filter(
        p =>
          /^\d{4}-\d{2}-\d{2}/.test(p.date) &&
          Number.isFinite(Date.parse(p.date))
      )
      .map(p => [p.date.slice(0, 10), p.values[metric] ?? null])
  );
  const days = Array.from(byDate.keys()).sort();
  if (!days.length) return [];
  const points: Array<{ date: string; value: number | null }> = [];
  for (
    let day = days[0];
    day <= days[days.length - 1] && points.length < 370;
    day = moveDate(day, 1)
  )
    points.push({ date: day, value: byDate.get(day) ?? null });
  return points;
}
