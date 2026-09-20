import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { channelInput } from "./ChannelConnections";
import {
  channelNames,
  contentSchema,
  dateInZone,
  localScheduleToUtc,
  statusLabel,
  editablePublication,
  type Channel,
  type PublicationContent,
} from "@shared/channels";
import type { Publication } from "../../../drizzle/channelSchema";
export type { Publication };
export function PublicationStatus({
  item,
}: {
  item: Pick<Publication, "state" | "channel" | "result">;
}) {
  const label =
    item.state === "scheduled" && item.result?.deliveryMode === "test"
      ? "Test schedule - not live"
      : item.state === "published" && item.channel === "meta_ads"
        ? "Created in Meta - paused"
        : statusLabel(item.state);
  return (
    <span className="inline-flex max-w-full rounded-full border bg-muted px-2.5 py-1 text-xs">
      {label}
    </span>
  );
}
export function PublicationComposer({
  item,
  initialChannel = "facebook",
  initialAssetKey,
  initialTime,
  initialTimezone,
  onClose,
  onSaved,
}: {
  item?: Publication;
  initialChannel?: Channel;
  initialAssetKey?: string;
  initialTime?: string;
  initialTimezone?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { organizationId } = useWorkspace();
  const utils = trpc.useUtils();
  const [id] = useState(() => item?.id ?? crypto.randomUUID());
  const [channel, setChannel] = useState<Channel>(
    item?.channel ?? initialChannel
  );
  const [connectionId, setConnection] = useState(item?.connectionId ?? "");
  const [assetKey, setAsset] = useState(
    item?.assetKey ?? initialAssetKey ?? ""
  );
  const [content, setContent] = useState<PublicationContent>(
    item?.content ?? contentSchema.parse({ title: "Untitled post" })
  );
  const [timezone, setTimezone] = useState(
    item?.timezone ??
      initialTimezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [local, setLocal] = useState(
    item?.scheduledAtMs
      ? dateInZone(item.scheduledAtMs, item.timezone)
      : (initialTime ?? "")
  );
  const scope = { organizationId: organizationId! };
  const connections = trpc.channels.connections.useQuery(scope, {
    enabled: !!organizationId,
  });
  const assets = trpc.assetLibrary.list.useQuery(scope, {
    enabled: !!organizationId,
  });
  const objects = trpc.channels.adObjects.useQuery(
    {
      ...scope,
      connectionId: connectionId || "00000000-0000-4000-8000-000000000000",
    },
    {
      enabled: channel === "meta_ads" && !!connectionId,
      retry: false,
      staleTime: 60000,
    }
  );
  const save = trpc.publishing.save.useMutation({
    onSuccess: async result => {
      await utils.publishing.list.invalidate();
      toast.success("Draft saved. Nothing has been scheduled or published.");
      onSaved(result.id);
    },
    onError: e => toast.error(e.message),
  });
  const selectedAsset = assets.data?.find(a => a.key === assetKey);
  const setField = (key: keyof PublicationContent, value: string) =>
    setContent(c => ({ ...c, [key]: value }));
  function submit() {
    try {
      const at = local ? localScheduleToUtc(local, timezone) : null;
      if (at && at <= Date.now())
        throw new Error(
          "Choose a future date, or clear the schedule to use Publish now."
        );
      save.mutate({
        ...scope,
        id,
        revision: item?.revision ?? 0,
        channel,
        connectionId: connectionId || null,
        assetKey: assetKey || null,
        content,
        timezone,
        scheduledAtMs: at,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check the selected time.");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {item ? "Edit publication" : "Create publication"}
          </DialogTitle>
          <DialogDescription>
            Assemble a channel-specific post or ad using approved assets. Saving
            a draft is not publishing approval.
          </DialogDescription>
        </DialogHeader>
        <fieldset
          className="grid min-w-0 gap-4 sm:grid-cols-2"
          disabled={save.isPending}
        >
          <div>
            <Label htmlFor="pub-channel">Channel</Label>
            <select
              id="pub-channel"
              className={channelInput}
              value={channel}
              onChange={e => {
                setChannel(e.target.value as Channel);
                setConnection("");
                setField("adSetId", "");
              }}
            >
              <option value="facebook">Facebook - organic</option>
              <option value="meta_ads">Meta Ads - paid</option>
            </select>
          </div>
          <div>
            <Label htmlFor="pub-destination">Destination</Label>
            <select
              id="pub-destination"
              className={channelInput}
              value={connectionId}
              onChange={e => {
                setConnection(e.target.value);
                setField("adSetId", "");
              }}
            >
              <option value="">Select a connected account</option>
              {connections.data?.items
                .filter(
                  c =>
                    c.channel === channel &&
                    c.status === "connected" &&
                    !c.expired
                )
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.details.capabilities.includes("publish")
                      ? ""
                      : " (read only)"}
                  </option>
                ))}
            </select>
            <Link
              href="/app/settings/integrations"
              className="mt-1 inline-block text-xs text-primary"
            >
              Manage channel connections
            </Link>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pub-title">Internal title</Label>
            <input
              id="pub-title"
              className={channelInput}
              maxLength={180}
              value={content.title}
              onChange={e => setField("title", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pub-asset">Approved finished asset</Label>
            <select
              id="pub-asset"
              className={channelInput}
              value={assetKey}
              onChange={e => setAsset(e.target.value)}
            >
              <option value="">
                {channel === "facebook"
                  ? "No media - text or link post"
                  : "Choose an approved image"}
              </option>
              {assets.data
                ?.filter(
                  a =>
                    a.state === "approved" &&
                    a.purpose === "finished" &&
                    (a.mediaType === "image" ||
                      (channel === "facebook" && a.mediaType === "video"))
                )
                .map(a => (
                  <option key={a.key} value={a.key}>
                    {a.name}
                  </option>
                ))}
            </select>
            {assets.error && (
              <p role="alert" className="text-xs">
                The approved library could not be loaded.
              </p>
            )}
            {selectedAsset && (
              <div className="mt-3 rounded-xl bg-muted/50 p-3">
                {selectedAsset.mediaType === "video" ? (
                  <video
                    src={selectedAsset.url}
                    controls
                    preload="metadata"
                    className="mx-auto max-h-52 max-w-full"
                  />
                ) : (
                  <img
                    src={selectedAsset.url}
                    alt={selectedAsset.name}
                    className="mx-auto max-h-52 max-w-full object-contain"
                  />
                )}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pub-message">
              {channel === "facebook"
                ? "Post text / caption"
                : "Primary ad text"}
            </Label>
            <textarea
              id="pub-message"
              className={channelInput + " min-h-28"}
              maxLength={5000}
              value={content.message}
              onChange={e => setField("message", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pub-link">
              {channel === "facebook"
                ? "Link preview URL (text/link posts only)"
                : "Destination URL"}
            </Label>
            <input
              id="pub-link"
              type="url"
              className={channelInput}
              placeholder="https://"
              value={content.link}
              onChange={e => setField("link", e.target.value)}
            />
            {channel === "facebook" && assetKey && (
              <p className="mt-1 text-xs text-muted-foreground">
                For a media post, leave this field empty and include any URL in
                the caption.
              </p>
            )}
          </div>
          {channel === "meta_ads" && (
            <>
              <div className="sm:col-span-2">
                <Label htmlFor="pub-adset">Existing Meta ad set</Label>
                <select
                  id="pub-adset"
                  className={channelInput}
                  value={content.adSetId}
                  onChange={e => setField("adSetId", e.target.value)}
                >
                  <option value="">Select an ad set</option>
                  {objects.data?.adsets.map(a => (
                    <option key={a.id} value={String(a.id)}>
                      {String(a.name)} ({String(a.status)})
                    </option>
                  ))}
                </select>
                {objects.isFetching && (
                  <p className="text-xs" role="status">
                    Loading ad sets...
                  </p>
                )}
                {objects.error && (
                  <p role="alert" className="text-xs">
                    {objects.error.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="pub-headline">Headline</Label>
                <input
                  id="pub-headline"
                  className={channelInput}
                  maxLength={200}
                  value={content.headline}
                  onChange={e => setField("headline", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pub-cta">Call to action</Label>
                <select
                  id="pub-cta"
                  className={channelInput}
                  value={content.callToAction}
                  onChange={e => setField("callToAction", e.target.value)}
                >
                  {["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "GET_OFFER"].map(c => (
                    <option key={c} value={c}>
                      {statusLabel(c.toLowerCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pub-description">Description</Label>
                <input
                  id="pub-description"
                  className={channelInput}
                  maxLength={300}
                  value={content.description}
                  onChange={e => setField("description", e.target.value)}
                />
              </div>
              <p className="rounded-xl bg-muted p-3 text-sm sm:col-span-2">
                This release creates an image ad as <strong>PAUSED</strong> in
                the selected existing ad set. It does not create a campaign, set
                a budget, or activate spending. Launch in Meta Ads Manager after
                reviewing the campaign and budget.
              </p>
            </>
          )}
          <div>
            <Label htmlFor="pub-date">Scheduled date and time</Label>
            <input
              id="pub-date"
              type="datetime-local"
              className={channelInput}
              value={local}
              onChange={e => setLocal(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setLocal("")}
              className="mt-1 text-xs text-primary"
            >
              Clear time - queue after approval
            </button>
          </div>
          <div>
            <Label htmlFor="pub-timezone">Time zone</Label>
            <input
              id="pub-timezone"
              className={channelInput}
              value={timezone}
              placeholder="America/New_York"
              onChange={e => setTimezone(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Time is interpreted in this time zone, not the account's reporting
              time zone.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pub-campaign-label">
              Campaign label (optional)
            </Label>
            <input
              id="pub-campaign-label"
              className={channelInput}
              value={content.campaignLabel}
              onChange={e => setField("campaignLabel", e.target.value)}
            />
          </div>
        </fieldset>
        {item && (
          <p className="text-sm text-muted-foreground">
            Saving changes clears the previous publication approval and removes
            any queued schedule. The asset's separate approval is unchanged.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || !content.title.trim()}
            onClick={submit}
          >
            {save.isPending ? "Saving..." : "Save draft"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function PublicationDetails({
  item,
  onClose,
  onEdit,
}: {
  item: Publication;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [note, setNote] = useState(""),
    [externalId, setExternalId] = useState("");
  const scope = { organizationId: organizationId! };
  const version = { ...scope, id: item.id, revision: item.revision };
  const history = trpc.publishing.history.useQuery({ ...scope, id: item.id });
  const connections = trpc.channels.connections.useQuery(scope);
  const canEdit = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  const canPublish = ["owner", "admin", "publisher"].includes(
    membership?.role ?? ""
  );
  const live =
    item.channel === "facebook"
      ? connections.data?.liveSocial
      : connections.data?.liveAds;
  const success = async () => {
    await Promise.all([
      utils.publishing.list.invalidate(),
      utils.publishing.history.invalidate(),
    ]);
    setNote("");
  };
  const error = (e: { message: string }) => {
    toast.error(e.message);
    void success();
  };
  const submit = trpc.publishing.submit.useMutation({
    onSuccess: success,
    onError: error,
  });
  const review = trpc.publishing.review.useMutation({
    onSuccess: success,
    onError: error,
  });
  const queue = trpc.publishing.queue.useMutation({
    onSuccess: async r => {
      await success();
      toast.success(
        r.liveEnabled
          ? "Queued for delivery by the publishing worker."
          : "Test schedule saved. Live delivery is disabled."
      );
    },
    onError: error,
  });
  const cancel = trpc.publishing.cancel.useMutation({
    onSuccess: success,
    onError: error,
  });
  const retry = trpc.publishing.retry.useMutation({
    onSuccess: success,
    onError: error,
  });
  const resetFailed = trpc.publishing.resetFailed.useMutation({
    onSuccess: success,
    onError: error,
  });
  const reconcile = trpc.publishing.reconcile.useMutation({
    onSuccess: success,
    onError: error,
  });
  const busy =
    submit.isPending ||
    review.isPending ||
    queue.isPending ||
    cancel.isPending ||
    retry.isPending ||
    reconcile.isPending ||
    resetFailed.isPending;
  const reviewable = [
    "draft",
    "needs_review",
    "approved",
    "scheduled",
  ].includes(item.state);
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="break-words">
            {item.content.title}
          </DialogTitle>
          <DialogDescription>
            {channelNames[item.channel]} publication. Approval applies to this
            caption, asset version, destination and schedule.
          </DialogDescription>
        </DialogHeader>
        <PublicationStatus item={item} />
        <p className="text-sm">
          Destination:{" "}
          {connections.data?.items.find(c => c.id === item.connectionId)
            ?.name ?? "Not selected"}
        </p>
        <p className="text-sm">
          {item.scheduledAtMs
            ? new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: item.timezone,
              }).format(item.scheduledAtMs) +
              " (" +
              item.timezone +
              ")"
            : "No scheduled time - queue after approval"}
        </p>
        <p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-4 text-sm">
          {item.content.message || "No caption"}
        </p>
        {item.content.link && (
          <p className="break-all text-sm">
            Destination URL: {item.content.link}
          </p>
        )}
        {item.assetKey && (
          <Link
            href={"/app/library?asset=" + encodeURIComponent(item.assetKey)}
            className="text-sm text-primary"
          >
            Review attached asset
          </Link>
        )}
        {item.channel === "meta_ads" && (
          <p className="rounded-xl border p-3 text-sm">
            Meta ad delivery creates a paused image ad only. No budget or
            campaign activation is performed.
          </p>
        )}
        {!live && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Live {item.channel === "facebook" ? "social" : "advertising"}{" "}
            delivery is disabled in this environment. Test schedules cannot
            send, including after live delivery is later enabled; they must be
            explicitly re-queued.
          </p>
        )}
        {item.error && (
          <p role="alert" className="break-words rounded-xl border p-3 text-sm">
            {item.error}
          </p>
        )}
        {item.externalId && (
          <p className="break-all text-sm">Meta object ID: {item.externalId}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canEdit && editablePublication(item.state) && (
            <Button variant="outline" disabled={busy} onClick={onEdit}>
              Edit draft
            </Button>
          )}
          {canEdit &&
            ["draft", "changes_requested", "rejected"].includes(item.state) && (
              <Button
                className="h-auto min-h-9 max-w-full whitespace-normal py-2"
                disabled={busy}
                onClick={() => submit.mutate(version)}
              >
                Submit for publishing approval
              </Button>
            )}
          {canPublish && ["draft", "needs_review"].includes(item.state) && (
            <Button
              disabled={busy}
              onClick={() =>
                review.mutate({ ...version, decision: "approved", note })
              }
            >
              Approve publication
            </Button>
          )}
        </div>
        {canPublish &&
          (item.state === "approved" ||
            (item.state === "scheduled" &&
              item.result?.deliveryMode === "test" &&
              live)) && (
            <Button
              disabled={busy || connections.isLoading}
              onClick={() => {
                if (
                  window.confirm(
                    live
                      ? item.channel === "facebook"
                        ? "Queue this approved Facebook post for live delivery?"
                        : "Queue this approved ad to be created PAUSED in Meta?"
                      : "Save this as a test schedule? No content will be sent."
                  )
                )
                  queue.mutate({ ...version, confirm: true });
              }}
            >
              {live
                ? item.scheduledAtMs
                  ? "Schedule delivery"
                  : "Queue now"
                : "Save test schedule"}
            </Button>
          )}
        {canPublish && reviewable && (
          <>
            <Label htmlFor="publication-feedback">Review feedback</Label>
            <textarea
              id="publication-feedback"
              className={channelInput}
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || !note.trim()}
                onClick={() =>
                  review.mutate({
                    ...version,
                    decision: "changes_requested",
                    note,
                  })
                }
              >
                Request changes
              </Button>
              <Button
                variant="outline"
                disabled={busy || !note.trim()}
                onClick={() =>
                  review.mutate({ ...version, decision: "rejected", note })
                }
              >
                Reject
              </Button>
            </div>
          </>
        )}
        {canPublish &&
          editablePublication(item.state) &&
          item.state !== "cancelled" && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Cancel this publication in Frame? This does not delete anything in Meta."
                  )
                )
                  cancel.mutate({ ...version, confirm: true });
              }}
            >
              Cancel publication
            </Button>
          )}
        {canPublish &&
          item.state === "failed" &&
          item.result?.retrySafe === true && (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Retry this definitively failed delivery?"))
                  retry.mutate({ ...version, confirm: true });
              }}
            >
              Retry failed delivery
            </Button>
          )}
        {canPublish &&
          item.state === "failed" &&
          item.result?.retrySafe === true && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => resetFailed.mutate({ ...version, confirm: true })}
            >
              Return failed item to draft
            </Button>
          )}
        {canPublish && item.state === "delivery_unknown" && (
          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-sm">
              Automatic retries are blocked to avoid duplicates. Check Meta
              first. When the object exists, enter its ID to verify the result.
            </p>
            <Label htmlFor="publication-remote-id">
              Existing Meta object ID
            </Label>
            <input
              id="publication-remote-id"
              className={channelInput}
              value={externalId}
              onChange={e => setExternalId(e.target.value)}
            />
            <Button
              disabled={busy || !externalId}
              onClick={() =>
                reconcile.mutate({ ...version, externalId, confirm: true })
              }
            >
              Verify existing delivery
            </Button>
          </div>
        )}
        {!canPublish && (
          <p className="text-xs text-muted-foreground">
            An owner, administrator or publisher must approve and queue the
            final publication. Asset reviewers do not automatically have
            publishing permission.
          </p>
        )}
        <div className="border-t pt-4">
          <h3 className="font-semibold">Publication history</h3>
          {history.error ? (
            <p>History could not be loaded.</p>
          ) : (
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {history.data?.map(h => (
                <p key={h.id} className="text-xs">
                  {statusLabel(h.action.replace("publication.", ""))} -{" "}
                  {h.author ?? "Workspace member"} -{" "}
                  {new Date(h.at).toLocaleString()}
                </p>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
