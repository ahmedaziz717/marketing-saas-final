import { StudioJourney, StudioSummary, useStudioJourney } from "@/components/configurator/StudioJourney";
import type { ReactNode } from "react";
import { PartnerLogo } from "@/components/PartnerLogo";
import {
  useStudioNavigation,
  scrollStudioChoices,
} from "@/components/configurator/studioNavigation";
import {
  ActivationSections,
  activationSections,
  type ActivationEntry,
  type ActivationSection,
} from "@/components/activation/ActivationNavigation";
import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  Megaphone,
  MessageCircle,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { StudioCard } from "@/components/configurator/StudioCard";
import {
  PublicationComposer,
  PublicationDetails,
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
  const studioRoot = useStudioNavigation();
  const { organizationId, membership } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const initialChannel = ["facebook", "meta_ads"].includes(
    params.get("channel") ?? ""
  )
    ? (params.get("channel") as Channel)
    : null;
  const [channel, setChannel] = useState<Channel | null>(initialChannel);
  const [assetKey, setAssetKey] = useState(params.get("asset") ?? "");
  const [publicationId, setPublicationId] = useState(
    params.get("publication") ?? ""
  );
  const [view, setView] = useState<"edit" | "review">("edit");
  const reviewSavedOnLoad = useRef(!!publicationId && !params.get("section"));
  const [changeChannel, setChangeChannel] = useState(false);
  const [editVisit, setEditVisit] = useState(0);
  const [showChannels, setShowChannels] = useState(
    !publicationId && !initialChannel
  );
  const [studioEntry, setStudioEntry] = useState<ActivationEntry>({
    section: (["setup", "creative", "copy", "delivery", "preview"].includes(
      params.get("section") ?? ""
    )
      ? params.get("section")
      : publicationId
        ? "copy"
        : "setup") as ActivationSection,
    category:
      params.get("category") ??
      (params.get("section") && params.get("section") !== "copy"
        ? undefined
        : publicationId
          ? "compose"
          : "account"),
    visit: 0,
  });
  const [visitedChannels, setVisitedChannels] = useState<Channel[]>(
    initialChannel && !publicationId ? [initialChannel] : []
  );
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
    {
      enabled: !!organizationId && !!publicationId,
      refetchInterval: view === "review" ? 3000 : false,
    }
  );
  useEffect(() => {
    if (publicationId && publication.data?.id === publicationId) {
      const item = publication.data;
      setSavedDrafts(previous => ({ ...previous, [item.channel]: item }));
      if (
        !editablePublication(item.state) ||
        (reviewSavedOnLoad.current &&
          ["approved", "scheduled"].includes(item.state))
      )
        setView("review");
      reviewSavedOnLoad.current = false;
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
  const currentRecord =
    (currentChannel ? savedDrafts[currentChannel] : undefined) ??
    publication.data;
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
    setStudioEntry(previous => ({
      section: "setup",
      category: "account",
      visit: previous.visit + 1,
    }));
    setView("edit");
    scrollStudioChoices(studioRoot.current);
  }
  function reset() {
    setChangeChannel(false);
    setPublicationId("");
    setChannel(null);
    setVisitedChannels([]);
    setSavedDrafts({});
    setShowChannels(true);
    setStudioEntry(previous => ({
      section: "setup",
      category: "account",
      visit: previous.visit + 1,
    }));
    setView("edit");
  }
  const channelChoices = (<>
                  <div className="activation-section-title">
                    <span className="cfg-eyebrow">01 / Destination</span>
                    <h2>Where would you like to show up?</h2>
                    <p>
                      Choose a connected channel. Your account, formats and
                      delivery options will follow.
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
                      const accounts = connected.filter(
                        c => c.channel === value
                      );
                      const available = accounts.some(c =>
                        c.details.capabilities.includes("publish")
                      );
                      const Icon =
                        value === "meta_ads" ? Megaphone : MessageCircle;
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
                              <PartnerLogo
                                slug={
                                  value === "meta_ads" ? "meta" : "facebook"
                                }
                                name={
                                  value === "meta_ads" ? "Meta" : "Facebook"
                                }
                                size={88}
                              />
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
                                This ad flow supports images. Choose Facebook
                                for this video, or select an image first.
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
                          Available social and advertising connections appear
                          here automatically.
                        </p>
                      </div>
                    )}
                  <Link
                    className="activation-connect"
                    href="/app/settings/integrations"
                  >
                    Manage channel connections →
                  </Link>
  </>);
  return (
    <div className="cfg-root activation-root" ref={studioRoot}>
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
          {publicationId && currentRecord && view !== "edit" ? (
            <>
              <ActivationSections
                current="preview"
                readOnly={!editablePublication(currentRecord.state)}
                onSelect={section => {
                  if (
                    section !== "preview" &&
                    editablePublication(currentRecord.state)
                  ) {
                    setStudioEntry(previous => ({
                      section,
                      category: section === "copy" ? "compose" : undefined,
                      visit: previous.visit + 1,
                    }));
                    setEditVisit(value => value + 1);
                    setView("edit");
                  }
                }}
              >
                <section className="activation-result">
                  <PublicationDetails
                    inline
                    item={currentRecord}
                    onClose={() => {}}
                    onEdit={() => {
                      setStudioEntry(previous => ({
                        section: "delivery",
                        visit: previous.visit + 1,
                      }));
                      setEditVisit(value => value + 1);
                      setView("edit");
                    }}
                  />
                  <div className="cfg-actions">
                    <Link className="cfg-secondary" href="/app/publishing">
                      View calendar
                    </Link>
                    <button
                      className="cfg-secondary"
                      onClick={() => setChangeChannel(true)}
                    >
                      Start another activation
                    </button>
                  </div>
                </section>
              </ActivationSections>
            </>
          ) : showChannels ? (
            <ActivationChannelStart organizationId={organizationId!} choices={channelChoices} />
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
                  key={`${organizationId}:${draftChannel}:${editVisit}`}
                  studio
                  channelChoices={channelChoices}
                  studioEntry={studioEntry}
                  studioActive={
                    !showChannels &&
                    view === "edit" &&
                    currentChannel === draftChannel
                  }
                  initialChannel={draftChannel}
                  initialPlanId={Number(params.get("plan")) || undefined}
                  initialConnectionId={params.get("connection") ?? undefined}
                  initialAdSetId={params.get("adset") ?? undefined}
                  initialTime={params.get("time") ?? undefined}
                  initialTimezone={params.get("timezone") ?? undefined}
                  initialAssetKey={assetKey || undefined}
                  item={item}
                  onChangeChannel={() => {
                    setShowChannels(true);
                    scrollStudioChoices(studioRoot.current);
                  }}
                  onClose={() => setChangeChannel(true)}
                  onSaved={(id, next, savedChannel, record) => {
                    setPublicationId(id);
                    if (record)
                      setSavedDrafts(previous => ({
                        ...previous,
                        [savedChannel ?? draftChannel]: record,
                      }));
                    if (next) setView("review");
                  }}
                />
              </div>
            );
          })}
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
  const search = useSearch();
  const { organizationId } = useWorkspace();
  return (
    <WorkspaceGate>
      <ActivationStudio key={`${organizationId}:${search}`} />
    </WorkspaceGate>
  );
}

function ActivationChannelStart({ organizationId, choices }: { organizationId: number; choices: ReactNode }) {
  const journey = useStudioJourney({
    scopeKey: `activation:${organizationId}:destination`,
    section: "setup", category: "channel",
    sections: activationSections.map(section => ({ ...section, categories: section.id === "setup"
      ? [{ id: "channel", title: "Channel", value: "Choose a connected channel", needsInput: true }, { id: "account", title: "Account", value: "Choose a channel first", disabled: true, reason: "Choose a channel first" }]
      : [{ id: section.id, title: section.title, value: "Choose a channel first", disabled: true, reason: "Choose a channel first" }] })),
    onNavigate: () => {},
  });
  return <div className="activation-composer"><div className="cfg-workspace">
    <StudioSummary subtitle="Your activation · Choose a destination"><div className="cfg-stage activation-preview"><div className="cfg-build activation-summary"><span className="cfg-eyebrow">Preview & summary</span><h3>Your next activation</h3><p>Choose a channel to see your creative, copy, account and delivery choices together.</p></div></div></StudioSummary>
    <StudioJourney journey={journey} label="Activation sections"><section className="cfg-body activation-fields activation-channel-section">{choices}</section></StudioJourney>
  </div></div>;
}
