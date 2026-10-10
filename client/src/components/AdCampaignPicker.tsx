import { useEffect, useState } from "react";
import { Plus, RefreshCw, FolderTree } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "./ui/button";
import { channelInput } from "./ChannelConnections";
import { MetaChangeDialog } from "./MetaChangeDialog";

type AdObject = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
};
export function AdCampaignPicker({
  connectionId,
  campaignId,
  adSetId,
  onChange,
  canManage,
}: {
  connectionId: string;
  campaignId: string;
  adSetId: string;
  canManage: boolean;
  onChange: (campaignId: string, adSetId: string) => void;
}) {
  const { organizationId } = useWorkspace();
  const scope = { organizationId: organizationId!, connectionId };
  const [status, setStatus] = useState<"active" | "paused" | "all">("active");
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState<
    "create_campaign" | "create_adset" | null
  >(null);
  const objects = trpc.channels.adObjects.useQuery(
    { ...scope, filters: { status } },
    { retry: false, staleTime: 30000 }
  );
  const campaigns = objects.data?.campaigns as AdObject[] | undefined;
  const adsets = objects.data?.adsets as AdObject[] | undefined;
  const selectedSet = trpc.channels.metaObject.useQuery(
    { ...scope, kind: "adset", objectId: adSetId || "1" },
    { enabled: !!adSetId && !adsets?.some(a => a.id === adSetId), retry: false }
  );
  const selectedCampaign = trpc.channels.metaObject.useQuery(
    { ...scope, kind: "campaign", objectId: campaignId || "1" },
    {
      enabled: !!campaignId && !campaigns?.some(a => a.id === campaignId),
      retry: false,
    }
  );
  const selectedAdSet =
    adsets?.find(a => a.id === adSetId) ??
    (selectedSet.data?.object as AdObject | undefined);
  useEffect(() => {
    if (!campaignId && selectedAdSet?.campaign_id)
      onChange(String(selectedAdSet.campaign_id), adSetId);
  }, [selectedAdSet?.campaign_id, campaignId, adSetId]);
  const parent =
    campaigns?.find(a => a.id === campaignId) ??
    (selectedCampaign.data?.object as AdObject | undefined);
  const matches = (row: AdObject) =>
    `${row.name} ${row.id}`.toLowerCase().includes(search.toLowerCase());
  function options(
    rows: AdObject[],
    selected: AdObject | undefined,
    id: string
  ) {
    const visible = rows.filter(matches);
    if (id && !visible.some(a => String(a.id) === id))
      visible.unshift(
        selected ?? { id, name: "Selected item (loading or unavailable)" }
      );
    return visible.map(row => (
      <option
        key={row.id}
        value={String(row.id)}
        disabled={["ARCHIVED", "DELETED"].includes(row.status ?? "")}
      >
        {row.name} ·{" "}
        {(row.effective_status || row.status || "unknown")
          .toLowerCase()
          .replaceAll("_", " ")}
        {String(row.id) === id && !rows.some(a => String(a.id) === id)
          ? " (selected)"
          : ""}
      </option>
    ));
  }
  return (
    <section
      className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4"
      aria-label="Campaign and ad set"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderTree size={18} className="text-primary" />
          <h3 className="font-semibold">Campaign & ad set</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={objects.isFetching}
          onClick={() => {
            void objects.refetch();
            if (adSetId) void selectedSet.refetch();
            if (campaignId) void selectedCampaign.refetch();
          }}
        >
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <label className="space-y-2 text-xs text-muted-foreground">
          Find a campaign or ad set
          <input
            className={channelInput}
            placeholder="Search name or ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <label className="space-y-2 text-xs text-muted-foreground">
          Show
          <select
            aria-label="Campaign and ad set status"
            className={channelInput}
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="all">All statuses</option>
          </select>
        </label>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="pub-meta-campaign" className="text-sm font-medium">
            Campaign
          </label>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCreate("create_campaign")}
            >
              <Plus size={14} /> New campaign
            </Button>
          )}
        </div>
        <select
          id="pub-meta-campaign"
          className={channelInput}
          value={campaignId}
          disabled={objects.isLoading}
          onChange={e => onChange(e.target.value, "")}
        >
          <option value="">
            {objects.isLoading ? "Loading campaigns…" : "Select a campaign"}
          </option>
          {options(campaigns ?? [], parent, campaignId)}
        </select>
        {!objects.isLoading &&
          !objects.error &&
          !campaigns?.filter(matches).length && (
            <p className="text-xs text-muted-foreground">
              No {status === "all" ? "matching" : status} campaigns found. Try
              All statuses or create a campaign.
            </p>
          )}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="pub-adset" className="text-sm font-medium">
            Ad set
          </label>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={
                !campaignId ||
                !parent ||
                ["ARCHIVED", "DELETED"].includes(parent.status ?? "")
              }
              onClick={() => setCreate("create_adset")}
            >
              <Plus size={14} /> New ad set
            </Button>
          )}
        </div>
        <select
          id="pub-adset"
          className={channelInput}
          value={adSetId}
          disabled={!campaignId || objects.isLoading}
          onChange={e => onChange(campaignId, e.target.value)}
        >
          <option value="">
            {campaignId ? "Select an ad set" : "Choose a campaign first"}
          </option>
          {options(
            (adsets ?? []).filter(a => String(a.campaign_id) === campaignId),
            selectedAdSet,
            adSetId
          )}
        </select>
        {campaignId &&
          !objects.isLoading &&
          !objects.error &&
          !(adsets ?? []).some(
            a => String(a.campaign_id) === campaignId && matches(a)
          ) && (
            <p className="text-xs text-muted-foreground">
              No {status === "all" ? "matching" : status} ad sets in this
              campaign. Try All statuses or create an ad set.
            </p>
          )}
      </div>
      {objects.isFetching && (
        <p role="status" className="text-xs text-muted-foreground">
          Refreshing Meta campaigns and ad sets…
        </p>
      )}
      {(objects.error || selectedSet.error || selectedCampaign.error) && (
        <p role="alert" className="text-sm text-destructive">
          {objects.error?.message ||
            selectedSet.error?.message ||
            selectedCampaign.error?.message}
        </p>
      )}
      {objects.data?.truncated && (
        <p role="status" className="text-xs text-muted-foreground">
          Meta returned a partial list. Narrow the status filter or open Meta
          Ads Manager if an item is missing.
        </p>
      )}
      {!!adSetId &&
        (selectedAdSet?.effective_status || selectedAdSet?.status) !==
          "ACTIVE" && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            The selected ad set is not active. You can prepare the ad here; it
            will remain paused when created in Meta.
          </p>
        )}
      <p className="text-xs text-muted-foreground">
        You can save a draft before choosing a campaign. A campaign and ad set
        are needed before delivery.
      </p>
      {create && (
        <MetaChangeDialog
          connectionId={connectionId}
          kind={create}
          campaignId={campaignId || undefined}
          onClose={() => setCreate(null)}
          onSaved={id => {
            if (!id) return;
            onChange(
              create === "create_campaign" ? id : campaignId,
              create === "create_adset" ? id : ""
            );
            void objects.refetch();
          }}
        />
      )}
    </section>
  );
}
