import { useState } from "react";
import { Link } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { channelInput } from "@/components/ChannelConnections";
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
