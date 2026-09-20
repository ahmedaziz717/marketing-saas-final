import { useState } from "react";
import { Link } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  ChannelConnectionCard,
  channelInput,
} from "@/components/ChannelConnections";
import { PublishingCalendar } from "@/components/PublishingCalendar";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
function CampaignObjects({ connectionId }: { connectionId: string }) {
  const { organizationId } = useWorkspace();
  const [view, setView] = useState<"campaigns" | "adsets" | "ads">("campaigns"),
    [campaign, setCampaign] = useState("");
  const query = trpc.channels.adObjects.useQuery(
    { organizationId: organizationId!, connectionId },
    { retry: false, staleTime: 60000 }
  );
  const items = (query.data?.[view] ?? []).filter(
    i => !campaign || String(i.campaign_id || i.id) === campaign
  );
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["campaigns", "adsets", "ads"] as const).map(v => (
          <Button
            key={v}
            variant={view === v ? "default" : "outline"}
            onClick={() => setView(v)}
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
      <select
        aria-label="Filter by campaign"
        className={channelInput + " max-w-md"}
        value={campaign}
        onChange={e => setCampaign(e.target.value)}
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
                <th className="p-3">Meta ID</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-t">
                  <td className="max-w-sm break-words p-3">{String(i.name)}</td>
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
                  <td className="p-3 text-xs">{String(i.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data?.truncated && (
        <p className="text-xs">
          Showing a bounded provider result (up to 500 objects per type). Some
          history may be omitted.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        These are read-only views of existing Meta objects. Prepare paused image
        ads through Publishing; campaign creation, audience editing, budget
        changes and activation remain in Meta Ads Manager for this release.
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
        eyebrow="Paid channels"
        title="Advertising"
        description="Inspect your paid campaigns, prepare approved creative delivery and compare results. Paid budgets remain separate from organic publishing."
      />
      <nav
        aria-label="Advertising channels"
        className="mb-6 flex flex-wrap gap-3 rounded-xl border bg-card p-3"
      >
        <Link
          href="/app/advertising/meta"
          className="rounded-lg bg-primary/10 px-4 py-2 font-semibold text-primary"
        >
          Meta Ads / Facebook & Instagram
        </Link>
        <span className="px-4 py-2 text-sm text-muted-foreground">
          Google Ads - planned
        </span>
        <span className="px-4 py-2 text-sm text-muted-foreground">
          Microsoft Advertising - planned
        </span>
      </nav>
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
          href="/app/analytics?tab=advertising"
          className="ml-auto self-center text-sm text-primary"
        >
          Advertising analytics
        </Link>
      </div>
      {tab === "calendar" ? (
        <PublishingCalendar channelScope="meta_ads" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ChannelConnectionCard channel="meta_ads" />
            <div className="surface p-6">
              <h2 className="text-xl font-semibold">
                Approved creative, controlled delivery
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Choose an approved image, write channel-specific ad copy, and
                select an existing ad set. Publishing records the final approval
                and delivers the new ad paused. Review budgets, targeting and
                launch in Meta Ads Manager.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/app/publishing?new=1&channel=meta_ads">
                  <Button>Prepare an image ad</Button>
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
