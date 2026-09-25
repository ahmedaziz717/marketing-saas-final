import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  analyticsFilters,
  analyticsPaths,
  analyticsViewForRoute,
} from "@/lib/analyticsNavigation";
import { channelInput } from "@/components/ChannelConnections";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  channelNames,
  previousRange,
  rangeSchema,
  type DateRange,
} from "@shared/channels";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Report = inferRouterOutputs<AppRouter>["channels"]["report"];
const number = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined
    ? "Unavailable"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v) +
      suffix;
function Metric({
  title,
  value,
  previous,
  currency,
  suffix,
}: {
  title: string;
  value: number | null | undefined;
  previous?: number | null;
  currency?: string | null;
  suffix?: string;
}) {
  const format = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "Unavailable"
      : currency
        ? currency + " " + number(v)
        : number(v, suffix);
  const change =
    value !== null &&
    value !== undefined &&
    previous !== null &&
    previous !== undefined &&
    previous !== 0
      ? ((value - previous) / Math.abs(previous)) * 100
      : null;
  return (
    <div className="min-w-0 rounded-xl border bg-background p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 break-words text-xl font-semibold">{format(value)}</p>
      {previous !== undefined && (
        <p className="mt-2 text-xs text-muted-foreground">
          Previous: {format(previous)}
          {change !== null
            ? ` / ${change > 0 ? "+" : ""}${change.toFixed(1)}%`
            : ""}
        </p>
      )}
    </div>
  );
}
function ReportPanel({
  report,
  comparison,
}: {
  report: Report;
  comparison?: Report;
}) {
  if (report.channel === "facebook") {
    const d = report.data,
      prior = comparison?.channel === "facebook" ? comparison.data : undefined;
    const views = d.series.find(s => s.metric === "page_media_view"),
      engagement = d.series.find(s => s.metric === "page_post_engagements");
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            title="Posts published in period"
            value={d.postCount}
            previous={prior?.postCount}
          />
          <Metric
            title="Followers now (not period growth)"
            value={d.followersNow}
          />
          <Metric
            title="Page media views"
            value={views?.total}
            previous={
              prior?.series.find(s => s.metric === "page_media_view")?.total
            }
          />
          <Metric
            title="Page post engagements"
            value={engagement?.total}
            previous={
              prior?.series.find(s => s.metric === "page_post_engagements")
                ?.total
            }
          />
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{d.note}</p>
        {d.warnings.map(w => (
          <p key={w} className="mt-2 text-xs text-muted-foreground">
            {w}
          </p>
        ))}
        {d.truncated && (
          <p className="mt-2 text-xs">
            Post counts and post list are partial because the provider
            pagination limit was reached.
          </p>
        )}
        {!!d.posts.length && (
          <div className="mt-5 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3">Post / lifetime engagement</th>
                  <th className="p-3">Reactions</th>
                  <th className="p-3">Comments</th>
                  <th className="p-3">Shares</th>
                </tr>
              </thead>
              <tbody>
                {d.posts.slice(0, 20).map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="max-w-sm p-3">
                      <p className="line-clamp-2">
                        {p.message || "Media post"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.createdAt}
                      </p>
                    </td>
                    <td className="p-3">{number(p.reactions)}</td>
                    <td className="p-3">{number(p.comments)}</td>
                    <td className="p-3">{number(p.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }
  const d = report.data,
    prior = comparison?.channel === "meta_ads" ? comparison.data : undefined;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Ad spend"
          value={d.summary.spend}
          previous={prior?.summary.spend}
          currency={d.currency}
        />
        <Metric
          title="Impressions"
          value={d.summary.impressions}
          previous={prior?.summary.impressions}
        />
        <Metric
          title="Link clicks"
          value={d.summary.linkClicks}
          previous={prior?.summary.linkClicks}
        />
        <Metric
          title="Platform-attributed purchases"
          value={d.summary.purchases}
          previous={prior?.summary.purchases}
        />
        <Metric
          title="Attributed purchase value"
          value={d.summary.purchaseValue}
          previous={prior?.summary.purchaseValue}
          currency={d.currency}
        />
        <Metric
          title="Purchase ROAS"
          value={d.summary.roas}
          previous={prior?.summary.roas}
          suffix="x"
        />
        <Metric
          title="Link CTR"
          value={
            d.summary.impressions && d.summary.linkClicks !== null
              ? (d.summary.linkClicks / d.summary.impressions) * 100
              : null
          }
          suffix="%"
        />
        <Metric
          title="Cost per attributed purchase"
          value={
            d.summary.purchases && d.summary.spend !== null
              ? d.summary.spend / d.summary.purchases
              : null
          }
          currency={d.currency}
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {d.attribution} Reporting time zone: {d.timezone ?? "not supplied"}.
        Currency:{" "}
        {d.currency ??
          "not supplied; amounts are not combined with other accounts"}
        .
      </p>
      {!!d.daily.length && (
        <div className="mt-5 rounded-xl border p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Daily ad spend{d.currency ? " (" + d.currency + ")" : ""}
          </h3>
          <div
            className="h-56 w-full"
            aria-label="Daily advertising spend chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.12}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[360px] text-left text-sm">
            <caption className="p-3 text-left font-semibold">
              Delivery by platform
            </caption>
            <thead className="bg-muted">
              <tr>
                <th className="p-3">Platform</th>
                <th className="p-3">Spend</th>
                <th className="p-3">Impressions</th>
                <th className="p-3">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {d.platforms.map(p => (
                <tr key={p.name} className="border-t">
                  <td className="p-3 capitalize">{p.name}</td>
                  <td className="p-3">{number(p.spend)}</td>
                  <td className="p-3">{number(p.impressions)}</td>
                  <td className="p-3">{number(p.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="p-3 text-left font-semibold">
              Campaign performance
            </caption>
            <thead className="bg-muted">
              <tr>
                <th className="p-3">Campaign</th>
                <th className="p-3">Spend</th>
                <th className="p-3">Purchases</th>
                <th className="p-3">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {d.campaigns.map(c => (
                <tr key={c.id} className="border-t">
                  <td className="max-w-xs break-words p-3">{c.name}</td>
                  <td className="p-3">{number(c.spend)}</td>
                  <td className="p-3">{number(c.purchases)}</td>
                  <td className="p-3">{number(c.roas, "x")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {d.truncated && (
        <p className="mt-3 text-xs">
          Some breakdowns are partial because the provider pagination limit was
          reached.
        </p>
      )}
    </>
  );
}
function Analytics() {
  const { organizationId } = useWorkspace();
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const tab = analyticsViewForRoute(location, search);
  const { range, compare, account, channel } = analyticsFilters(search);
  const [draftRange, setDraftRange] = useState<DateRange>(range);
  useEffect(() => setDraftRange(range), [range.since, range.until]);
  const setFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(search);
    params.delete("tab");
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    navigate(analyticsPaths[tab] + (params.size ? "?" + params : ""));
  };
  const connections = trpc.channels.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const availableChannels =
    tab === "advertising"
      ? ["meta_ads"]
      : tab === "social"
        ? ["facebook"]
        : ["facebook", "meta_ads"];
  const selectedChannel = availableChannels.includes(channel) ? channel : "all";
  const availableAccounts = (connections.data?.items ?? []).filter(
    c =>
      c.status === "connected" &&
      availableChannels.includes(c.channel) &&
      (selectedChannel === "all" || c.channel === selectedChannel)
  );
  const selectedAccount = availableAccounts.some(c => c.id === account)
    ? account
    : "all";
  const selected = availableAccounts.filter(
    c => selectedAccount === "all" || c.id === selectedAccount
  );
  const bounded = selected.slice(0, 8);
  const queries = useQueries({
    queries: bounded.map(c => ({
      queryKey: ["frame-channel-report", organizationId, c.id, range],
      queryFn: () =>
        utils.client.channels.report.query({
          organizationId: organizationId!,
          connectionId: c.id,
          range,
        }),
      staleTime: 120000,
      retry: false,
    })),
  });
  const previous = useQueries({
    queries: bounded.map(c => ({
      queryKey: [
        "frame-channel-report",
        organizationId,
        c.id,
        previousRange(range),
      ],
      queryFn: () =>
        utils.client.channels.report.query({
          organizationId: organizationId!,
          connectionId: c.id,
          range: previousRange(range),
        }),
      enabled: compare,
      staleTime: 120000,
      retry: false,
    })),
  });
  const currencyGroups = new Map<
    string,
    Array<{ spend: number | null; value: number | null }>
  >();
  queries.forEach((q, i) => {
    if (q.data?.channel !== "meta_ads") return;
    const key = q.data.data.currency ?? "Unknown currency: " + bounded[i].name;
    const group = currencyGroups.get(key) ?? [];
    group.push({
      spend: q.data.data.summary.spend,
      value: q.data.data.summary.purchaseValue,
    });
    currencyGroups.set(key, group);
  });
  return (
    <>
      <PageHeader
        eyebrow={
          tab === "overview"
            ? "Analytics / Overview"
            : tab === "advertising"
              ? "Analytics / Advertising"
              : "Analytics / Social Media"
        }
        title={
          tab === "overview"
            ? "Analytics overview"
            : tab === "advertising"
              ? "Advertising analytics"
              : "Social media analytics"
        }
        description={
          tab === "overview"
            ? "Overall organic and paid performance, with channel and account filters, date comparisons and transparent attribution."
            : tab === "advertising"
              ? "Compare paid channel and campaign performance. Filter by advertising account and date range."
              : "Review social content and audience engagement. Filter by channel, Page and date range."
        }
      />
      <div className="mb-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
        <label className="text-xs">
          From
          <input
            aria-label="Analytics start date"
            type="date"
            className={channelInput + " mt-1"}
            value={draftRange.since}
            onChange={e =>
              setDraftRange(r => ({ ...r, since: e.target.value }))
            }
          />
        </label>
        <label className="text-xs">
          Through
          <input
            aria-label="Analytics end date"
            type="date"
            className={channelInput + " mt-1"}
            value={draftRange.until}
            onChange={e =>
              setDraftRange(r => ({ ...r, until: e.target.value }))
            }
          />
        </label>
        <label className="text-xs">
          Channel
          <select
            aria-label="Analytics channel"
            className={channelInput + " mt-1"}
            value={selectedChannel}
            onChange={e =>
              setFilters({ channel: e.target.value, account: "all" })
            }
          >
            <option value="all">
              {tab === "overview"
                ? "All channels"
                : tab === "advertising"
                  ? "All advertising channels"
                  : "All social channels"}
            </option>
            {availableChannels.map(c => (
              <option key={c} value={c}>
                {channelNames[c as keyof typeof channelNames]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Account
          <select
            aria-label="Analytics account"
            className={channelInput + " mt-1"}
            value={selectedAccount}
            onChange={e => setFilters({ account: e.target.value })}
          >
            <option value="all">All connected accounts</option>
            {availableAccounts.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} / {channelNames[c.channel]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compare}
            onChange={e => setFilters({ compare: e.target.checked ? "1" : "" })}
          />
          Compare previous period
        </label>
        <Button
          className="self-end"
          onClick={() => {
            const parsed = rangeSchema.safeParse(draftRange);
            if (!parsed.success)
              return window.alert("Choose a valid range of 1 to 93 days.");
            setFilters(parsed.data);
          }}
        >
          Apply date range
        </Button>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm">
          {range.since} through {range.until}
          {compare
            ? ` / Previous: ${previousRange(range).since} through ${previousRange(range).until}`
            : ""}
        </p>
        <Button
          variant="outline"
          disabled={queries.some(q => q.isFetching)}
          onClick={() => {
            queries.forEach(q => void q.refetch());
            if (compare) previous.forEach(q => void q.refetch());
          }}
        >
          Refresh reports
        </Button>
      </div>
      {connections.isLoading ? (
        <p role="status">Loading connected accounts...</p>
      ) : connections.error ? (
        <p role="alert" className="surface p-6">
          Connections could not be loaded.
        </p>
      ) : !selected.length ? (
        <div className="surface p-8">
          <h2 className="text-xl font-semibold">
            No connected accounts for this view
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            No sample performance data is shown. Account connections and
            permissions are managed in Settings / Integrations.
          </p>
          <Link
            href="/app/settings/integrations"
            className="mt-4 inline-block text-primary"
          >
            Settings / Integrations
          </Link>
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <section className="mb-6 rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold">
                Connected-channel overview
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {bounded.filter(c => c.channel === "facebook").length} Facebook
                Pages / {bounded.filter(c => c.channel === "meta_ads").length}{" "}
                Meta ad accounts. {queries.filter(q => q.isSuccess).length}{" "}
                reports loaded; {queries.filter(q => q.isError).length}{" "}
                unavailable.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {Array.from(currencyGroups).map(([currency, rows]) => (
                  <Metric
                    key={currency}
                    title={
                      "Combined ad spend - " +
                      rows.length +
                      " reported account(s)"
                    }
                    currency={currency}
                    value={
                      rows.every(r => r.spend !== null)
                        ? rows.reduce((n, r) => n + r.spend!, 0)
                        : null
                    }
                  />
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Spend is grouped by currency; no exchange-rate conversion is
                assumed. Failed or still-loading accounts are excluded and
                totals are partial until all reports load. Reach is not added
                across channels, and platform-attributed purchases are not
                deduplicated business sales. Organic Page metrics can include
                paid distribution and are not added to advertising impressions.
              </p>
            </section>
          )}
          <div className="space-y-7">
            {bounded.map((c, i) => (
              <section key={c.id} className="surface min-w-0 p-4 md:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow">{channelNames[c.channel]}</p>
                    <h2 className="mt-2 text-xl font-semibold">{c.name}</h2>
                  </div>
                  {queries[i].data && (
                    <p className="text-xs text-muted-foreground">
                      Fetched{" "}
                      {new Date(queries[i].data.refreshedAtMs).toLocaleString()}
                    </p>
                  )}
                </div>
                {queries[i].isLoading ? (
                  <p role="status">Fetching provider data...</p>
                ) : queries[i].error ? (
                  <div role="alert">
                    <p>{queries[i].error.message}</p>
                    <Link
                      href="/app/settings/integrations"
                      className="text-primary"
                    >
                      Review connection access
                    </Link>
                  </div>
                ) : (
                  queries[i].data && (
                    <ReportPanel
                      report={queries[i].data!}
                      comparison={compare ? previous[i].data : undefined}
                    />
                  )
                )}
                {compare && previous[i].isLoading && (
                  <p className="mt-4 text-xs">
                    Loading previous-period comparison...
                  </p>
                )}
                {compare && previous[i].error && (
                  <p role="alert" className="mt-4 text-xs">
                    Previous period is unavailable; no change percentage is
                    inferred.
                  </p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {selected.length > 8 && (
        <p role="alert" className="mt-4 text-sm">
          Showing eight accounts at a time to limit provider calls. Select an
          individual account for its report.
        </p>
      )}
    </>
  );
}
export default function AnalyticsPage() {
  return (
    <WorkspaceGate>
      <Analytics />
    </WorkspaceGate>
  );
}
