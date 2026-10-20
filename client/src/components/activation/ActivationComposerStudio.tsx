import { ConnectedAccountIdentity } from "../AccountIdentity";
import {
  StudioJourney,
  StudioSummary,
  useStudioJourney,
} from "../configurator/StudioJourney";
import { StudioCopyComposer } from "./StudioCopyComposer";
import { scrollStudioChoices } from "../configurator/studioNavigation";
import { CopyDirectionTiles } from "./CopyDirectionTiles";
import {
  useEffect,
  useId,
  useState,
  type RefObject,
  type SetStateAction,
} from "react";
import { Link } from "wouter";
import {
  Building2,
  CalendarDays,
  Clock3,
  Image,
  Layers,
  RectangleVertical,
} from "lucide-react";
import type {
  Channel,
  ConnectionDetails,
  PublicationContent,
} from "@shared/channels";
import { channelNames } from "@shared/channels";
import type { LibraryAsset } from "@shared/assetLibrary";
import { placementSlots, type PlacementSlot } from "@shared/metaPlacements";
import {
  copyDimensions,
  copyTaxonomy,
  type CopyDimension,
} from "@shared/copyTaxonomy";
import { StudioCard } from "../configurator/StudioCard";
import { ContentPreview } from "../ContentPreview";
import { AdCampaignPicker } from "../AdCampaignPicker";
import { CampaignPlanSelect } from "../CampaignPlanSelect";
import { StudioAssetTiles } from "./StudioAssetTiles";
import {
  activationSections,
  copyDirectionCategories,
  normalizeCopyCategory,
  type ActivationEntry,
  type ActivationSection,
} from "./ActivationNavigation";

