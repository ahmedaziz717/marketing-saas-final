import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import type {
  GoogleAssetMetricsDays,
  GoogleAssetMetricsResult,
} from "@shared/googleAssetMetrics";

type MetricsState = {
  data?: GoogleAssetMetricsResult;
  loading: boolean;
  error: boolean;
};
const MetricsContext = createContext<MetricsState | null>(null);
export function GoogleAssetMetricsProvider({
  organizationId,
  connectionId,
  campaignId,
  assetGroupId,
  children,
}: {
  organizationId: number;
  connectionId: string;
  campaignId: string;
  assetGroupId: string;
  children: ReactNode;
}) {
  const [days, setDays] = useState<GoogleAssetMetricsDays>(30);
  const query = trpc.googleAds.campaigns.assetMetrics.useQuery(
    { organizationId, connectionId, campaignId, assetGroupId, days },
    {
      enabled: Boolean(connectionId && campaignId && assetGroupId),
      staleTime: 60_000,
      retry: false,
    }
  );
  // Never retain metrics from a different account/group/period as placeholder data.
  const state = useMemo(
    () => ({
      data: query.isError ? undefined : query.data,
      loading: query.isPending,
      error: query.isError,
    }),
    [query.data, query.isPending, query.isError]
  );
  return (
    <MetricsContext.Provider value={state}>
      <div
        className="mb-3 rounded-xl border bg-muted/20 p-3 text-xs"
        aria-label="Asset performance period"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            Performance
            <select
              aria-label="Asset performance period"
              value={days}
              onChange={event =>
                setDays(Number(event.target.value) as GoogleAssetMetricsDays)
              }
              className="rounded-md border bg-background px-2 py-1.5"
            >
              <option value={7}>Last 7 complete days</option>
              <option value={30}>Last 30 complete days</option>
              <option value={90}>Last 90 complete days</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Refresh performance
          </Button>
          {query.data?.since && (
            <span>
              {query.data.since} – {query.data.until}
            </span>
          )}
          {query.data?.timezone && <span>{query.data.timezone}</span>}
        </div>
        <p className="mt-2 text-muted-foreground">
          Performance in this asset group. Asset metrics overlap and ratios are
          directional, not standalone results. Conversion rate uses ad
          interactions, not only clicks.
        </p>
        {(query.isError || query.data?.status === "unavailable") && (
          <p role="status" className="mt-2">
            Performance is unavailable. You can still browse and select assets.
          </p>
        )}
      </div>
      {children}
    </MetricsContext.Provider>
  );
}
const count = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const percent = (value: number | null) =>
  value === null
    ? "—"
    : `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
export function GoogleAssetMetrics({ resourceName }: { resourceName: string }) {
  const state = useContext(MetricsContext);
  if (!state) return null;
  if (state.loading)
    return (
      <p className="text-xs text-muted-foreground">Loading performance…</p>
    );
  if (state.error || state.data?.status !== "available")
    return (
      <p className="text-xs text-muted-foreground">Performance unavailable</p>
    );
  const row = state.data.rows.find(item => item.resourceName === resourceName);
  if (!row)
    return (
      <p className="text-xs text-muted-foreground">
        No reported activity in this period
      </p>
    );
  return (
    <dl
      className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"
      aria-label="Asset performance"
    >
      <div>
        <dt className="text-muted-foreground">Impressions</dt>
        <dd>{count(row.impressions)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">CTR</dt>
        <dd>{percent(row.ctr)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Conversions</dt>
        <dd>{count(row.conversions)}</dd>
      </div>
      <div>
        <dt
          className="text-muted-foreground"
          title="Conversions from ad interactions divided by ad interactions"
        >
          Conv. rate
        </dt>
        <dd>{percent(row.conversionRate)}</dd>
      </div>
    </dl>
  );
}
