import { AdCampaignPicker } from "./AdCampaignPicker";
import { CampaignPlanSelect } from "./CampaignPlanSelect";
import { ContentPreview } from "./ContentPreview";
import { StudioMediaDialog } from "./StudioMediaDialog";
import { studioContentHref } from "@shared/contentWorkflow";
import { AdCopyAssistant, TextVariantFields } from "./AdCopyAssistant";
import { PlacementAssetPicker } from "./PlacementAssetPicker";
import { placementSlots } from "@shared/metaPlacements";
import { ApprovedAssetPicker } from "./ApprovedAssetPicker";
import { useEffect, useRef, useState } from "react";
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
  onSaved: (id: string, next?: "activate", channel?: Channel) => void;
}) {
  const { organizationId, membership } = useWorkspace();
  const [mediaOpen, setMediaOpen] = useState(false);
  const nextAction = useRef<"activate" | undefined>(undefined);
  const composing = stage === "create" || !item;
  const canMakeMedia = ["owner", "admin", "creator"].includes(
    membership?.role ?? ""
  );
  const utils = trpc.useUtils();
  const [id] = useState(() => item?.id ?? crypto.randomUUID());
  const channel = item?.channel ?? initialChannel;
  const adWizard = channel === "meta_ads" && composing;
  const [step, setStep] = useState<"setup" | "creative" | "preview">("setup");
  const [platform, setPlatform] = useState("meta_ads");
  const scrollBody = useRef<HTMLDivElement>(null);
  function goToStep(next: "setup" | "creative" | "preview") {
    setStep(next);
    if (scrollBody.current) scrollBody.current.scrollTop = 0;
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
  const [assetKey, setAsset] = useState(
    item?.assetKey ?? initialAssetKey ?? ""
  );
  const [content, setContent] = useState<PublicationContent>(
    item?.content ??
      contentSchema.parse({
        title: channel === "facebook" ? "Untitled post" : "Untitled ad",
        campaignPlanId: initialPlanId,
        adSetId: initialAdSetId ?? "",
      })
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
  const save = trpc.publishing.save.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.publishing.list.invalidate(),
        utils.publishing.get.invalidate(),
      ]);
      toast.success("Draft saved. Nothing has been scheduled or published.");
      onSaved(result.id, nextAction.current, result.channel);
    },
    onError: e => toast.error(e.message),
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
  const setField = (key: keyof PublicationContent, value: string) =>
    setContent(c => ({ ...c, [key]: value }));
  function submit(next?: "activate") {
    nextAction.current = next;
    try {
      const at =
        stage === "create"
          ? (item?.scheduledAtMs ??
            (local ? localScheduleToUtc(local, timezone) : null))
          : local
            ? localScheduleToUtc(local, timezone)
            : null;
      if (stage === "activate" && at && at <= Date.now())
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
        content: {
          ...content,
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
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent
        data-workflow={stage === "create" ? "Create" : "Activate"}
        className="publication-composer flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-4xl [&>*]:min-w-0"
      >
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
                : "Choose a connected social account and create your post."
              : "Choose the destination and timing for this content, then review and approve delivery."}
          </DialogDescription>
        </DialogHeader>
        {adWizard && (
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
        <div
          ref={scrollBody}
          className="min-h-0 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6"
        >
          <fieldset
            className="publication-fields grid min-w-0 grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2"
            disabled={save.isPending}
          >
            {(!adWizard || step === "setup") && (
              <>
                {channel === "meta_ads" && (
                  <div className="space-y-2">
                    <Label htmlFor="pub-ad-platform">Advertising channel</Label>
                    <select
                      id="pub-ad-platform"
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
                    channel === "meta_ads"
                      ? "space-y-2"
                      : "sm:col-span-2 space-y-2"
                  }
                >
                  <Label htmlFor="pub-destination">
                    {channel === "facebook" ? "Social account" : "Ad account"}
                  </Label>
                  <select
                    id="pub-destination"
                    className={channelInput}
                    value={connectionId}
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
            {composing && (!adWizard || step === "creative") && (
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
                  {channel === "meta_ads" && (
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
                      type="button"
                      variant="outline"
                      className="w-full"
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
                        setContent(c => ({ ...c, placementAssetKeys: value }));
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
                      No media selected. You can publish a text-only post, or
                      add a link below.
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
                          <div key={key} className="w-28 rounded-xl border p-2">
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
                                  const keys = [...content.carouselAssetKeys!];
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
                                  const keys = [...content.carouselAssetKeys!];
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
                  {selectedAsset && !carousel && !placement && (
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
                <details className="sm:col-span-2 rounded-xl border p-4 space-y-3">
                  <summary className="cursor-pointer font-semibold">
                    Copy guidance (optional)
                  </summary>
                  <p className="text-xs text-muted-foreground">
                    Promote a product, service, plan, listing, category, or the
                    whole platform.
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
                            ? businessBrand.data?.businessProfile?.audiences
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
                    <AdCopyAssistant
                      organizationId={organizationId}
                      channel={channel}
                      assetKeys={
                        placement
                          ? Object.values(
                              content.placementAssetKeys ?? {}
                            ).filter((v): v is string => !!v)
                          : carousel
                            ? (content.carouselAssetKeys ?? [])
                            : assetKey
                              ? [assetKey]
                              : []
                      }
                      promotion={content.promotion}
                      allowVariants={
                        channel === "meta_ads" && !placement && !carousel
                      }
                      onUse={(copy, rest) =>
                        setContent(c => ({
                          ...c,
                          ...copy,
                          textVariants: rest
                            ? {
                                messages: rest.map(o => o.message),
                                headlines: rest.map(o => o.headline),
                                descriptions: rest
                                  .map(o => o.description)
                                  .filter(Boolean),
                              }
                            : undefined,
                        }))
                      }
                    />
                  </div>
                )}
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
                {channel === "meta_ads" && (
                  <div className="sm:col-span-2">
                    {!placement && !carousel ? (
                      <TextVariantFields
                        value={content.textVariants}
                        onChange={value =>
                          setContent(c => ({ ...c, textVariants: value }))
                        }
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Carousel and placement-image ads use one copy set here.
                        Multiple text options are available with Single image.
                      </p>
                    )}
                  </div>
                )}
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
                      For a media post, leave this field empty and include any
                      URL in the caption.
                    </p>
                  )}
                </div>
                {channel === "meta_ads" && (
                  <>
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
                        {["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "GET_OFFER"].map(
                          c => (
                            <option key={c} value={c}>
                              {statusLabel(c.toLowerCase())}
                            </option>
                          )
                        )}
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
                      Your ad will be created <strong>paused</strong> in the
                      selected campaign and ad set after publishing approval.
                    </p>
                  </>
                )}
              </>
            )}
            {(!adWizard || step === "preview") && (
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
            {stage === "activate" && (
              <>
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
                    Time is interpreted in this time zone, not the account's
                    reporting time zone.
                  </p>
                </div>
              </>
            )}
            {composing && (!adWizard || step === "creative") && (
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
        <div className="flex flex-wrap justify-end gap-3 border-t bg-card p-4 [&_button]:h-auto [&_button]:min-h-10 [&_button]:max-w-full [&_button]:whitespace-normal">
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={adWizard ? "outline" : "default"}
            disabled={save.isPending || !content.title.trim()}
            onClick={() => submit()}
          >
            {save.isPending
              ? "Saving..."
              : stage === "activate"
                ? "Save delivery settings"
                : "Save draft"}
          </Button>
          {adWizard && step !== "preview" && (
            <Button
              onClick={() =>
                goToStep(step === "setup" ? "creative" : "preview")
              }
            >
              {step === "setup" ? "Continue to creative" : "Preview ad"}
            </Button>
          )}
          {stage === "create" && (!adWizard || step === "preview") && (
            <Button
              disabled={save.isPending || !content.title.trim()}
              onClick={() => submit("activate")}
            >
              Save & continue to Activate
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
  const [confirmQueue, setConfirmQueue] = useState(false);
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
            <Link href={studioContentHref(item.channel, { id: item.id })}>
              <Button variant="outline" disabled={busy}>
                Edit content in Studio
              </Button>
            </Link>
          )}
          {canEdit && editablePublication(item.state) && (
            <Button variant="outline" disabled={busy} onClick={onEdit}>
              Delivery settings
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
              onClick={() => setConfirmQueue(true)}
            >
              {live
                ? item.scheduledAtMs
                  ? "Schedule delivery"
                  : "Queue now"
                : "Save test schedule"}
            </Button>
          )}
        {confirmQueue && (
          <Dialog open onOpenChange={setConfirmQueue}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm delivery</DialogTitle>
                <DialogDescription>
                  {live
                    ? item.channel === "facebook"
                      ? "Queue this approved Facebook post for live delivery?"
                      : "Create this approved ad in Meta with its status set to paused?"
                    : "Save this as a test schedule? No content will be sent."}
                </DialogDescription>
              </DialogHeader>
              <p className="font-medium">{item.content.title}</p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConfirmQueue(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setConfirmQueue(false);
                    queue.mutate({ ...version, confirm: true });
                  }}
                >
                  Confirm delivery
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