type Account = { id: string; name: string; details: ConnectionDetails };
type Props = {
  organizationId: number;
  draftId?: string;
  role: string;
  channel: Channel;
  section: ActivationSection;
  onSection: (value: ActivationSection) => void;
  onChangeChannel?: () => void;
  entry?: ActivationEntry;
  active?: boolean;
  accounts: Account[];
  connectionsLoading: boolean;
  connectionsError: boolean;
  retryConnections: () => void;
  connectionId: string;
  setConnection: (value: string) => void;
  assets: LibraryAsset[];
  assetsLoading: boolean;
  assetsError: boolean;
  retryAssets: () => void;
  assetKey: string;
  setAsset: (key: string) => void;
  content: PublicationContent;
  setContent: (value: SetStateAction<PublicationContent>) => void;
  format: "single" | "placement" | "carousel";
  setFormat: (value: "single" | "placement" | "carousel") => void;
  local: string;
  setLocal: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  brandDefaults?: { audiences?: string; goals?: string; primaryOffer?: string };
  pending: boolean;
  saveStatus?: string;
  activationLabel?: string;
  activationUnavailable?: boolean;
  activationError?: string;
  liveDelivery?: boolean;
  errors: Record<string, string>;
  onSave: (review?: "activate") => void;
  onClose: () => void;
  scrollBody: RefObject<HTMLDivElement | null>;
};
export function ActivationComposerStudio(p: Props) {
  const uid = useId();
  const [copyBusy, setCopyBusy] = useState(false);
  const [categories, setCategories] = useState<
    Record<ActivationSection, string>
  >({
    setup: "account",
    creative: p.channel === "meta_ads" ? "format" : "assets",
    copy: "messaging_style",
    delivery: "schedule",
    preview: "summary",
  });
  const [slot, setSlot] = useState<PlacementSlot>("square");
  useEffect(() => {
    if (!p.entry || p.active === false) return;
    if (p.entry.category)
      setCategories(previous => ({
        ...previous,
        [p.entry!.section]:
          p.entry!.section === "copy"
            ? normalizeCopyCategory(p.entry!.category!)
            : p.entry!.category!,
      }));
  }, [p.entry, p.active]);
  const category =
    p.section === "copy"
      ? normalizeCopyCategory(categories.copy)
      : categories[p.section];
  const directionCategory = copyDimensions.includes(category as CopyDimension)
    ? (category as CopyDimension)
    : undefined;
  const account = p.accounts.find(a => a.id === p.connectionId);
  const meta = p.channel === "meta_ads";
  const keys =
    p.format === "placement"
      ? Object.values(p.content.placementAssetKeys ?? {}).filter(
          (key): key is string => !!key
        )
      : p.format === "carousel"
        ? (p.content.carouselAssetKeys ?? [])
        : p.assetKey
          ? [p.assetKey]
          : [];
  const selectedAsset = p.assets.find(a => a.key === p.assetKey);
  // The copy endpoint accepts approved images; a video post uses its brief/brand context.
  const copyImages = keys.filter(key =>
    p.assets.some(
      a =>
        a.key === key &&
        a.mediaType === "image" &&
        a.state === "approved" &&
        a.purpose === "finished"
    )
  );
  const getItems = (section: ActivationSection) =>
    section === "setup"
      ? [
          { id: "channel", title: "Channel" },
          { id: "account", title: meta ? "Ad account" : "Facebook Page" },
          ...(meta
            ? [
                {
                  id: "page",
                  title: "Page identity",
                  disabled: !account,
                  reason: "Choose an ad account first",
                },
                {
                  id: "campaign",
                  title: "Campaign & ad set",
                  disabled: !account,
                  reason: "Choose an ad account first",
                },
              ]
            : []),
          { id: "details", title: meta ? "Ad details" : "Post details" },
        ]
      : section === "creative"
        ? [
            ...(meta ? [{ id: "format", title: "Ad format" }] : []),
            { id: "assets", title: "Approved assets" },
          ]
        : section === "copy"
          ? [
              ...copyDirectionCategories,
              { id: "brief", title: "Brief" },
              { id: "compose", title: "Compose" },
            ]
          : section === "delivery"
            ? [{ id: "schedule", title: "Delivery time" }]
            : [{ id: "summary", title: "Final check" }];
  const items = getItems(p.section);
  const values: Record<string, string> = {
    channel: channelNames[p.channel],
    account: account?.name || "Choose an account",
    page: account?.details.pageId || "Choose a Page",
    campaign: p.content.adSetId ? "Ad set selected" : "Choose an ad set",
    details: p.content.title || "Add a name",
    format:
      p.format === "single"
        ? "Single image or video"
        : p.format === "carousel"
          ? "Carousel"
          : "By placement",
    assets: `${keys.length} approved assets`,
    brief: p.content.copyInstructions || "Brand context",
    compose: p.content.message ? "Copy added" : "Add your copy",
    schedule: p.local
      ? `${p.local.replace("T", " · ")} · ${p.timezone}`
      : "After final confirmation",
    summary: Object.keys(p.errors).length
      ? "Inputs to complete"
      : "Review before activating",
  };
  copyDimensions.forEach(dimension => {
    values[dimension] =
      copyTaxonomy[dimension].values
        .filter(value =>
          p.content.copyDirection?.[dimension]?.includes(value.id)
        )
        .map(value => value.label)
        .join(", ") || "AI recommendation";
  });
  const journey = useStudioJourney({
    scopeKey: `activation:${p.organizationId}:${p.channel}:${p.draftId || "new"}`,
    sections: activationSections.map(section => ({
      ...section,
      initialCategory: categories[section.id],
      categories: getItems(section.id).map(item => ({
        ...item,
        value: values[item.id],
        needsInput:
          (item.id === "account" && !account) ||
          (item.id === "campaign" && !p.content.adSetId) ||
          (item.id === "page" && !account?.details.pageId),
      })),
    })),
    section: p.section,
    category,
    initialFocus: !!p.entry?.category,
    onNavigate: (section, value) => {
      if (value === "channel") {
        p.onChangeChannel?.();
        return;
      }
      setCategories(previous => ({ ...previous, [section]: value }));
      p.onSection(section as ActivationSection);
      scrollStudioChoices(
        p.scrollBody.current?.closest(".cfg-root") as HTMLElement | null
      );
    },
  });
  useEffect(() => {
    if (p.entry?.category && p.active !== false) journey.reveal();
  }, [p.entry, p.active]);
  const chooseCategory = (value: string) => journey.navigate(p.section, value);
  const field = (name: keyof PublicationContent, value: string) =>
    p.setContent(previous => ({ ...previous, [name]: value }));
  const heading =
    items.find(item => item.id === category)?.title ?? items[0].title;
  return (
    <div className="activation-composer">
      <fieldset disabled={p.pending} className="cfg-workspace">
        <StudioSummary
          subtitle={`${p.content.title || "Your activation"} · ${channelNames[p.channel]}`}
        >
          <div className="cfg-stage activation-preview">
            <ContentPreview
              channel={p.channel}
              content={p.content}
              asset={selectedAsset}
              assets={p.assets}
            />
            <div className="cfg-build activation-summary">
              <span className="cfg-eyebrow">Your activation</span>
              <h3>{p.content.title || (meta ? "Your ad" : "Your post")}</h3>
              <div className="cfg-summary">
                {[
                  {
                    title: "Channel",
                    value: channelNames[p.channel],
                    section: "setup",
                    category: "channel",
                  },
                  {
                    title: "Account",
                    value: account?.name || "Choose an account",
                    section: "setup",
                    category: "account",
                  },
                  {
                    title: "Creative",
                    value: keys.length
                      ? `${keys.length} approved asset${keys.length === 1 ? "" : "s"}`
                      : "No media selected",
                    section: "creative",
                    category: "assets",
                  },
                  {
                    title: "Copy",
                    value: p.content.message
                      ? "Copy added"
                      : "Choose your direction",
                    section: "copy",
                    category: "messaging_style",
                  },
                  {
                    title: "Timing",
                    value: p.local
                      ? `${p.local.replace("T", " · ")} · ${p.timezone}`
                      : "After final confirmation",
                    section: "delivery",
                    category: "schedule",
                  },
                ].map(item => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      if (item.category === "channel") p.onChangeChannel?.();
                      else {
                        journey.navigate(item.section, item.category);
                      }
                    }}
                  >
                    <span>{item.title}</span>
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>
              <p>
                {meta
                  ? "Ads are delivered to Meta paused. Review and launch from Meta Ads Manager."
                  : "Saving a draft does not publish it. Review and confirm delivery when ready."}
              </p>
            </div>
          </div>
        </StudioSummary>
        <StudioJourney journey={journey} label="Activation sections">
          {copyBusy && !(p.section === "copy" && category === "compose") && (
            <div className="studio-background-copy" role="status">
              <span className="studio-small-spinner" /> Copy is generating. It
              will be ready in Compose.
              <button
                type="button"
                onClick={() => {
                  journey.navigate("copy", "compose");
                }}
              >
                View progress
              </button>
            </div>
          )}
          <div className="cfg-body activation-fields" ref={p.scrollBody}>
            <div className="cfg-content-title">
              <div>
                <span className="cfg-eyebrow">
                  {
                    activationSections.find(section => section.id === p.section)
                      ?.title
                  }
                </span>
                <h2>{heading}</h2>
              </div>
            </div>
            {p.section === "setup" && (
              <>
                {category === "account" && (
                  <>
                    <p className="activation-help">
                      Choose a connected {meta ? "ad account" : "Page"} with
                      publishing permission.
                    </p>
                    {p.connectionsLoading && (
                      <p role="status">Loading connected accounts…</p>
                    )}
                    {p.connectionsError && (
                      <p role="alert">
                        Connections could not be loaded.{" "}
                        <button onClick={p.retryConnections}>Try again</button>
                      </p>
                    )}
                    <div className="cfg-card-grid activation-account-grid">
                      {p.accounts.map(a => (
                        <StudioCard
                          key={a.id}
                          title={a.name}
                          description={
                            a.details.pageName || channelNames[p.channel]
                          }
                          badge={
                            a.details.capabilities.includes("publish")
                              ? "Connected"
                              : "Read only"
                          }
                          selected={a.id === p.connectionId}
                          disabled={!a.details.capabilities.includes("publish")}
                          media={
                            <div className="activation-choice-symbol">
                              <ConnectedAccountIdentity
                                organizationId={p.organizationId}
                                id={a.id}
                                name={a.name}
                                imageUrl={a.details.imageUrl}
                                source={a.details.imageSource}
                              />
                            </div>
                          }
                          onSelect={() => {
                            if (a.id !== p.connectionId) {
                              p.setConnection(a.id);
                              p.setContent(previous => ({
                                ...previous,
                                metaCampaignId: "",
                                adSetId: "",
                              }));
                            }
                          }}
                        />
                      ))}
                    </div>
                    {!!p.connectionId && !account && (
                      <p role="alert">
                        The previous account is unavailable. Reconnect it or
                        choose another account.
                      </p>
                    )}
                    {!p.connectionsLoading && !p.accounts.length && (
                      <p role="status">No connected accounts available.</p>
                    )}
                    <Link
                      className="activation-connect"
                      href="/app/settings/integrations"
                    >
                      Manage channel connections →
                    </Link>
                  </>
                )}
                {category === "page" && (
                  <>
                    <div className="cfg-card-grid activation-account-grid">
                      <StudioCard
                        title={account?.details.pageName || "Page not selected"}
                        description="The Facebook Page connected to this ad account is the public identity for your ad."
                        badge="Ad identity"
                        selected={!!account?.details.pageId}
                        media={
                          <div className="activation-choice-symbol">
                            <Building2 size={42} />
                          </div>
                        }
                        onSelect={() => {}}
                      />
                    </div>
                    <p className="activation-help">
                      To use another Page, update this ad connection in{" "}
                      <Link href="/app/settings/integrations">
                        Integrations
                      </Link>
                      .
                    </p>
                  </>
                )}
                {category === "campaign" && account && (
                  <AdCampaignPicker
                    key={p.connectionId}
                    connectionId={p.connectionId}
                    campaignId={p.content.metaCampaignId ?? ""}
                    adSetId={p.content.adSetId}
                    canManage={
                      ["owner", "admin", "publisher"].includes(p.role) &&
                      account.details.capabilities.includes("publish")
                    }
                    onChange={(metaCampaignId, adSetId) =>
                      p.setContent(previous => ({
                        ...previous,
                        metaCampaignId,
                        adSetId,
                      }))
                    }
                  />
                )}
                {category === "details" && (
                  <div className="activation-form-grid">
                    <label className="cfg-field">
                      <span>Internal title{meta ? "" : " (optional)"}</span>
                      <input
                        maxLength={180}
                        value={p.content.title}
                        onChange={e => field("title", e.target.value)}
                      />
                    </label>
                    <label className="cfg-field">
                      <span>Campaign label (optional)</span>
                      <input
                        value={p.content.campaignLabel}
                        onChange={e => field("campaignLabel", e.target.value)}
                      />
                    </label>
                    <div className="activation-span">
                      <CampaignPlanSelect
                        value={p.content.campaignPlanId}
                        onChange={(planId, plan) =>
                          p.setContent(previous => ({
                            ...previous,
                            campaignPlanId: planId,
                            promotion: {
                              audience:
                                previous.promotion?.audience ||
                                plan?.audience?.slice(0, 2000) ||
                                "",
                              goal:
                                previous.promotion?.goal ||
                                plan?.creativeDirection?.slice(0, 2000) ||
                                "",
                              offer:
                                previous.promotion?.offer ||
                                plan?.offer?.slice(0, 2000) ||
                                "",
                            },
                            link: previous.link || plan?.destinationUrl || "",
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            {p.section === "creative" && (
              <>
                {category === "format" && (
                  <div className="cfg-card-grid activation-format-grid">
                    {(
                      [
                        [
                          "single",
                          "Single image",
                          "One image · up to five alternatives per copy field",
                          Image,
                        ],
                        [
                          "placement",
                          "Placement images",
                          "One ad · square, portrait and vertical images",
                          RectangleVertical,
                        ],
                        [
                          "carousel",
                          "Carousel",
                          "One ad · 2–10 image cards",
                          Layers,
                        ],
                      ] as const
                    ).map(([value, title, description, Icon]) => (
                      <StudioCard
                        key={value}
                        title={title}
                        description={description}
                        selected={p.format === value}
                        media={
                          <div className="activation-choice-symbol">
                            <Icon size={42} />
                          </div>
                        }
                        onSelect={() => p.setFormat(value)}
                      />
                    ))}
                  </div>
                )}
                {category === "assets" && (
                  <>
                    {p.format === "placement" && (
                      <div className="cfg-card-grid activation-format-grid">
                        {placementSlots.map(s => {
                          const asset = p.assets.find(
                            a => a.key === p.content.placementAssetKeys?.[s.key]
                          );
                          return (
                            <StudioCard
                              key={s.key}
                              title={s.label}
                              description={`${s.ratio} · ${s.size}`}
                              selected={slot === s.key}
                              badge={asset ? "Image selected" : "Choose image"}
                              media={
                                asset ? (
                                  <img src={asset.url} alt={asset.name} />
                                ) : (
                                  <div className="activation-choice-symbol">
                                    <RectangleVertical size={42} />
                                  </div>
                                )
                              }
                              onSelect={() => setSlot(s.key)}
                            />
                          );
                        })}
                      </div>
                    )}
                    {p.assetsLoading ? (
                      <p role="status">Loading approved assets…</p>
                    ) : p.assetsError ? (
                      <p role="alert">
                        Assets could not be loaded.{" "}
                        <button onClick={p.retryAssets}>Try again</button>
                      </p>
                    ) : (
                      <StudioAssetTiles
                        key={
                          p.format +
                          ":" +
                          (p.format === "placement" ? slot : "")
                        }
                        assets={p.assets}
                        channel={p.channel}
                        multiple={p.format === "carousel"}
                        requiredFormat={
                          p.format === "placement" ? slot : undefined
                        }
                        selected={
                          p.format === "placement"
                            ? p.content.placementAssetKeys?.[slot]
                              ? [p.content.placementAssetKeys[slot]!]
                              : []
                            : keys
                        }
                        onSelect={selected => {
                          if (p.format === "placement") {
                            const value = {
                              ...p.content.placementAssetKeys,
                              [slot]: selected[0],
                            };
                            p.setAsset(value.square ?? "");
                            p.setContent(previous => ({
                              ...previous,
                              placementAssetKeys: value,
                            }));
                          } else {
                            p.setAsset(selected[0] ?? "");
                            if (p.format === "carousel")
                              p.setContent(previous => ({
                                ...previous,
                                carouselAssetKeys: selected,
                              }));
                          }
                        }}
                      />
                    )}
                    {!meta && p.assetKey && (
                      <button
                        className="cfg-secondary"
                        onClick={() => p.setAsset("")}
                      >
                        Remove media
                      </button>
                    )}
                    {!meta && (
                      <p className="activation-help">
                        Media is optional for text and website-preview posts.
                      </p>
                    )}
                    {p.format === "carousel" && keys.length > 0 && (
                      <div className="activation-carousel-order">
                        <h3>Card order</h3>
                        {keys.map((key, index) => (
                          <div key={key}>
                            <span>
                              {index + 1}.{" "}
                              {p.assets.find(a => a.key === key)?.name}
                            </span>
                            {[-1, 1].map(delta => (
                              <button
                                key={delta}
                                type="button"
                                className="cfg-secondary"
                                disabled={
                                  index + delta < 0 ||
                                  index + delta >= keys.length
                                }
                                aria-label={`Move card ${index + 1} ${delta < 0 ? "earlier" : "later"}`}
                                onClick={() => {
                                  const next = [...keys];
                                  [next[index], next[index + delta]] = [
                                    next[index + delta],
                                    next[index],
                                  ];
                                  p.setAsset(next[0]);
                                  p.setContent(previous => ({
                                    ...previous,
                                    carouselAssetKeys: next,
                                  }));
                                }}
                              >
                                {delta < 0 ? "←" : "→"}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="activation-help">
                      Only approved finished creatives appear here.{" "}
                      <Link href="/app/library?view=drafts">
                        Review drafts in the Asset Library
                      </Link>{" "}
                      or{" "}
                      <Link href="/app/creatives/studio">
                        create a new asset
                      </Link>
                      .
                    </p>
                  </>
                )}
              </>
            )}
            {p.section === "copy" && (
              <>
                {directionCategory && (
                  <CopyDirectionTiles
                    key={directionCategory}
                    dimension={directionCategory}
                    value={p.content.copyDirection}
                    onChange={value =>
                      p.setContent(previous => ({
                        ...previous,
                        copyDirection: value,
                      }))
                    }
                  />
                )}
                {category === "brief" && (
                  <div className="activation-copy-setup">
                    <p className="activation-help">
                      Describe what you are promoting, who it is for, and the
                      result you want. Fill from brand only completes blank
                      fields. Continue to Compose to create and edit your copy.
                    </p>
                    <div className="activation-form-grid">
                      {(
                        [
                          ["offer", "What are you promoting?"],
                          ["audience", "Audience"],
                          ["goal", "Goal"],
                        ] as const
                      ).map(([key, title]) => (
                        <label className="cfg-field" key={key}>
                          <span>{title}</span>
                          <textarea
                            aria-label={title}
                            rows={3}
                            maxLength={2000}
                            value={p.content.promotion?.[key] ?? ""}
                            onChange={e =>
                              p.setContent(previous => ({
                                ...previous,
                                promotion: {
                                  audience: "",
                                  goal: "",
                                  offer: "",
                                  ...previous.promotion,
                                  [key]: e.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    {p.brandDefaults && (
                      <button
                        className="cfg-secondary"
                        type="button"
                        onClick={() =>
                          p.setContent(previous => ({
                            ...previous,
                            promotion: {
                              audience:
                                previous.promotion?.audience ||
                                p.brandDefaults?.audiences?.slice(0, 2000) ||
                                "",
                              goal:
                                previous.promotion?.goal ||
                                p.brandDefaults?.goals?.slice(0, 2000) ||
                                "",
                              offer:
                                previous.promotion?.offer ||
                                p.brandDefaults?.primaryOffer?.slice(0, 2000) ||
                                "",
                            },
                          }))
                        }
                      >
                        Fill from brand
                      </button>
                    )}
                    <label className="cfg-field activation-copy-instructions">
                      <span>Additional instructions (optional)</span>
                      <textarea
                        aria-label="Additional instructions (optional)"
                        rows={3}
                        maxLength={2000}
                        value={p.content.copyInstructions ?? ""}
                        onChange={e =>
                          field("copyInstructions", e.target.value)
                        }
                        placeholder="Add real offer details, deadlines, supporting facts, or specific instructions."
                      />
                    </label>
                  </div>
                )}
              </>
            )}
            <div hidden={p.section !== "copy" || category !== "compose"}>
              <StudioCopyComposer
                onBusyChange={setCopyBusy}
                organizationId={p.organizationId}
                channel={p.channel}
                assetKeys={copyImages}
                hasMedia={!!p.assetKey}
                content={p.content}
                onChange={p.setContent}
                errors={p.errors}
                onEditChoices={() => chooseCategory("messaging_style")}
                onEditBrief={() => chooseCategory("brief")}
                preview={
                  <ContentPreview
                    channel={p.channel}
                    content={p.content}
                    asset={selectedAsset}
                    assets={p.assets}
                  />
                }
              />
            </div>
            {p.section === "delivery" && (
              <>
                <div className="cfg-card-grid activation-timing-grid">
                  <StudioCard
                    title="After confirmation"
                    description="Keep this ready until you decide to deliver it."
                    selected={!p.local}
                    media={
                      <div className="activation-choice-symbol">
                        <Clock3 size={42} />
                      </div>
                    }
                    onSelect={() => p.setLocal("")}
                  />
                  <StudioCard
                    title="Schedule for later"
                    description="Choose a date, time and time zone."
                    selected={!!p.local}
                    media={
                      <div className="activation-choice-symbol">
                        <CalendarDays size={42} />
                      </div>
                    }
                    onSelect={() =>
                      document.getElementById(`${uid}-date`)?.focus()
                    }
                  />
                </div>
                <div className="activation-form-grid">
                  <label className="cfg-field">
                    <span>Publish date and time</span>
                    <input
                      id={`${uid}-date`}
                      type="datetime-local"
                      value={p.local}
                      onChange={e => p.setLocal(e.target.value)}
                    />
                  </label>
                  <label className="cfg-field">
                    <span>Time zone</span>
                    <input
                      value={p.timezone}
                      onChange={e => p.setTimezone(e.target.value)}
                    />
                  </label>
                </div>
                <p className="activation-help">
                  Saving a time does not schedule delivery. Approval and final
                  confirmation follow in Review.
                </p>
              </>
            )}
            {p.section === "preview" && (
              <div className="studio-activation-review">
                <div className="studio-copy-layout">
                  <div className="studio-review-preview">
                    <ContentPreview
                      channel={p.channel}
                      content={p.content}
                      asset={selectedAsset}
                      assets={p.assets}
                    />
                  </div>
                  <div className="studio-review-summary">
                    <h3>Confirm your activation</h3>
                    <p role="status">
                      {p.activationUnavailable
                        ? "Checking delivery availability…"
                        : Object.keys(p.errors).length
                          ? `${Object.keys(p.errors).length} requirements need attention below.`
                          : "Creative, copy and destination are ready for your confirmation."}
                    </p>
                    {[
                      {
                        title: "Destination",
                        value: `${channelNames[p.channel]} · ${account?.name || "Choose an account"}`,
                        section: "setup",
                        category: "account",
                      },
                      {
                        title: "Creative",
                        value: keys.length
                          ? `${keys.length} approved asset${keys.length === 1 ? "" : "s"}`
                          : meta
                            ? "Choose an approved creative"
                            : "Text or website post",
                        section: "creative",
                        category: "assets",
                      },
                      {
                        title: "Copy",
                        value: p.content.message
                          ? "Copy added — shown in preview"
                          : "No caption added",
                        section: "copy",
                        category: "compose",
                      },
                      {
                        title: "Timing",
                        value: p.local
                          ? `${p.local.replace("T", " · ")} (${p.timezone})`
                          : "Now, after you confirm",
                        section: "delivery",
                        category: "schedule",
                      },
                    ].map(row => (
                      <div key={row.title}>
                        <div>
                          <strong>{row.title}</strong>
                          <p>{row.value}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            journey.navigate(row.section, row.category);
                          }}
                        >
                          Edit {row.title.toLowerCase()}
                        </button>
                      </div>
                    ))}
                    <p>
                      {!["owner", "admin", "publisher"].includes(p.role)
                        ? "A publisher will review your post or ad before delivery."
                        : p.liveDelivery === false
                          ? "Test mode: this saves a test schedule. Nothing will be sent."
                          : meta
                            ? "This creates your ad in Meta with its status set to paused."
                            : p.local
                              ? "Confirming schedules this post to publish automatically at the selected time."
                              : "Confirming publishes this post to the selected Facebook Page as soon as it is processed."}
                    </p>
                    {p.content.textVariants && (
                      <p>
                        Additional saved ad text options are included. Meta may
                        combine them with the main copy.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {p.activationError && (
              <p role="alert" className="studio-generation-error">
                {p.activationError}
              </p>
            )}
            {Object.entries(p.errors).map(([key, error]) => (
              <p key={key} role="alert" className="text-destructive mt-3">
                {error}
              </p>
            ))}
          </div>
        </StudioJourney>
        <div className="cfg-actions activation-footer">
          <button type="button" onClick={p.onClose}>
            Cancel
          </button>
          <span className="studio-save-status" role="status">
            {copyBusy ? "Copy generating · save when ready" : p.saveStatus}
          </span>
          <button type="button" disabled={copyBusy} onClick={() => p.onSave()}>
            {p.pending ? "Saving…" : "Save draft"}
          </button>
          {p.section !== "preview" ? (
            <button
              type="button"
              className="cfg-primary"
              onClick={() => journey.navigate("preview", "summary")}
            >
              Review & activate
            </button>
          ) : (
            <button
              type="button"
              className="cfg-primary"
              disabled={copyBusy || p.activationUnavailable}
              onClick={() => p.onSave("activate")}
            >
              {p.pending
                ? "Confirming…"
                : (p.activationLabel ?? "Confirm activation")}
            </button>
          )}
        </div>
      </fieldset>
    </div>
  );
}
