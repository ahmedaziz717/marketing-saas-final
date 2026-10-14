import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  Megaphone,
  MessageCircle,
  Send,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { StudioCard } from "@/components/configurator/StudioCard";
import {
  PublicationComposer,
  PublicationDetails,
  PublicationStatus,
  type Publication,
} from "@/components/PublicationComposer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { type Channel, editablePublication } from "@shared/channels";
import { libraryAssetLink } from "@shared/assetWorkflow";
import "@/styles/configurator.css";
import "@/styles/activationStudio.css";

function ActivationStudio() {
  const { organizationId, membership } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const [channel, setChannel] = useState<Channel | null>(null);
  const [assetKey, setAssetKey] = useState(params.get("asset") ?? "");
  const [publicationId, setPublicationId] = useState(
    params.get("publication") ?? ""
  );
  const [view, setView] = useState<"edit" | "saved" | "review">(
    publicationId ? "saved" : "edit"
  );
  const [changeChannel, setChangeChannel] = useState(false);
  const [showChannels, setShowChannels] = useState(!publicationId);
  const [visitedChannels, setVisitedChannels] = useState<Channel[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<
    Partial<Record<Channel, Publication>>
  >({});
  const scope = { organizationId: organizationId! };
  const connections = trpc.channels.connections.useQuery(scope, {
    enabled: !!organizationId,
  });
  const assets = trpc.assetLibrary.list.useQuery(scope, {
    enabled: !!organizationId,
  });
  const publication = trpc.publishing.get.useQuery(
    { ...scope, id: publicationId },
    { enabled: !!organizationId && !!publicationId }
  );
  useEffect(() => {
    if (publicationId && publication.data?.id === publicationId) {
      const item = publication.data;
      setSavedDrafts(previous => ({ ...previous, [item.channel]: item }));
    }
  }, [publicationId, publication.data]);
  const canCompose = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  const connected = (connections.data?.items ?? []).filter(
    c => c.status === "connected" && !c.expired
  );
  const supported = (["meta_ads", "facebook"] as const).filter(value =>
    connected.some(c => c.channel === value)
  );
  const sourceAsset = assets.data?.find(a => a.key === assetKey);
  const initialAsset = assets.data?.find(
    a =>
      a.key === assetKey && a.state === "approved" && a.purpose === "finished"
  );
  const missingAsset =
    !!assetKey && !assets.isLoading && !assets.error && !initialAsset;
  const currentChannel = channel ?? publication.data?.channel;
  // Keep each channel's in-progress composer mounted while browsing destinations.
  // Account/campaign selections never leak from paid ads into organic posts.
  const draftChannels = Array.from(
    new Set([
      ...visitedChannels,
      ...(Object.keys(savedDrafts) as Channel[]),
      ...(publication.data ? [publication.data.channel] : []),
    ])
  );
  function chooseChannel(value: Channel) {
    setChannel(value);
    setVisitedChannels(previous =>
      previous.includes(value) ? previous : [...previous, value]
    );
    setShowChannels(false);
    setView("edit");
  }
  function reset() {
    setChangeChannel(false);
    setPublicationId("");
    setChannel(null);
    setVisitedChannels([]);
    setSavedDrafts({});
    setShowChannels(true);
    setView("edit");
  }
  return (
    <div className="cfg-root activation-root">
      <header className="cfg-heading">
        <div>
          <Link href="/app/activate/apps" className="cfg-back">
            <ArrowLeft size={14} />
            All activation apps
          </Link>
          <div className="cfg-title">
            <h1>
              Activation Studio<span>Made to reach people</span>
            </h1>
            <span className="cfg-pilot">Preview app</span>
          </div>
          <p>
            Turn your creative into a post or ad. Choose where, refine the
            message, and decide when.
          </p>
        </div>
        <div className="cfg-actions">
          <Link className="cfg-secondary" href="/app/creatives/studio">
            Creative Studio
          </Link>
          <Link className="cfg-secondary" href="/app/publishing">
            <CalendarDays size={16} />
            Calendar & drafts
          </Link>
        </div>
      </header>
      {!canCompose ? (
        <p role="alert">
          A creator or publisher role is required to prepare an activation.
        </p>
      ) : (
        <>
          {assetKey && (showChannels || missingAsset) && (
            <div className="activation-source-banner">
              {initialAsset?.mediaType === "image" && (
                <img src={initialAsset.url} alt={initialAsset.name} />
              )}
              {initialAsset?.mediaType === "video" && (
                <video src={initialAsset.url} controls preload="metadata" />
              )}
              <div>
                <strong>{initialAsset?.name || "Your creative"}</strong>
                <p>
                  {assets.isLoading
                    ? "Loading your creative…"
                    : missingAsset
                      ? "This asset is not approved or available. Approve it in the Asset Library, or continue with another asset."
                      : "Carried over from Creative Studio. Choose a destination to continue."}
                </p>
                {missingAsset && (
                  <>
                    <Link
                      href={
                        sourceAsset
                          ? libraryAssetLink(assetKey, sourceAsset.state)
                          : `/app/library?view=drafts&asset=${encodeURIComponent(assetKey)}`
                      }
                    >
                      Open asset in Library
                    </Link>
                  </>
                )}
                <button type="button" onClick={() => setAssetKey("")}>
                  Choose another asset
                </button>
              </div>
            </div>
          )}
          {assets.error && (
            <p role="alert">
              Your assets could not be loaded.{" "}
              <button onClick={() => void assets.refetch()}>Try again</button>
            </p>
          )}
          {publicationId && publication.isLoading && (
            <p role="status">Loading your saved activation…</p>
          )}
          {publicationId &&
            !publication.isLoading &&
            !publication.error &&
            !publication.data && (
              <p role="alert">
                This activation is no longer available.{" "}
                <Link href="/app/publishing">Open your calendar</Link>
              </p>
            )}
          {publication.error && (
            <p role="alert">
              This activation could not be loaded.{" "}
              <button onClick={() => void publication.refetch()}>
                Try again
              </button>
            </p>
          )}
          {publicationId && publication.data && view !== "edit" ? (
            <section className="cfg-body activation-saved">
              <div className="activation-choice-symbol">
                <Send size={40} />
              </div>
              <h2>{publication.data.content.title}</h2>
              <PublicationStatus item={publication.data} />
              <p>
                Your activation is saved in the calendar. Review it before
                approving or confirming delivery.
              </p>
              <div className="cfg-actions">
                {editablePublication(publication.data.state) && (
                  <button onClick={() => setView("edit")}>
                    Continue editing
                  </button>
                )}
                <button
                  className="cfg-primary"
                  onClick={() => setView("review")}
                >
                  Review approval & delivery
                </button>
                <button onClick={() => setChangeChannel(true)}>
                  Start another activation
                </button>
              </div>
            </section>
          ) : showChannels ? (
            <section className="cfg-body activation-channel-section">
              <div className="activation-section-title">
                <span className="cfg-eyebrow">01 / Destination</span>
                <h2>Where would you like to show up?</h2>
                <p>
                  Choose a connected channel. Your account, formats and delivery
                  options will follow.
                </p>
              </div>
              {connections.isLoading && (
                <p role="status">Loading connected channels…</p>
              )}
              {connections.error && (
                <p role="alert">
                  Connections could not be loaded.{" "}
                  <button onClick={() => void connections.refetch()}>
                    Try again
                  </button>
                </p>
              )}
              <div className="cfg-card-grid activation-channel-grid">
                {supported.map(value => {
                  const accounts = connected.filter(c => c.channel === value);
                  const available = accounts.some(c =>
                    c.details.capabilities.includes("publish")
                  );
                  const Icon = value === "meta_ads" ? Megaphone : MessageCircle;
                  return (
                    <StudioCard
                      key={value}
                      title={value === "meta_ads" ? "Meta Ads" : "Facebook"}
                      description={
                        value === "meta_ads"
                          ? "Prepare paid ads for Facebook and Instagram placements."
                          : "Publish organic posts to your connected Facebook Pages."
                      }
                      badge={`${accounts.length} connected ${accounts.length === 1 ? "account" : "accounts"}`}
                      disabled={
                        !available ||
                        missingAsset ||
                        assets.isLoading ||
                        (value === "meta_ads" &&
                          initialAsset?.mediaType === "video")
                      }
                      media={
                        <div className={`activation-channel-art ${value}`}>
                          <Icon size={62} />
                          <span>
                            {value === "meta_ads"
                              ? "Paid advertising"
                              : "Organic social"}
                          </span>
                        </div>
                      }
                      selected={currentChannel === value}
                      onSelect={() => chooseChannel(value)}
                    >
                      {value === "meta_ads" &&
                        initialAsset?.mediaType === "video" && (
                          <p className="p-3 text-sm">
                            This ad flow supports images. Choose Facebook for
                            this video, or select an image first.
                          </p>
                        )}
                      {!available && (
                        <p className="p-3 text-sm">
                          Publishing permission is required. Reconnect this
                          channel in Integrations.
                        </p>
                      )}
                    </StudioCard>
                  );
                })}
              </div>
              {!connections.isLoading &&
                !connections.error &&
                !supported.length && (
                  <div className="activation-empty">
                    <h3>Connect your first channel</h3>
                    <p>
                      Available social and advertising connections appear here
                      automatically.
                    </p>
                  </div>
                )}
              <Link
                className="activation-connect"
                href="/app/settings/integrations"
              >
                Manage channel connections →
              </Link>
            </section>
          ) : null}
          {draftChannels.map(draftChannel => {
            const item =
              publicationId && publication.data?.channel === draftChannel
                ? publication.data
                : savedDrafts[draftChannel];
            return (
              <div
                key={draftChannel}
                hidden={
                  showChannels ||
                  view !== "edit" ||
                  currentChannel !== draftChannel ||
                  missingAsset
                }
              >
                <PublicationComposer
                  key={`${organizationId}:${draftChannel}:${item ? `${item.id}:${item.revision}` : "new"}`}
                  studio
                  initialChannel={draftChannel}
                  initialAssetKey={assetKey || undefined}
                  item={item}
                  onChangeChannel={() => setShowChannels(true)}
                  onClose={() => setChangeChannel(true)}
                  onSaved={(id, next) => {
                    setPublicationId(id);
                    setView(next ? "review" : "saved");
                  }}
                />
              </div>
            );
          })}
          {publication.data && view === "review" && (
            <PublicationDetails
              item={publication.data}
              onClose={() => setView("saved")}
              onEdit={() => setView("edit")}
            />
          )}
        </>
      )}
      {changeChannel && (
        <Dialog open onOpenChange={setChangeChannel}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a new activation?</DialogTitle>
              <DialogDescription>
                Unsaved changes will be discarded. Previously saved drafts stay
                in your calendar.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                className="rounded-xl border px-4 py-2"
                onClick={() => setChangeChannel(false)}
              >
                Keep editing
              </button>
              <button
                className="rounded-xl bg-primary px-4 py-2 text-primary-foreground"
                onClick={reset}
              >
                Start new activation
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
export default function ActivationStudioPage() {
  const { organizationId } = useWorkspace();
  return (
    <WorkspaceGate>
      <ActivationStudio key={organizationId} />
    </WorkspaceGate>
  );
}
