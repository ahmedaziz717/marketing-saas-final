import { DateRangeFilter } from "@/components/DateRangeFilter";
import { MetaChangeDialog } from "@/components/MetaChangeDialog";
import { PublicationComposer } from "@/components/PublicationComposer";
import type { MetaChange } from "@shared/metaManagement";
import { useState } from "react";
import { Link } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { channelInput } from "@/components/ChannelConnections";
import { PublishingCalendar } from "@/components/PublishingCalendar";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  dateInZone,
  moveDate,
  type AdBrowseFilters,
  type DateRange,
} from "@shared/channels";
function CampaignObjects({ connectionId }: { connectionId: string }) {
  const { organizationId, membership } = useWorkspace();
  const canManage = ["owner", "admin", "publisher"].includes(
    membership?.role ?? ""
  );
  const [change, setChange] = useState<{
    kind: MetaChange["kind"];
    objectId?: string;
    campaignId?: string;
  } | null>(null);
  const [adSet, setAdSet] = useState("");
  const [compose, setCompose] = useState<string | null>(null);
  const [view, setView] = useState<"campaigns" | "adsets" | "ads">("campaigns"),
    [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState<AdBrowseFilters["status"]>("active");
  const [range, setRange] = useState<DateRange | undefined>();
  const today = dateInZone(Date.now(), "UTC").slice(0, 10);
  const query = trpc.channels.adObjects.useQuery(
    {
      organizationId: organizationId!,
      connectionId,
      filters: {
        status,
        range,
        performanceRange: range ?? {
          since: moveDate(today, -29),
          until: today,
        },
      },
    },
    { retry: false, staleTime: 60000 }
  );
  const items = (query.data?.[view] ?? []).filter(
    i =>
      (!campaign || String(i.campaign_id || i.id) === campaign) &&
      (view !== "ads" || !adSet || String(i.adset_id) === adSet)
  );
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setView("campaigns");
            setCampaign("");
            setAdSet("");
          }}
        >
          All campaigns
        </Button>
        {campaign && (
          <Button
            variant="ghost"
            onClick={() => {
              setView("adsets");
              setAdSet("");
            }}
          >
            Campaign{" "}
            {query.data?.campaigns.find(c => String(c.id) === campaign)?.name ??
              campaign}
          </Button>
        )}
        {adSet && (
          <span className="text-sm">
            Ad set{" "}
            {query.data?.adsets.find(a => String(a.id) === adSet)?.name ??
              adSet}
          </span>
        )}
        <Button
          className="ml-auto"
          disabled={!canManage}
          onClick={() => setChange({ kind: "create_campaign" })}
        >
          New campaign
        </Button>
        {campaign && (
          <Button
            disabled={!canManage}
            onClick={() =>
              setChange({ kind: "create_adset", campaignId: campaign })
            }
          >
            New ad set
          </Button>
        )}
        {adSet && (
          <Button disabled={!canManage} onClick={() => setCompose(adSet)}>
            New ad
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Performance: {range?.since ?? moveDate(today, -29)} through{" "}
        {range?.until ?? today}. Spend and conversion values use the account
        currency and Meta attribution; ROAS is attributed purchase value ÷
        spend.
      </p>
      {change && (
        <MetaChangeDialog
          connectionId={connectionId}
          {...change}
          onClose={() => setChange(null)}
          onSaved={() => {
            void query.refetch();
          }}
        />
      )}
      {compose !== null && (
        <PublicationComposer
          initialChannel="meta_ads"
          initialConnectionId={connectionId}
          initialAdSetId={compose}
          onClose={() => setCompose(null)}
          onSaved={() => {
            setCompose(null);
            window.location.assign("/app/publishing");
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["campaigns", "adsets", "ads"] as const).map(v => (
          <Button
            key={v}
            variant={view === v ? "default" : "outline"}
            onClick={() => {
              setView(v);
              if (v !== "ads") setAdSet("");
            }}
          >
            {v === "adsets" ? "Ad sets" : v === "ads" ? "Ads" : "Campaigns"}
          </Button>
        ))}
        <Button
          className="ml-auto"
          variant="ghost"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          Refresh from Meta
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Current status
          <select
            aria-label="Filter by status"
            className={channelInput + " mt-1 block"}
            value={status}
            onChange={e => {
              setStatus(e.target.value as AdBrowseFilters["status"]);
              setCampaign("");
              setAdSet("");
            }}
          >
            <option value="active">Active</option>
            <option value="paused">Paused (including parent paused)</option>
            <option value="all">All statuses</option>
            <option value="archived">Archived</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <DateRangeFilter
          value={range}
          allowAll
          label="Delivery dates"
          onChange={next => {
            setRange(next);
            setCampaign("");
            setAdSet("");
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Status reflects the current state in Meta.{" "}
        {range
          ? `Showing items with impressions from ${range.since} through ${range.until}, using the ad account’s reporting time zone.`
          : "All dates includes items that have not delivered yet."}
      </p>
      <select
        aria-label="Filter by campaign"
        className={channelInput + " max-w-md"}
        value={campaign}
        onChange={e => {
          setCampaign(e.target.value);
          setAdSet("");
        }}
      >
        <option value="">All campaigns</option>
        {query.data?.campaigns.map(c => (
          <option key={c.id} value={String(c.id)}>
            {String(c.name)}
          </option>
        ))}
      </select>
      {query.isLoading ? (
        <p role="status">Loading campaigns, ad sets and ads...</p>
      ) : query.error ? (
        <p role="alert" className="surface p-6">
          {query.error.message}
        </p>
      ) : !items.length ? (
        <p className="surface p-6">
          No matching {view === "adsets" ? "ad sets" : view} returned.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Status</th>
                <th className="p-3">Details</th>
                <th className="p-3">Budget</th>
                <th className="p-3">Spend</th>
                <th className="p-3">Purchases</th>
                <th className="p-3">Revenue</th>
                <th className="p-3">ROAS</th>
                <th className="p-3">CPC</th>
                <th className="p-3">CTR</th>
                <th className="p-3">Impressions</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-t">
                  <td className="max-w-sm break-words p-3">
                    <button
                      className="text-left font-medium text-primary underline"
                      onClick={() => {
                        if (view === "campaigns") {
                          setCampaign(String(i.id));
                          setAdSet("");
                          setView("adsets");
                        } else if (view === "adsets") {
                          setCampaign(String(i.campaign_id));
                          setAdSet(String(i.id));
                          setView("ads");
                        } else
                          setChange({
                            kind: "update_ad",
                            objectId: String(i.id),
                          });
                      }}
                    >
                      {String(i.name)}
                    </button>
                    {i.creative?.thumbnail_url && (
                      <img
                        src={i.creative.thumbnail_url}
                        alt="Ad creative"
                        className="mt-2 h-16 w-20 rounded object-contain"
                      />
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(i.id)}
                    </p>
                  </td>
                  <td className="p-3">
                    {String(i.effective_status || i.status || "Unavailable")}
                  </td>
                  <td className="p-3 text-xs">
                    {view === "campaigns"
                      ? String(i.objective || "")
                      : view === "adsets"
                        ? [i.optimization_goal, i.billing_event]
                            .filter(Boolean)
                            .join(" / ")
                        : i.creative?.id
                          ? "Creative " + i.creative.id
                          : "Creative unavailable"}
                  </td>
                  <td className="p-3 text-xs">
                    {i.daily_budget
                      ? `${(Number(i.daily_budget) / 100).toFixed(2)} ${query.data?.currency ?? ""}/day`
                      : i.lifetime_budget
                        ? `${(Number(i.lifetime_budget) / 100).toFixed(2)} lifetime`
                        : view === "campaigns"
                          ? "ABO · ad-set budgets"
                          : "Parent budget"}
                    {view === "campaigns" &&
                    (i.daily_budget || i.lifetime_budget)
                      ? " · CBO"
                      : ""}
                  </td>
                  <td className="p-3">
                    {i.performance?.spend?.toFixed(2) ?? "—"}
                  </td>
                  <td className="p-3">{i.performance?.purchases ?? "—"}</td>
                  <td className="p-3">
                    {i.performance?.purchaseValue?.toFixed(2) ?? "—"}
                  </td>
                  <td className="p-3">
                    {i.performance?.roas != null
                      ? i.performance.roas.toFixed(2) + "×"
                      : "—"}
                  </td>
                  <td className="p-3">
                    {i.performance?.clicks > 0 && i.performance?.spend != null
                      ? (i.performance.spend / i.performance.clicks).toFixed(2)
                      : "—"}
                  </td>
                  <td className="p-3">
                    {i.performance?.impressions > 0 &&
                    i.performance?.clicks != null
                      ? (
                          (100 * i.performance.clicks) /
                          i.performance.impressions
                        ).toFixed(2) + "%"
                      : "—"}
                  </td>
                  <td className="p-3">
                    {i.performance?.impressions?.toLocaleString() ?? "—"}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage}
                      onClick={() =>
                        setChange({
                          kind:
                            view === "campaigns"
                              ? "update_campaign"
                              : view === "adsets"
                                ? "update_adset"
                                : "update_ad",
                          objectId: String(i.id),
                        })
                      }
                    >
                      Settings
                    </Button>
                    {view === "campaigns" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManage}
                        onClick={() =>
                          setChange({
                            kind: "create_adset",
                            campaignId: String(i.id),
                          })
                        }
                      >
                        Add ad set
                      </Button>
                    )}
                    {view === "adsets" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManage}
                        onClick={() => setCompose(String(i.id))}
                      >
                        Add ad
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data?.truncated && (
        <p className="text-xs">
          Results are partial (up to 500 records per request). Narrow the date
          range to explore more history.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        New campaigns, ad sets, and ads start paused. Changes require a fresh
        review and explicit approval. Some specialized objectives,
        lifetime-budget edits, and switching existing campaigns between ABO and
        CBO still require Meta Ads Manager.
      </p>
    </section>
  );
}
function Advertising() {
  const { organizationId } = useWorkspace();
  const [selected, setSelected] = useState(""),
    [tab, setTab] = useState<"campaigns" | "calendar">("campaigns");
  const query = trpc.channels.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const accounts =
    query.data?.items.filter(
      c => c.channel === "meta_ads" && c.status === "connected"
    ) ?? [];
  const id = accounts.find(c => c.id === selected)?.id ?? accounts[0]?.id;
  return (
    <>
      <PageHeader
        eyebrow="Advertising / Meta"
        title="Meta Ads"
        description="Manage Facebook and Instagram advertising, inspect campaigns, and prepare approved creative delivery. Paid budgets remain separate from organic publishing."
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Button
          variant={tab === "campaigns" ? "default" : "outline"}
          onClick={() => setTab("campaigns")}
        >
          Campaigns, ad sets & ads
        </Button>
        <Button
          variant={tab === "calendar" ? "default" : "outline"}
          onClick={() => setTab("calendar")}
        >
          Creative delivery calendar
        </Button>
        <Link
          href="/app/analytics/advertising"
          className="ml-auto self-center text-sm text-primary"
        >
          Advertising analytics
        </Link>
      </div>
      {tab === "calendar" ? (
        <PublishingCalendar channelScope="meta_ads" />
      ) : (
        <>
          <div>
            <div className="surface p-6">
              <h2 className="text-xl font-semibold">
                Approved creative, controlled delivery
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Choose approved images, write channel-specific ad copy, and
                select an existing ad set. Publishing records the final approval
                and delivers the new ad paused. Explore performance and review
                budgets, targeting, and delivery settings below.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/app/creatives/ads?new=1">
                  <Button>Create an ad</Button>
                </Link>
                <Link href="/app/advertising/meta/legacy">
                  <Button variant="outline">
                    Previous publishing requests
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Existing legacy connection and requests are retained. Revalidate
                the account under Integrations to use the new channel workflow.
              </p>
            </div>
          </div>
          {query.isLoading ? (
            <p role="status" className="mt-6 text-sm">
              Loading ad accounts...
            </p>
          ) : query.error ? (
            <div role="alert" className="mt-6 text-sm">
              <p>Could not load ad accounts.</p>
              <Button variant="ghost" onClick={() => query.refetch()}>
                Try again
              </Button>
            </div>
          ) : !accounts.length ? (
            <p className="mt-6 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
              No ad accounts connected. Account setup is managed in{" "}
              <Link
                href="/app/settings/integrations"
                className="font-medium text-primary underline underline-offset-4"
              >
                Settings / Integrations
              </Link>
              . You can still prepare drafts and plan your calendar here.
            </p>
          ) : null}
          {accounts.length > 0 && (
            <>
              <label
                htmlFor="advertising-account"
                className="mt-6 block text-sm font-semibold"
              >
                Meta ad account
              </label>
              <select
                id="advertising-account"
                className={channelInput + " mt-2 max-w-md"}
                value={id}
                onChange={e => setSelected(e.target.value)}
              >
                {accounts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} / {c.details.currency ?? "Currency unavailable"}
                  </option>
                ))}
              </select>
              {id && <CampaignObjects key={id} connectionId={id} />}
            </>
          )}
        </>
      )}
    </>
  );
}
export default function AdvertisingPage() {
  return (
    <WorkspaceGate>
      <Advertising />
    </WorkspaceGate>
  );
}
