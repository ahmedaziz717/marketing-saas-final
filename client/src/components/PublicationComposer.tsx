import { metaWebsiteCallToActions } from "@shared/metaCallToAction";
import { scrollStudioChoices } from "./configurator/studioNavigation";
import { ActivationComposerStudio } from "./activation/ActivationComposerStudio";
import type {
  ActivationEntry,
  ActivationSection,
} from "./activation/ActivationNavigation";
import { StudioSections } from "./configurator/StudioSections";
import { StudioCard } from "./configurator/StudioCard";
import {
  CalendarDays,
  Clock3,
  Image,
  Layers,
  RectangleVertical,
  Building2,
  Radio,
  ClipboardCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { SavedCopyTags } from "./CopyTags";
import { AdCampaignPicker } from "./AdCampaignPicker";
import { CampaignPlanSelect } from "./CampaignPlanSelect";
import { ContentPreview } from "./ContentPreview";
import { SocialPostFields } from "./SocialPostFields";
import { normalizeDestinationUrl } from "@shared/briefValidation";
import {
  normalizeSocialPost,
  replaceSocialCaption,
  socialPostTitle,
  SOCIAL_CAPTION_LIMIT,
} from "@shared/socialPost";
import { StudioMediaDialog } from "./StudioMediaDialog";
import { studioContentHref } from "@shared/contentWorkflow";
import { AdCopyAssistant } from "./AdCopyAssistant";
import { AdTextOptionsEditor } from "./AdTextOptionsEditor";
import { PlacementAssetPicker } from "./PlacementAssetPicker";
import { placementSlots } from "@shared/metaPlacements";
import { ApprovedAssetPicker } from "./ApprovedAssetPicker";
import { useEffect, useRef, useState, useId, type SetStateAction } from "react";
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
  linkSchema,
  dateInZone,
  localScheduleToUtc,
  validTimezone,
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
  item: Pick<Publication, "state" | "channel" | "result"> &
    Partial<Pick<Publication, "scheduledAtMs">>;
}) {
  const label =
    item.state === "scheduled" && item.result?.deliveryMode === "test"
      ? "Test schedule - not live"
      : item.channel === "facebook" && item.state === "approved"
        ? "Approved · Not scheduled"
        : item.channel === "facebook" &&
            item.state === "scheduled" &&
            !item.scheduledAtMs
          ? "Queued to publish"
          : item.state === "published" && item.channel === "meta_ads"
            ? "Created in Meta - paused"
            : statusLabel(item.state);
  return (
    <span
      className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs ${item.state === "scheduled" && item.result?.deliveryMode !== "test" ? "border-blue-200 bg-blue-50 text-blue-900" : item.state === "approved" || item.result?.deliveryMode === "test" ? "border-amber-200 bg-amber-50 text-amber-950" : "bg-muted"}`}
    >
      {label}
    </span>
  );
}
function ComposerSurface({
  studio,
  stage,
  onClose,
  children,
}: {
  studio: boolean;
  stage: "create" | "activate";
  onClose: () => void;
  children: ReactNode;
}) {
  if (studio) return <div className="activation-composer">{children}</div>;
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-workflow={stage === "create" ? "Create" : "Activate"}
        className="publication-composer flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-4xl [&>*]:min-w-0"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function PublicationComposer({
  studio = false,
  onChangeChannel,
  studioEntry,
  studioActive = true,
  item,
  stage = "create",
  initialPlanId,
  initialChannel = "facebook",
  initialAssetKey,
  initialConnectionId,
  initialAdSetId,
  initialTime,
  initialTimezone,
  onClose,
  onSaved,
}: {
  studio?: boolean;
  onChangeChannel?: () => void;
  studioEntry?: ActivationEntry;
  studioActive?: boolean;
  item?: Publication;
  stage?: "create" | "activate";
  initialPlanId?: number;
  initialChannel?: Channel;
  initialAssetKey?: string;
  initialConnectionId?: string;
  initialAdSetId?: string;
  initialTime?: string;
  initialTimezone?: string;
  onClose: () => void;
  onSaved: (
    id: string,
    next?: "activate",
    channel?: Channel,
    record?: Publication
  ) => void;
}) {
  const { organizationId, membership } = useWorkspace();
  const fieldPrefix = useId();
  const fieldId = (name: string) => (studio ? `${fieldPrefix}-${name}` : name);
  const [mediaOpen, setMediaOpen] = useState(false);
  const nextAction = useRef<"activate" | undefined>(undefined);
  const composing = stage === "create" || !item;
  const canMakeMedia = ["owner", "admin", "creator"].includes(
    membership?.role ?? ""
  );
  const utils = trpc.useUtils();
  const [id] = useState(() => item?.id ?? crypto.randomUUID());
  const revision = useRef(item?.revision ?? 0);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [activationError, setActivationError] = useState("");
  const [activationPending, setActivationPending] = useState(false);
  const activationLock = useRef(false);
  const canPublish = ["owner", "admin", "publisher"].includes(
    membership?.role ?? ""
  );
  const approveStudio = trpc.publishing.review.useMutation();
  const submitStudio = trpc.publishing.submit.useMutation();

  const channel = item?.channel ?? initialChannel;
  const adWizard = channel === "meta_ads" && composing;
  const wizard = adWizard || studio;
  const CopyToolsContainer = channel === "facebook" ? "details" : "div";
  const [step, setStep] = useState<ActivationSection>("setup");
  const [validationEntry, setValidationEntry] = useState<ActivationEntry>();
  useEffect(() => {
    if (studioEntry && studioActive) {
      setStep(studioEntry.section);
      setValidationEntry(undefined);
    }
  }, [studioEntry, studioActive]);
  const [platform, setPlatform] = useState("meta_ads");
  const scrollBody = useRef<HTMLDivElement>(null);
  function goToStep(next: ActivationSection, category?: string) {
    setStep(next);
    setValidationEntry(previous =>
      category
        ? { section: next, category, visit: (previous?.visit ?? 0) + 1 }
        : undefined
    );
    if (studio) {
      scrollStudioChoices(scrollBody.current);
    } else if (scrollBody.current) scrollBody.current.scrollTop = 0;
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [placement, setPlacement] = useState(
    !!item?.content.placementAssetKeys
  );
  const [carousel, setCarousel] = useState(
    !!item?.content.carouselAssetKeys?.length
  );
  const [connectionId, setConnection] = useState(
    item?.connectionId ?? initialConnectionId ?? ""
  );
  const [assetKey, setAssetKey] = useState(
    item?.assetKey ?? initialAssetKey ?? ""
  );
  const [content, setContentValue] = useState<PublicationContent>(() =>
    normalizeSocialPost(
      channel,
      assetKey,
      item?.content ??
        contentSchema.parse({
          title: channel === "facebook" ? "Untitled post" : "Untitled ad",
          campaignPlanId: initialPlanId,
          adSetId: initialAdSetId ?? "",
        })
    )
  );
  const [showErrors, setShowErrors] = useState(false);
  function setContent(update: SetStateAction<PublicationContent>) {
    setContentValue(previous =>
      normalizeSocialPost(
        channel,
        assetKey,
        typeof update === "function" ? update(previous) : update
      )
    );
  }
  function setAsset(key: string) {
    setAssetKey(key);
    setContentValue(previous => normalizeSocialPost(channel, key, previous));
  }
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
  const businessBrand = trpc.brand.get.useQuery(scope, {
    enabled: !!organizationId,
  });
  const connections = trpc.channels.connections.useQuery(scope, {
    enabled: !!organizationId,
  });
  const connectedAccounts = (connections.data?.items ?? []).filter(
    c => c.channel === channel && c.status === "connected" && !c.expired
  );
  const selectedAccountUnavailable =
    !!connectionId &&
    !!connections.data &&
    !connectedAccounts.some(c => c.id === connectionId);
  const assets = trpc.assetLibrary.list.useQuery(scope, {
    enabled: !!organizationId,
  });
  const draftSnapshot = JSON.stringify({
    content,
    assetKey,
    connectionId,
    local,
    timezone,
  });
  const savedInput = useRef("");
  const liveDelivery =
    channel === "facebook"
      ? connections.data?.liveSocial
      : connections.data?.liveAds;
  const activationLabel = !canPublish
    ? "Submit for approval"
    : liveDelivery === undefined
      ? "Checking delivery…"
      : !liveDelivery
        ? "Save test schedule"
        : channel === "facebook"
          ? local
            ? "Schedule post"
            : "Publish now"
          : local
            ? "Schedule ad creation"
            : "Create paused ad";
  const save = trpc.publishing.save.useMutation({
    onSuccess: async result => {
      revision.current = result.revision;
      setSavedSnapshot(savedInput.current);
      let record = result;
      let completed = false;
      if (studio && nextAction.current) {
        try {
          const version = {
            ...scope,
            id: result.id,
            revision: result.revision,
          };
          if (canPublish) {
            const response = await approveStudio.mutateAsync({
              ...version,
              decision: "approved",
              note: "",
              delivery: { confirm: true, mode: liveDelivery ? "live" : "test" },
            });
            record = {
              ...result,
              revision: result.revision + 1,
              state: "scheduled",
              result: {
                ...result.result,
                deliveryMode: response.liveEnabled ? "live" : "test",
              },
            };
          } else {
            await submitStudio.mutateAsync(version);
            record = {
              ...result,
              revision: result.revision + 1,
              state: "needs_review",
            };
          }
          revision.current = record.revision;
          completed = true;
        } catch (error) {
          setActivationError(
            error instanceof Error
              ? error.message
              : "Delivery could not be confirmed. Your draft is saved."
          );
        }
      }
      await Promise.all([
        utils.publishing.list.invalidate(),
        utils.publishing.get.invalidate(),
      ]);
      setActivationPending(false);
      activationLock.current = false;
      if (!nextAction.current)
        toast.success("Draft saved. Nothing has been scheduled or published.");
      onSaved(
        result.id,
        studio ? (completed ? "activate" : undefined) : nextAction.current,
        result.channel,
        record
      );
    },
    onError: e => {
      setActivationPending(false);
      activationLock.current = false;
      setActivationError(e.message);
      toast.error(e.message);
    },
  });
  const initialPlan = trpc.briefs.get.useQuery(
    { ...scope, briefId: initialPlanId ?? 1 },
    { enabled: !!organizationId && !!initialPlanId && !item }
  );
  const planApplied = useRef(false);
  useEffect(() => {
    if (!initialPlan.data || planApplied.current) return;
    planApplied.current = true;
    const p = initialPlan.data;
    setContent(c => ({
      ...c,
      promotion: {
        audience: c.promotion?.audience || p.audience.slice(0, 2000),
        goal: c.promotion?.goal || p.creativeDirection.slice(0, 2000),
        offer: c.promotion?.offer || p.offer.slice(0, 2000),
      },
      link: c.link || p.destinationUrl || "",
    }));
  }, [initialPlan.data]);
  const selectedAsset = assets.data?.find(a => a.key === assetKey);
  const multipleTextOptions = channel === "meta_ads" && !placement && !carousel;
  const copyAssetKeys = placement
    ? Object.values(content.placementAssetKeys ?? {}).filter(
        (v): v is string => !!v
      )
    : carousel
      ? (content.carouselAssetKeys ?? [])
      : assetKey
        ? [assetKey]
        : [];

  const setField = (key: keyof PublicationContent, value: string) =>
    setContent(c => ({ ...c, [key]: value }));
  const socialErrors: Record<string, string> = {};
  if (channel === "facebook") {
    if (content.message.length > SOCIAL_CAPTION_LIMIT)
      socialErrors.message =
        "Shorten the caption to 5,000 characters or fewer.";
    if (
      content.link &&
      !assetKey &&
      (normalizeDestinationUrl(content.link) === null ||
        !linkSchema.safeParse(normalizeDestinationUrl(content.link)).success)
    )
      socialErrors.link =
        "Enter a valid website address, such as example.com, or clear this optional field.";
    if (!connectionId || selectedAccountUnavailable)
      socialErrors.destination =
        "Choose a connected Facebook Page before continuing.";
    else if (
      !connectedAccounts
        .find(c => c.id === connectionId)
        ?.details.capabilities.includes("publish")
    )
      socialErrors.destination =
        "This account has read-only access. Choose an account with publishing permission.";
    if (!content.message.trim() && !content.link.trim() && !assetKey)
      socialErrors.message =
        "Write a caption, add a website preview, or select a photo or video.";
    if (
      assetKey &&
      (!selectedAsset ||
        selectedAsset.state !== "approved" ||
        selectedAsset.purpose !== "finished" ||
        !["image", "video"].includes(selectedAsset.mediaType))
    )
      socialErrors.asset = assets.isLoading
        ? "Wait for your selected media to finish loading."
        : "Choose an approved photo or video, or remove the current selection.";
  }
  function focusIssue(field: string) {
    const name = field === "asset" ? "pub-asset" : `pub-${field}`;
    const element = scrollBody.current?.querySelector<HTMLElement>(
      `[id="${fieldId(name)}"], [id="${name}"]`
    );
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.focus({ preventScroll: true });
  }
  function submit(next?: "activate") {
    if ((studio && activationLock.current) || save.isPending) return;
    if (studio && next && canPublish && liveDelivery === undefined) return;
    nextAction.current = next;
    setActivationError("");
    try {
      if (studio && next && channel === "meta_ads") {
        const account = connectedAccounts.find(c => c.id === connectionId);
        if (!account?.details.capabilities.includes("publish")) {
          goToStep("setup", "account");
          throw new Error("Choose an ad account with publishing permission.");
        }
        if (!content.adSetId) {
          goToStep("setup", "campaign");
          throw new Error(
            "Choose a campaign and ad set before reviewing delivery."
          );
        }
        if (
          !copyAssetKeys.length ||
          copyAssetKeys.some(
            key =>
              !assets.data?.some(
                a =>
                  a.key === key &&
                  a.state === "approved" &&
                  a.purpose === "finished" &&
                  a.mediaType === "image"
              )
          )
        ) {
          goToStep("creative", "assets");
          throw new Error("Choose approved image assets for this ad.");
        }
        if (!content.message.trim() || !normalizeDestinationUrl(content.link)) {
          goToStep("copy", !content.message.trim() ? "message" : "link");
          throw new Error(
            "Add primary text and a valid destination URL before reviewing delivery."
          );
        }
      }
      if (channel === "facebook") {
        const issues = Object.entries(socialErrors).filter(
          ([field]) =>
            next ||
            field === "link" ||
            field === "asset" ||
            (field === "message" &&
              content.message.length > SOCIAL_CAPTION_LIMIT)
        );
        if (issues.length) {
          setShowErrors(true);
          if (studio)
            goToStep(
              issues[0][0] === "destination"
                ? "setup"
                : issues[0][0] === "asset"
                  ? "creative"
                  : "copy",
              issues[0][0] === "destination"
                ? "account"
                : issues[0][0] === "asset"
                  ? "assets"
                  : "message"
            );
          focusIssue(issues[0][0]);
          return;
        }
      }
      const at = studio
        ? local
          ? localScheduleToUtc(local, timezone)
          : null
        : stage === "create"
          ? (item?.scheduledAtMs ??
            (local ? localScheduleToUtc(local, timezone) : null))
          : local
            ? localScheduleToUtc(local, timezone)
            : null;
      if ((stage === "activate" || studio) && at && at <= Date.now())
        throw new Error(
          "Choose a future date, or clear the schedule to use Publish now."
        );
      savedInput.current = draftSnapshot;
      activationLock.current = studio;
      setActivationPending(!!next);
      save.mutate({
        ...scope,
        id,
        revision: revision.current,
        channel,
        connectionId: connectionId || null,
        assetKey: assetKey || null,
        content: {
          ...content,
          ...(channel === "facebook"
            ? {
                title: socialPostTitle(content, selectedAsset?.name),
                link: assetKey
                  ? ""
                  : (normalizeDestinationUrl(content.link) ?? content.link),
              }
            : {}),
          textVariants:
            channel === "meta_ads" &&
            !placement &&
            !carousel &&
            content.textVariants
              ? {
                  messages: content.textVariants.messages.filter(v => v.trim()),
                  headlines: content.textVariants.headlines.filter(v =>
                    v.trim()
                  ),
                  descriptions: content.textVariants.descriptions.filter(v =>
                    v.trim()
                  ),
                }
              : undefined,
          placementAssetKeys:
            channel === "meta_ads" && placement
              ? content.placementAssetKeys
              : undefined,
          carouselAssetKeys:
            channel === "meta_ads" && carousel
              ? content.carouselAssetKeys
              : undefined,
        },
        timezone,
        scheduledAtMs: at,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check the selected time.");
    }
  }
  if (studio && organizationId)
    return (
      <ActivationComposerStudio
        organizationId={organizationId}
        role={membership?.role ?? ""}
        channel={channel}
        section={step}
        onSection={goToStep}
        onChangeChannel={onChangeChannel}
        entry={validationEntry ?? studioEntry}
        active={studioActive}
        accounts={connectedAccounts}
        connectionsLoading={connections.isLoading}
        connectionsError={!!connections.error}
        retryConnections={() => void connections.refetch()}
        connectionId={connectionId}
        setConnection={setConnection}
        assets={assets.data ?? []}
        assetsLoading={assets.isLoading}
        assetsError={!!assets.error}
        retryAssets={() => void assets.refetch()}
        assetKey={assetKey}
        setAsset={setAsset}
        content={content}
        setContent={setContent}
        format={placement ? "placement" : carousel ? "carousel" : "single"}
        setFormat={value => {
          if (
            value ===
            (placement ? "placement" : carousel ? "carousel" : "single")
          )
            return;
          setPlacement(value === "placement");
          setCarousel(value === "carousel");
          setAsset("");
          setContent(previous => ({
            ...previous,
            placementAssetKeys: undefined,
            carouselAssetKeys: undefined,
          }));
        }}
        local={local}
        setLocal={setLocal}
        timezone={timezone}
        setTimezone={setTimezone}
        brandDefaults={businessBrand.data?.businessProfile ?? undefined}
        pending={save.isPending || activationPending}
        saveStatus={
          savedSnapshot
            ? savedSnapshot === draftSnapshot
              ? "Saved"
              : "Unsaved changes"
            : ""
        }
        activationLabel={activationLabel}
        activationUnavailable={canPublish && liveDelivery === undefined}
        activationError={activationError}
        liveDelivery={liveDelivery}
        errors={showErrors ? socialErrors : {}}
        onSave={submit}
        onClose={onClose}
        scrollBody={scrollBody}
      />
    );
  return (
    <ComposerSurface
      studio={studio}
      stage={stage}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      {studio ? (
        <div className="activation-context">
          <span>
            {channelNames[channel]} ·{" "}
            {channel === "meta_ads" ? "Paid advertising" : "Organic social"}
          </span>
          <Link href="/app/publishing">Open calendar</Link>
        </div>
      ) : (
        <>
          <DialogHeader className="border-b px-5 py-5 pr-12 text-left sm:px-6">
            <DialogTitle>
              {stage === "activate"
                ? "Delivery settings"
                : `${item ? "Edit" : "Create"} ${channel === "facebook" ? "social post" : "ad"}`}
            </DialogTitle>
            <DialogDescription>
              {stage === "create"
                ? channel === "meta_ads"
                  ? "Choose where your ad runs, build the creative, then preview it."
                  : "Write your caption, add optional media, then choose when to publish."
                : "Choose the destination and timing for this content, then review and approve delivery."}
            </DialogDescription>
          </DialogHeader>
        </>
      )}
      {wizard && !studio && (
        <nav
          aria-label="Ad creation steps"
          className="grid grid-cols-3 gap-2 border-b bg-muted/30 px-4 py-3"
        >
          {(
            [
              ["setup", "Account & targeting"],
              ["creative", "Creative"],
              ["preview", "Preview"],
            ] as const
          ).map(([value, label], i) => (
            <button
              type="button"
              key={value}
              aria-current={step === value ? "step" : undefined}
              onClick={() => goToStep(value)}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs sm:text-sm ${step === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
            >
              <span className="shrink-0 rounded-full border border-current/30 px-1.5 text-xs">
                {i + 1}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      <div className={studio ? "activation-workspace" : undefined}>
        {studio && (
          <aside className="cfg-stage activation-preview">
            <ContentPreview
              channel={channel}
              content={content}
              asset={selectedAsset}
              assets={assets.data ?? []}
            />
            <div className="cfg-build activation-summary">
              <h3>Your activation</h3>
              <dl>
                <dt>Channel</dt>
                <dd>{channelNames[channel]}</dd>
                <dt>Account</dt>
                <dd>
                  {connectedAccounts.find(c => c.id === connectionId)?.name ||
                    "Choose an account"}
                </dd>
                <dt>Creative</dt>
                <dd>
                  {copyAssetKeys.length
                    ? `${copyAssetKeys.length} approved asset${copyAssetKeys.length === 1 ? "" : "s"} selected`
                    : channel === "facebook"
                      ? "Text or website preview"
                      : "Choose your images"}
                </dd>
                <dt>Timing</dt>
                <dd>
                  {local
                    ? `${local.replace("T", " · ")} · ${timezone}`
                    : "After final confirmation"}
                </dd>
              </dl>
              <p>
                {channel === "meta_ads"
                  ? "Ads are delivered to Meta paused. Launch and budgets remain under your control."
                  : "You will review and confirm before anything is posted."}
              </p>
            </div>
          </aside>
        )}
        <StudioSections
          enabled={studio}
          label="Activation steps"
          current={step}
          items={
            [
              {
                id: "channel",
                title: "Channel",
                subtitle: "Where to publish",
                icon: Radio,
              },
              {
                id: "setup",
                title: channel === "meta_ads" ? "Account & campaign" : "Page",
                subtitle: "Your destination",
                icon: Building2,
              },
              {
                id: "creative",
                title: "Creative & copy",
                subtitle: "Shape your message",
                icon: Image,
              },
              {
                id: "delivery",
                title: "Timing",
                subtitle: "Plan delivery",
                icon: CalendarDays,
              },
              {
                id: "preview",
                title: "Review",
                subtitle: "Ready to approve",
                icon: ClipboardCheck,
              },
            ] as const
          }
          onSelect={value =>
            value === "channel" ? onChangeChannel?.() : goToStep(value)
          }
        >
          <div
            ref={scrollBody}
            className={
              studio
                ? "cfg-body activation-fields"
                : "min-h-0 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6"
            }
          >
            <fieldset
              className="publication-fields grid min-w-0 grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2"
              disabled={save.isPending}
            >
              {studio && (
                <div className="sm:col-span-2 activation-section-title">
                  <h2>
                    {
                      {
                        setup:
                          channel === "meta_ads"
                            ? "Choose your account & campaign"
                            : "Choose your Facebook Page",
                        creative: "Make it ready for your audience",
                        copy: "Write your copy",
                        delivery: "Choose your timing",
                        preview: "Review your activation",
                      }[step]
                    }
                  </h2>
                  <p>
                    {
                      {
                        setup:
                          channel === "meta_ads"
                            ? "Available connections from this workspace. Campaigns show Active by default."
                            : "Choose a connected Page with publishing permission.",
                        creative:
                          "Pair approved media with the right copy and format.",
                        copy: "Write or generate copy from your setup.",
                        delivery:
                          "Pick a time now. Delivery still requires a separate final confirmation.",
                        preview:
                          "Save your draft, then review approval and delivery.",
                      }[step]
                    }
                  </p>
                </div>
              )}
              {(!wizard || step === "setup") && (
                <>
                  {channel === "meta_ads" && !studio && (
                    <div className="space-y-2">
                      <Label htmlFor={fieldId("pub-ad-platform")}>
                        Advertising channel
                      </Label>
                      <select
                        id={fieldId("pub-ad-platform")}
                        className={channelInput + " bg-card"}
                        value={connectedAccounts.length ? platform : ""}
                        onChange={e => setPlatform(e.target.value)}
                      >
                        {!connectedAccounts.length && (
                          <option value="">
                            No advertising channels connected
                          </option>
                        )}
                        {!!connectedAccounts.length && (
                          <option value="meta_ads">Meta Ads</option>
                        )}
                      </select>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Choose from the advertising channels connected to this
                        workspace.
                      </p>
                    </div>
                  )}
                  <div
                    className={
                      channel === "meta_ads" && !studio
                        ? "space-y-2"
                        : "sm:col-span-2 space-y-2"
                    }
                  >
                    <Label htmlFor={fieldId("pub-destination")}>
                      {channel === "facebook" ? "Social account" : "Ad account"}
                    </Label>
                    {channel === "facebook" && (
                      <p className="text-xs text-muted-foreground">
                        Required to publish. You can save a draft before
                        choosing an account.
                      </p>
                    )}
                    {studio ? (
                      <div
                        id={fieldId("pub-destination")}
                        className="cfg-card-grid activation-account-grid"
                        tabIndex={-1}
                      >
                        {connections.isLoading && (
                          <p role="status">Loading connected accounts…</p>
                        )}
                        {connectedAccounts.map(c => (
                          <StudioCard
                            key={c.id}
                            title={c.name}
                            description={
                              c.details.pageName
                                ? `${c.details.pageName} · ${c.details.currency || channelNames[channel]}`
                                : channelNames[channel]
                            }
                            badge={
                              c.details.capabilities.includes("publish")
                                ? "Connected"
                                : "Read only"
                            }
                            selected={connectionId === c.id}
                            disabled={
                              !c.details.capabilities.includes("publish")
                            }
                            media={
                              <div className="activation-choice-symbol">
                                <Building2 size={38} />
                                <span>{c.name.slice(0, 2).toUpperCase()}</span>
                              </div>
                            }
                            onSelect={() => {
                              if (connectionId === c.id) return;
                              setConnection(c.id);
                              setContent(c => ({
                                ...c,
                                adSetId: "",
                                metaCampaignId: "",
                              }));
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <>
                        <select
                          id={fieldId("pub-destination")}
                          className={channelInput}
                          value={connectionId}
                          aria-invalid={
                            showErrors && !!socialErrors.destination
                          }
                          disabled={connections.isLoading}
                          onChange={e => {
                            setConnection(e.target.value);
                            setContent(c => ({
                              ...c,
                              adSetId: "",
                              metaCampaignId: "",
                            }));
                          }}
                        >
                          <option value="">
                            {connections.isLoading
                              ? "Loading connected accounts…"
                              : "Select a connected account"}
                          </option>
                          {selectedAccountUnavailable && (
                            <option value={connectionId} disabled>
                              Previously selected account (unavailable)
                            </option>
                          )}
                          {connectedAccounts.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {channelNames[c.channel]}
                              {c.details.capabilities.includes("publish")
                                ? ""
                                : " (read only)"}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {connections.error ? (
                      <p role="alert" className="mt-2 text-sm">
                        Connected accounts could not be loaded.{" "}
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={() => void connections.refetch()}
                        >
                          Try again
                        </button>
                      </p>
                    ) : !connections.isLoading && !connectedAccounts.length ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {channel === "facebook"
                          ? "No Facebook Pages are connected for social publishing."
                          : "No Meta ad accounts are connected."}{" "}
                        Connect an account in Integrations. You can still save a
                        draft.
                      </p>
                    ) : null}
                    {selectedAccountUnavailable && (
                      <p role="alert" className="mt-2 text-sm">
                        Reconnect the previous account, choose another, or clear
                        the selection to save your draft without an account.
                      </p>
                    )}
                    <Link
                      href="/app/settings/integrations"
                      className="mt-1 inline-block text-xs text-primary"
                    >
                      Manage connections
                    </Link>
                    {showErrors && socialErrors.destination && (
                      <p role="alert" className="text-sm text-destructive">
                        {socialErrors.destination}
                      </p>
                    )}
                  </div>
                  {channel === "meta_ads" &&
                    connectionId &&
                    !selectedAccountUnavailable && (
                      <div className="sm:col-span-2">
                        <AdCampaignPicker
                          key={connectionId}
                          connectionId={connectionId}
                          campaignId={content.metaCampaignId ?? ""}
                          adSetId={content.adSetId}
                          canManage={
                            ["owner", "admin", "publisher"].includes(
                              membership?.role ?? ""
                            ) &&
                            !!connectedAccounts
                              .find(c => c.id === connectionId)
                              ?.details.capabilities.includes("publish")
                          }
                          onChange={(metaCampaignId, adSetId) =>
                            setContent(c => ({ ...c, metaCampaignId, adSetId }))
                          }
                        />
                      </div>
                    )}
                </>
              )}
              {composing && (!wizard || step === "creative") && (
                <>
                  {channel === "facebook" && (
                    <SocialPostFields
                      content={content}
                      hasMedia={!!assetKey}
                      onChange={setContent}
                      errors={showErrors ? socialErrors : {}}
                    />
                  )}
                  {channel === "meta_ads" && (
                    <>
                      <details className="sm:col-span-2 rounded-xl border p-4">
                        <summary className="mb-3 cursor-pointer text-sm font-medium">
                          Link a campaign plan (optional)
                        </summary>
                        <CampaignPlanSelect
                          value={content.campaignPlanId}
                          onChange={(planId, plan) =>
                            setContent(c => ({
                              ...c,
                              campaignPlanId: planId,
                              promotion: {
                                audience:
                                  c.promotion?.audience ||
                                  plan?.audience?.slice(0, 2000) ||
                                  "",
                                goal:
                                  c.promotion?.goal ||
                                  plan?.creativeDirection?.slice(0, 2000) ||
                                  "",
                                offer:
                                  c.promotion?.offer ||
                                  plan?.offer?.slice(0, 2000) ||
                                  "",
                              },
                              link: c.link || plan?.destinationUrl || "",
                            }))
                          }
                        />
                      </details>
                      <div className="sm:col-span-2">
                        <Label htmlFor={fieldId("pub-title")}>
                          Internal title
                        </Label>
                        <input
                          id={fieldId("pub-title")}
                          className={channelInput}
                          maxLength={180}
                          value={content.title}
                          onChange={e => setField("title", e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-sm font-medium">
                      {channel === "facebook"
                        ? "Photo or video (optional)"
                        : "Approved finished asset"}
                    </p>
                    {channel === "meta_ads" && studio && (
                      <div className="cfg-card-grid activation-format-grid">
                        {(
                          [
                            [
                              "single",
                              "Single image",
                              "One image with up to five copy options",
                              Image,
                            ],
                            [
                              "placement",
                              "Placement images",
                              "Square 1:1 · Portrait 4:5 · Vertical 9:16",
                              RectangleVertical,
                            ],
                            [
                              "carousel",
                              "Carousel",
                              "Tell a story with 2–10 image cards",
                              Layers,
                            ],
                          ] as const
                        ).map(([value, title, description, Icon]) => (
                          <StudioCard
                            key={value}
                            title={title}
                            description={description}
                            media={
                              <div className="activation-choice-symbol">
                                <Icon size={42} />
                              </div>
                            }
                            selected={
                              (placement
                                ? "placement"
                                : carousel
                                  ? "carousel"
                                  : "single") === value
                            }
                            onSelect={() => {
                              if (
                                (placement
                                  ? "placement"
                                  : carousel
                                    ? "carousel"
                                    : "single") === value
                              )
                                return;
                              setCarousel(value === "carousel");
                              setPlacement(value === "placement");
                              setAsset("");
                              setContent(c => ({
                                ...c,
                                carouselAssetKeys: undefined,
                                placementAssetKeys: undefined,
                              }));
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {channel === "meta_ads" && !studio && (
                      <select
                        aria-label="Ad format"
                        className={channelInput + " mb-3"}
                        value={
                          placement
                            ? "placement"
                            : carousel
                              ? "carousel"
                              : "single"
                        }
                        onChange={e => {
                          setCarousel(e.target.value === "carousel");
                          setPlacement(e.target.value === "placement");
                          setAsset("");
                          setContent(c => ({
                            ...c,
                            carouselAssetKeys: undefined,
                            placementAssetKeys: undefined,
                          }));
                        }}
                      >
                        <option value="single">Single image</option>
                        <option value="placement">
                          Placement images · 1:1, 4:5, 9:16
                        </option>
                        <option value="carousel">Carousel · 2–10 images</option>
                      </select>
                    )}
                    {!placement && (
                      <Button
                        id={fieldId("pub-asset")}
                        type="button"
                        variant="outline"
                        className={channel === "facebook" ? "" : "w-full"}
                        onClick={() => setPickerOpen(true)}
                      >
                        Browse approved assets
                        {carousel
                          ? ` (${content.carouselAssetKeys?.length ?? 0} selected)`
                          : ""}
                      </Button>
                    )}
                    {placement && (
                      <PlacementAssetPicker
                        assets={assets.data ?? []}
                        value={content.placementAssetKeys}
                        onChange={value => {
                          setAsset(value.square ?? "");
                          setContent(c => ({
                            ...c,
                            placementAssetKeys: value,
                          }));
                        }}
                      />
                    )}
                    {canMakeMedia && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2"
                        onClick={() => setMediaOpen(true)}
                      >
                        Create or upload media
                      </Button>
                    )}
                    {channel === "facebook" && !assetKey && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Text and website-preview posts do not need media.
                      </p>
                    )}
                    {channel === "facebook" && assetKey && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setAsset("")}
                      >
                        Remove media
                      </Button>
                    )}
                    {pickerOpen && (
                      <ApprovedAssetPicker
                        assets={assets.data ?? []}
                        channel={channel}
                        multiple={channel === "meta_ads" && carousel}
                        selected={
                          carousel
                            ? (content.carouselAssetKeys ?? [])
                            : assetKey
                              ? [assetKey]
                              : []
                        }
                        onClose={() => setPickerOpen(false)}
                        onSelect={keys => {
                          setAsset(keys[0]);
                          setContent(c => ({
                            ...c,
                            carouselAssetKeys: carousel ? keys : undefined,
                          }));
                        }}
                      />
                    )}
                    {carousel && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {content.carouselAssetKeys?.map((key, index) => {
                          const a = assets.data?.find(a => a.key === key);
                          return (
                            <div
                              key={key}
                              className="w-28 rounded-xl border p-2"
                            >
                              <img
                                src={a?.url}
                                alt={a?.name ?? "Carousel image"}
                                className="h-24 w-full object-contain"
                              />
                              <p className="text-xs">Card {index + 1}</p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={!index}
                                  aria-label="Move card earlier"
                                  onClick={() => {
                                    const keys = [
                                      ...content.carouselAssetKeys!,
                                    ];
                                    [keys[index - 1], keys[index]] = [
                                      keys[index],
                                      keys[index - 1],
                                    ];
                                    setAsset(keys[0]);
                                    setContent(c => ({
                                      ...c,
                                      carouselAssetKeys: keys,
                                    }));
                                  }}
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    index ===
                                    content.carouselAssetKeys!.length - 1
                                  }
                                  aria-label="Move card later"
                                  onClick={() => {
                                    const keys = [
                                      ...content.carouselAssetKeys!,
                                    ];
                                    [keys[index + 1], keys[index]] = [
                                      keys[index],
                                      keys[index + 1],
                                    ];
                                    setAsset(keys[0]);
                                    setContent(c => ({
                                      ...c,
                                      carouselAssetKeys: keys,
                                    }));
                                  }}
                                >
                                  →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {assets.error && (
                      <p role="alert" className="text-xs">
                        The approved library could not be loaded.
                      </p>
                    )}
                    {showErrors && socialErrors.asset && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {socialErrors.asset}
                      </p>
                    )}
                    {selectedAsset && !carousel && !placement && (
                      <div
                        className={
                          channel === "facebook"
                            ? "mt-3 flex items-center gap-3 rounded-xl border bg-muted/30 p-3"
                            : "mt-3 rounded-xl bg-muted/50 p-3"
                        }
                      >
                        {selectedAsset.mediaType === "video" ? (
                          <video
                            src={selectedAsset.url}
                            controls
                            preload="metadata"
                            className={
                              channel === "facebook"
                                ? "h-16 w-20 shrink-0 rounded-lg object-contain"
                                : "mx-auto max-h-52 max-w-full"
                            }
                          />
                        ) : (
                          <img
                            src={selectedAsset.url}
                            alt={selectedAsset.name}
                            className={
                              channel === "facebook"
                                ? "h-16 w-20 shrink-0 rounded-lg object-contain"
                                : "mx-auto max-h-52 max-w-full object-contain"
                            }
                          />
                        )}
                        {channel === "facebook" && (
                          <div className="min-w-0 text-sm">
                            <p className="break-words font-medium">
                              {selectedAsset.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {selectedAsset.mediaType === "video"
                                ? "Video post"
                                : "Photo post"}{" "}
                              · Full preview below
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {(channel === "meta_ads" ||
                    selectedAsset?.mediaType === "image") && (
                    <CopyToolsContainer
                      className={
                        channel === "facebook"
                          ? "sm:col-span-2 rounded-xl border p-4 space-y-4"
                          : "sm:col-span-2 space-y-5"
                      }
                    >
                      {channel === "facebook" && (
                        <summary className="cursor-pointer text-sm font-medium">
                          Write caption with AI (optional)
                        </summary>
                      )}
                      <details className="sm:col-span-2 rounded-xl border p-4 space-y-3">
                        <summary className="cursor-pointer font-semibold">
                          Copy guidance (optional)
                        </summary>
                        <p className="text-xs text-muted-foreground">
                          Promote a product, service, plan, listing, category,
                          or the whole platform.
                        </p>
                        {(
                          [
                            ["audience", "Audience"],
                            ["goal", "Goal"],
                            ["offer", "What are you promoting?"],
                          ] as const
                        ).map(([key, label]) => (
                          <label className="block text-sm" key={key}>
                            {label}
                            <input
                              className={channelInput + " mt-1"}
                              value={content.promotion?.[key] ?? ""}
                              placeholder={
                                key === "audience"
                                  ? businessBrand.data?.businessProfile
                                      ?.audiences
                                  : key === "goal"
                                    ? businessBrand.data?.businessProfile?.goals
                                    : businessBrand.data?.businessProfile
                                        ?.primaryOffer
                              }
                              maxLength={2000}
                              onChange={e =>
                                setContent(c => ({
                                  ...c,
                                  promotion: {
                                    audience: "",
                                    goal: "",
                                    offer: "",
                                    ...c.promotion,
                                    [key]: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        ))}
                      </details>
                      {organizationId && (
                        <div className="sm:col-span-2">
                          {multipleTextOptions ? (
                            <AdTextOptionsEditor
                              organizationId={organizationId}
                              assetKeys={copyAssetKeys}
                              promotion={content.promotion}
                              copyDirection={content.copyDirection}
                              callToAction={
                                channel === "meta_ads"
                                  ? content.callToAction
                                  : undefined
                              }
                              value={content}
                              onChange={copy =>
                                setContent(c => ({ ...c, ...copy }))
                              }
                            />
                          ) : (
                            <AdCopyAssistant
                              organizationId={organizationId}
                              channel={channel}
                              assetKeys={copyAssetKeys}
                              promotion={content.promotion}
                              copyDirection={content.copyDirection}
                              callToAction={
                                channel === "meta_ads"
                                  ? content.callToAction
                                  : undefined
                              }
                              onUse={copy =>
                                setContent(c => ({
                                  ...c,
                                  ...copy,
                                  ...(channel === "facebook"
                                    ? {
                                        message: replaceSocialCaption(
                                          c.message,
                                          copy.message
                                        ),
                                      }
                                    : {}),
                                  textVariants: undefined,
                                }))
                              }
                            />
                          )}
                        </div>
                      )}
                    </CopyToolsContainer>
                  )}
                  {channel === "meta_ads" && !multipleTextOptions && (
                    <div className="sm:col-span-2">
                      <Label htmlFor={fieldId("pub-message")}>
                        Primary ad text
                      </Label>
                      <textarea
                        id={fieldId("pub-message")}
                        className={channelInput + " min-h-28"}
                        maxLength={5000}
                        value={content.message}
                        onChange={e => setField("message", e.target.value)}
                      />
                      {channel === "meta_ads" && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Carousel and placement-image ads use one copy set
                          here. Generate five alternatives and choose one, or
                          use Single image for multiple text options.
                        </p>
                      )}
                    </div>
                  )}
                  {channel === "meta_ads" && (
                    <div className="sm:col-span-2">
                      <Label htmlFor={fieldId("pub-link")}>
                        Destination URL
                      </Label>
                      <input
                        id={fieldId("pub-link")}
                        type="url"
                        className={channelInput}
                        placeholder="https://"
                        value={content.link}
                        onChange={e => setField("link", e.target.value)}
                      />
                    </div>
                  )}
                  {channel === "meta_ads" && (
                    <>
                      {!multipleTextOptions && (
                        <div>
                          <Label htmlFor={fieldId("pub-headline")}>
                            Headline
                          </Label>
                          <input
                            id={fieldId("pub-headline")}
                            className={channelInput}
                            maxLength={200}
                            value={content.headline}
                            onChange={e => setField("headline", e.target.value)}
                          />
                        </div>
                      )}
                      <div>
                        <Label htmlFor={fieldId("pub-cta")}>
                          Call to action
                        </Label>
                        <select
                          id={fieldId("pub-cta")}
                          className={channelInput}
                          value={content.callToAction}
                          onChange={e =>
                            setField("callToAction", e.target.value)
                          }
                        >
                          {metaWebsiteCallToActions.map(option => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {!multipleTextOptions && (
                        <div className="sm:col-span-2">
                          <Label htmlFor={fieldId("pub-description")}>
                            Description
                          </Label>
                          <input
                            id={fieldId("pub-description")}
                            className={channelInput}
                            maxLength={300}
                            value={content.description}
                            onChange={e =>
                              setField("description", e.target.value)
                            }
                          />
                        </div>
                      )}
                      <p className="rounded-xl bg-muted p-3 text-sm sm:col-span-2">
                        Your ad will be created <strong>paused</strong> in the
                        selected campaign and ad set after publishing approval.
                      </p>
                    </>
                  )}
                </>
              )}
              {composing &&
                channel === "facebook" &&
                (!studio || step === "creative") && (
                  <details className="sm:col-span-2 rounded-xl border p-4 space-y-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Post organization (optional)
                    </summary>
                    <p className="text-xs text-muted-foreground">
                      For your workspace only. These details do not appear on
                      Facebook.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor={fieldId("pub-title")}>
                        Internal title (optional)
                      </Label>
                      <input
                        id={fieldId("pub-title")}
                        className={channelInput}
                        maxLength={180}
                        value={
                          content.title === "Untitled post" ? "" : content.title
                        }
                        placeholder="Automatically named from your caption"
                        onChange={e => setField("title", e.target.value)}
                      />
                    </div>
                    <CampaignPlanSelect
                      value={content.campaignPlanId}
                      onChange={(planId, plan) =>
                        setContent(c => ({
                          ...c,
                          campaignPlanId: planId,
                          promotion: {
                            audience:
                              c.promotion?.audience ||
                              plan?.audience?.slice(0, 2000) ||
                              "",
                            goal:
                              c.promotion?.goal ||
                              plan?.creativeDirection?.slice(0, 2000) ||
                              "",
                            offer:
                              c.promotion?.offer ||
                              plan?.offer?.slice(0, 2000) ||
                              "",
                          },
                          link: c.link || plan?.destinationUrl || "",
                        }))
                      }
                    />
                    <div className="space-y-2">
                      <Label htmlFor={fieldId("pub-campaign-label")}>
                        Campaign label (optional)
                      </Label>
                      <input
                        id={fieldId("pub-campaign-label")}
                        className={channelInput}
                        maxLength={180}
                        value={content.campaignLabel}
                        onChange={e =>
                          setField("campaignLabel", e.target.value)
                        }
                      />
                    </div>
                  </details>
                )}
              {!studio && (!wizard || step === "preview") && (
                <ContentPreview
                  channel={channel}
                  content={content}
                  asset={selectedAsset}
                  assets={assets.data ?? []}
                />
              )}
              {adWizard && step === "preview" && (
                <div className="sm:col-span-2 rounded-xl border bg-muted/30 p-4 text-sm space-y-2">
                  <h3 className="font-semibold">Delivery destination</h3>
                  <p>
                    {connectedAccounts.find(c => c.id === connectionId)?.name ||
                      "No account selected"}{" "}
                    · Meta Ads
                  </p>
                  <p>
                    {content.adSetId
                      ? "Campaign and ad set selected."
                      : "Choose a campaign and ad set before delivery."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToStep("setup")}
                  >
                    Edit account & targeting
                  </Button>
                </div>
              )}
              {!composing && item && (
                <p className="sm:col-span-2 text-sm">
                  <Link
                    href={studioContentHref(channel, { id: item.id })}
                    className="text-primary underline"
                  >
                    Edit content in Studio
                  </Link>
                </p>
              )}
              {((stage === "activate" && !studio) ||
                (studio && step === "delivery")) && (
                <>
                  {studio && (
                    <div className="cfg-card-grid activation-timing-grid sm:col-span-2">
                      <StudioCard
                        title="After confirmation"
                        description="Keep this ready to deliver when you decide."
                        selected={!local}
                        onSelect={() => setLocal("")}
                        media={
                          <div className="activation-choice-symbol">
                            <Clock3 size={42} />
                          </div>
                        }
                      />
                      <StudioCard
                        title="Schedule for later"
                        description="Choose a specific date, time and time zone."
                        selected={!!local}
                        onSelect={() => {
                          if (local) return;
                          if (!validTimezone(timezone)) {
                            toast.error("Enter a valid time zone first.");
                            return;
                          }
                          setLocal(dateInZone(Date.now() + 86400000, timezone));
                        }}
                        media={
                          <div className="activation-choice-symbol">
                            <CalendarDays size={42} />
                          </div>
                        }
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor={fieldId("pub-date")}>
                      Publish date and time
                    </Label>
                    <input
                      id={fieldId("pub-date")}
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
                      {channel === "facebook"
                        ? "Clear time — publish after confirmation"
                        : "Clear time — deliver after confirmation"}
                    </button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {channel === "facebook"
                        ? "Saving a date does not schedule the post. Confirm approval and publishing on the next screen."
                        : "Saving a date does not activate delivery."}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor={fieldId("pub-timezone")}>Time zone</Label>
                    <input
                      id={fieldId("pub-timezone")}
                      className={channelInput}
                      value={timezone}
                      placeholder="America/New_York"
                      onChange={e => setTimezone(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Time is interpreted in this time zone, not the account's
                      reporting time zone.
                    </p>
                  </div>
                </>
              )}
              {studio && step === "preview" && (
                <div className="sm:col-span-2 activation-review-note">
                  <h3>Ready for review</h3>
                  <p>
                    {local
                      ? `Requested delivery: ${local.replace("T", " at ")} (${timezone}).`
                      : "No scheduled time. Delivery will wait for your confirmation."}
                  </p>
                  <p>
                    Saving creates a draft in your calendar. The next screen
                    keeps asset approval, publication approval, and delivery
                    confirmation separate.
                  </p>
                </div>
              )}
              {composing &&
                channel === "meta_ads" &&
                (!wizard || step === "creative") && (
                  <div className="sm:col-span-2">
                    <Label htmlFor={fieldId("pub-campaign-label")}>
                      Campaign label (optional)
                    </Label>
                    <input
                      id={fieldId("pub-campaign-label")}
                      className={channelInput}
                      value={content.campaignLabel}
                      onChange={e => setField("campaignLabel", e.target.value)}
                    />
                  </div>
                )}
            </fieldset>
            {item && (
              <p className="text-sm text-muted-foreground">
                Saving changes clears the previous publication approval and
                removes any queued schedule. The asset's separate approval is
                unchanged.
              </p>
            )}
          </div>
        </StudioSections>
      </div>
      <div
        className={
          studio
            ? "cfg-actions activation-footer"
            : "flex flex-wrap justify-end gap-3 border-t bg-card p-4 [&_button]:h-auto [&_button]:min-h-10 [&_button]:max-w-full [&_button]:whitespace-normal"
        }
      >
        {showErrors && Object.keys(socialErrors).length > 0 && (
          <p role="alert" className="w-full text-sm text-destructive">
            {Object.values(socialErrors)[0]}
          </p>
        )}
        <Button variant="outline" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="outline"
          disabled={
            save.isPending || (channel === "meta_ads" && !content.title.trim())
          }
          onClick={() => submit()}
        >
          {save.isPending
            ? "Saving..."
            : stage === "activate"
              ? "Save delivery settings"
              : "Save draft"}
        </Button>
        {wizard && step !== "preview" && (
          <Button
            className={studio ? "cfg-primary" : undefined}
            onClick={() =>
              goToStep(
                step === "setup"
                  ? "creative"
                  : step === "creative" && studio
                    ? "delivery"
                    : "preview"
              )
            }
          >
            {step === "setup"
              ? "Continue to creative"
              : step === "creative" && studio
                ? "Choose timing"
                : studio
                  ? "Review"
                  : "Preview ad"}
          </Button>
        )}
        {stage === "create" && (!wizard || step === "preview") && (
          <Button
            className={studio ? "cfg-primary" : undefined}
            disabled={
              save.isPending ||
              (channel === "meta_ads" && !content.title.trim())
            }
            onClick={() => submit("activate")}
          >
            {studio
              ? "Save & review delivery"
              : channel === "facebook"
                ? "Save & continue"
                : "Save & continue to Activate"}
          </Button>
        )}
      </div>
      {mediaOpen && (
        <StudioMediaDialog
          planId={content.campaignPlanId}
          onClose={() => setMediaOpen(false)}
          onChoose={key => {
            setMediaOpen(false);
            setPickerOpen(true);
            void assets.refetch();
            if (!carousel && !placement) setAsset(key);
          }}
        />
      )}
    </ComposerSurface>
  );
}
function PublicationDetailsSurface({
  inline,
  children,
  busy,
  onClose,
}: {
  inline?: boolean;
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  if (inline)
    return (
      <section
        className="studio-delivery-record space-y-4"
        aria-label="Activation status"
      >
        {children}
      </section>
    );
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function PublicationDetails({
  inline = false,
  item,
  onClose,
  onEdit,
}: {
  item: Publication;
  inline?: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [confirmDelivery, setConfirmDelivery] = useState<
    "approve" | "queue" | null
  >(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [note, setNote] = useState(""),
    [externalId, setExternalId] = useState("");
  const scope = { organizationId: organizationId! };
  const version = { ...scope, id: item.id, revision: item.revision };
  const reviewAssets = trpc.assetLibrary.list.useQuery(scope);
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
  const social = item.channel === "facebook";
  const hasTime = Boolean(item.scheduledAtMs);
  const formattedTime = item.scheduledAtMs
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: item.timezone,
      }).format(item.scheduledAtMs) +
      " (" +
      item.timezone +
      ")"
    : "Now, after confirmation";
  const timeExpired = Boolean(
    item.scheduledAtMs && item.scheduledAtMs <= clock
  );
  const destinationName =
    connections.data?.items.find(c => c.id === item.connectionId)?.name ??
    "Not selected";
  const deliveryLabel = !live
    ? "Save test schedule"
    : social
      ? hasTime
        ? "Schedule post"
        : "Publish now"
      : hasTime
        ? "Schedule delivery"
        : "Create paused ad";
  const approvalLabel = !live
    ? "Approve & save test schedule"
    : hasTime
      ? "Approve & schedule"
      : "Approve & publish now";
  const deliveryToast = (liveEnabled: boolean) =>
    toast.success(
      !liveEnabled
        ? "Test schedule saved. Nothing will be published."
        : social
          ? hasTime
            ? `Post scheduled for ${formattedTime}.`
            : "Post queued to publish now."
          : "Approved ad queued for creation in Meta as paused."
    );
  const success = async () => {
    await Promise.all([
      utils.publishing.list.invalidate(),
      utils.publishing.get.invalidate(),
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
    onSuccess: async (result, variables) => {
      await success();
      if (variables.delivery) deliveryToast(result.liveEnabled === true);
    },
    onError: error,
  });
  const queue = trpc.publishing.queue.useMutation({
    onSuccess: async r => {
      await success();
      deliveryToast(r.liveEnabled);
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
  const awaitingActivation =
    ["draft", "needs_review", "approved"].includes(item.state) ||
    (item.state === "scheduled" &&
      item.result?.deliveryMode === "test" &&
      live);
  const scheduleHeading =
    item.state === "scheduled"
      ? item.result?.deliveryMode === "test"
        ? "Test schedule"
        : hasTime
          ? "Scheduled for"
          : "Queued to publish"
      : [
            "draft",
            "needs_review",
            "approved",
            "changes_requested",
            "rejected",
          ].includes(item.state)
        ? hasTime
          ? "Time selected — not scheduled"
          : "Publish timing"
        : "Selected publishing time";
  const ConfirmHeader = inline ? "div" : DialogHeader;
  const ConfirmTitle = inline ? "h3" : DialogTitle;
  const ConfirmDescription = inline ? "p" : DialogDescription;
  return (
    <PublicationDetailsSurface inline={inline} busy={busy} onClose={onClose}>
      <div className="studio-delivery-content space-y-4">
        {inline ? (
          <>
            <h2>{item.content.title}</h2>
            <ContentPreview
              channel={item.channel}
              content={item.content}
              asset={reviewAssets.data?.find(
                asset => asset.key === item.assetKey
              )}
              assets={reviewAssets.data ?? []}
            />
          </>
        ) : (
          <DialogHeader className="pr-8">
            <DialogTitle>{item.content.title}</DialogTitle>
            <DialogDescription>
              {channelNames[item.channel]} publication. Approval applies to this
              caption, asset version, destination and schedule.
            </DialogDescription>
          </DialogHeader>
        )}
        <PublicationStatus item={item} />
        <p className="text-sm">
          {social ? "Facebook Page" : "Destination"}: {destinationName}
        </p>
        <section
          aria-label="Publishing schedule"
          className="rounded-xl border bg-muted/40 p-4 text-sm space-y-1"
        >
          <p className="font-medium">{scheduleHeading}</p>
          <p>
            {!hasTime && !awaitingActivation
              ? "Immediate publishing"
              : formattedTime}
          </p>
          {social &&
            item.state === "scheduled" &&
            item.result?.deliveryMode !== "test" && (
              <p className="text-muted-foreground">
                {hasTime
                  ? "This post will publish automatically at the scheduled time. No further action is needed."
                  : "This post is queued to publish. No further action is needed."}
              </p>
            )}
          {social && item.state === "approved" && live && (
            <p className="text-muted-foreground">
              Approval is saved.{" "}
              {hasTime
                ? "Schedule the post to activate publishing at the selected time."
                : "Choose Publish now to activate publishing, or select a future time in Delivery settings."}
            </p>
          )}
          {social && ["draft", "needs_review"].includes(item.state) && live && (
            <p className="text-muted-foreground">
              {canPublish
                ? hasTime
                  ? "Approve & schedule confirms this post and its publishing time together."
                  : "Approve & publish now confirms this post for immediate publishing."
                : "A publisher must approve and schedule this post before it can publish."}
            </p>
          )}
        </section>
        {awaitingActivation && timeExpired && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          >
            The selected time has passed. Choose a new time in Delivery
            settings, or clear it to explicitly publish now.
          </div>
        )}
        <p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-4 text-sm">
          {item.content.message || "No caption"}
        </p>
        {item.content.copyTags && (
          <SavedCopyTags tags={item.content.copyTags} />
        )}
        {item.channel === "meta_ads" && (
          <div className="rounded-xl border p-4 space-y-2 text-sm">
            <p>
              <strong>Headline:</strong> {item.content.headline}
            </p>
            <p>
              <strong>Description:</strong> {item.content.description || "None"}
            </p>
            {item.content.textVariants &&
              Object.entries(item.content.textVariants).map(
                ([label, values]) => (
                  <div key={label}>
                    <strong>Additional {label}</strong>
                    {values.map((text, i) => (
                      <p className="whitespace-pre-wrap" key={i}>
                        {i + 2}. {text}
                      </p>
                    ))}
                  </div>
                )
              )}
          </div>
        )}
        {item.content.link && (
          <p className="break-all text-sm">
            Destination URL: {item.content.link}
          </p>
        )}
        {!!item.content.carouselAssetKeys?.length && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {item.content.carouselAssetKeys.map((key, index) => {
              const a = reviewAssets.data?.find(a => a.key === key);
              return (
                <div key={key}>
                  <img
                    src={a?.url}
                    alt={a?.name ?? "Carousel card"}
                    className="h-32 w-full rounded-lg object-contain"
                  />
                  <p className="text-xs">
                    Card {index + 1} · {a?.name ?? key}
                  </p>
                  <Link
                    href={"/app/library?asset=" + encodeURIComponent(key)}
                    className="text-xs text-primary"
                  >
                    Review asset
                  </Link>
                </div>
              );
            })}
          </div>
        )}
        {item.content.placementAssetKeys && (
          <div className="grid grid-cols-3 gap-3">
            {placementSlots.map(slot => {
              const a = reviewAssets.data?.find(
                a => a.key === item.content.placementAssetKeys?.[slot.key]
              );
              return (
                <div key={slot.key}>
                  <img
                    src={a?.url}
                    alt={a?.name ?? slot.label}
                    className="h-32 w-full rounded-lg object-contain"
                  />
                  <p className="text-xs">
                    {slot.label} · {slot.ratio}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {item.assetKey &&
          !item.content.placementAssetKeys &&
          !item.content.carouselAssetKeys?.length && (
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
        {connections.data && !live && (
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
        <div className="flex flex-wrap gap-2 [&_button]:h-auto [&_button]:min-h-10 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2">
          {canEdit && editablePublication(item.state) && (
            <Link href={studioContentHref(item.channel, { id: item.id })}>
              <Button variant="outline" disabled={busy}>
                Edit content in Studio
              </Button>
            </Link>
          )}
          {canEdit && editablePublication(item.state) && (
            <Button variant="outline" disabled={busy} onClick={onEdit}>
              {item.state === "scheduled" && hasTime
                ? "Change schedule"
                : "Delivery settings"}
            </Button>
          )}
          {canEdit &&
            ["draft", "changes_requested", "rejected"].includes(item.state) &&
            !(social && canPublish && item.state === "draft") && (
              <Button
                className="h-auto min-h-9 max-w-full whitespace-normal py-2"
                disabled={busy || timeExpired}
                onClick={() => submit.mutate(version)}
              >
                Submit for publishing approval
              </Button>
            )}
          {canPublish && ["draft", "needs_review"].includes(item.state) && (
            <Button
              disabled={busy || (social && (!connections.data || timeExpired))}
              onClick={() =>
                social
                  ? setConfirmDelivery("approve")
                  : review.mutate({ ...version, decision: "approved", note })
              }
            >
              {social ? approvalLabel : "Approve publication"}
            </Button>
          )}
        </div>
        {canPublish &&
          (item.state === "approved" ||
            (item.state === "scheduled" &&
              item.result?.deliveryMode === "test" &&
              live)) && (
            <Button
              className="h-auto min-h-10 whitespace-normal py-2"
              disabled={busy || !connections.data || timeExpired}
              onClick={() => setConfirmDelivery("queue")}
            >
              {deliveryLabel}
            </Button>
          )}
        {confirmDelivery && (
          <PublicationDetailsSurface
            inline={inline}
            busy={busy}
            onClose={() => setConfirmDelivery(null)}
          >
            <div className="rounded-xl border p-4 space-y-4">
              <ConfirmHeader>
                <ConfirmTitle>
                  {confirmDelivery === "approve"
                    ? approvalLabel
                    : deliveryLabel}
                </ConfirmTitle>
                <ConfirmDescription>
                  {live
                    ? social
                      ? hasTime
                        ? "Confirm the Page and time below. The post will publish automatically at that time."
                        : "This will publish the post to the Facebook Page below as soon as it is processed."
                      : "Create this approved ad in Meta with its status set to paused?"
                    : "Save this as a test schedule? No content will be sent."}
                </ConfirmDescription>
              </ConfirmHeader>
              <dl className="space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">
                    {social ? "Facebook Page" : "Destination"}
                  </dt>
                  <dd className="font-medium break-words">{destinationName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {hasTime ? "Publish at" : "Timing"}
                  </dt>
                  <dd className="font-medium">{formattedTime}</dd>
                </div>
              </dl>
              <p className="break-words text-sm">{item.content.title}</p>
              {timeExpired && (
                <p role="alert" className="text-sm text-destructive">
                  The selected time has passed. Go back and choose a new time.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3 [&_button]:h-auto [&_button]:min-h-10 [&_button]:whitespace-normal [&_button]:py-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmDelivery(null)}
                >
                  Go back
                </Button>
                <Button
                  disabled={busy || timeExpired || !connections.data}
                  onClick={() => {
                    const action = confirmDelivery;
                    setConfirmDelivery(null);
                    if (action === "approve")
                      review.mutate({
                        ...version,
                        decision: "approved",
                        note,
                        delivery: {
                          confirm: true,
                          mode: live ? "live" : "test",
                        },
                      });
                    else
                      queue.mutate({
                        ...version,
                        confirm: true,
                        mode: live ? "live" : "test",
                      });
                  }}
                >
                  {confirmDelivery === "approve"
                    ? approvalLabel
                    : deliveryLabel}
                </Button>
              </div>
            </div>
          </PublicationDetailsSurface>
        )}
        {canPublish && reviewable && (
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Request changes or reject
            </summary>
            <div className="mt-3 space-y-3">
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
            </div>
          </details>
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
                    "Cancel this publication in EvokeLoop? This does not delete anything in Meta."
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
            An owner, administrator or publisher must approve and schedule the
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
      </div>
    </PublicationDetailsSurface>
  );
}
