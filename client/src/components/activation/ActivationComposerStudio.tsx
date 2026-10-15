import { scrollStudioChoices } from "../configurator/studioNavigation";
import { CopyDirectionTiles } from "./CopyDirectionTiles";
import { MetaCallToActionTiles } from "./MetaCallToActionTiles";
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
import { replaceSocialCaption } from "@shared/socialPost";
import type { AdCopyField } from "@shared/adCopy";
import { StudioCard } from "../configurator/StudioCard";
import { ContentPreview } from "../ContentPreview";
import { AdCampaignPicker } from "../AdCampaignPicker";
import { CampaignPlanSelect } from "../CampaignPlanSelect";
import { SocialPostFields } from "../SocialPostFields";
import { AdTextOptionsEditor } from "../AdTextOptionsEditor";
import { AdCopyAssistant } from "../AdCopyAssistant";
import { StudioAssetTiles } from "./StudioAssetTiles";
import {
  ActivationCategories,
  ActivationSections,
  activationSections,
  type ActivationEntry,
  type ActivationSection,
} from "./ActivationNavigation";

type Account = { id: string; name: string; details: ConnectionDetails };
type Props = {
  organizationId: number;
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
  errors: Record<string, string>;
  onSave: (review?: "activate") => void;
  onClose: () => void;
  scrollBody: RefObject<HTMLDivElement | null>;
};
export function ActivationComposerStudio(p: Props) {
  const uid = useId();
  const [categories, setCategories] = useState<
    Record<ActivationSection, string>
  >({
    setup: "account",
    creative: p.channel === "meta_ads" ? "format" : "assets",
    copy: "direction",
    delivery: "schedule",
    preview: "summary",
  });
  const [slot, setSlot] = useState<PlacementSlot>("square");
  useEffect(() => {
    if (!p.entry || p.active === false) return;
    if (p.entry.category)
      setCategories(previous => ({
        ...previous,
        [p.entry!.section]: p.entry!.category!,
      }));
  }, [p.entry, p.active]);
  const category = categories[p.section];
  const account = p.accounts.find(a => a.id === p.connectionId);
  const meta = p.channel === "meta_ads";
  const multiple = meta && p.format === "single";
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
  const items =
    p.section === "setup"
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
      : p.section === "creative"
        ? [
            ...(meta ? [{ id: "format", title: "Ad format" }] : []),
            { id: "assets", title: "Approved assets" },
          ]
        : p.section === "copy"
          ? [
              { id: "direction", title: "Copy direction" },
              { id: "setup", title: "Copy" },
              { id: "message", title: meta ? "Primary text" : "Caption" },
              ...(meta
                ? [
                    { id: "headline", title: "Headlines" },
                    { id: "description", title: "Descriptions" },
                    { id: "link", title: "Link & CTA" },
                  ]
                : []),
            ]
          : p.section === "delivery"
            ? [{ id: "schedule", title: "Delivery time" }]
            : [{ id: "summary", title: "Final check" }];
  const chooseCategory = (value: string) => {
    if (value === "channel") p.onChangeChannel?.();
    else {
      setCategories(previous => ({ ...previous, [p.section]: value }));
      scrollStudioChoices(p.scrollBody.current);
    }
  };
  const field = (name: keyof PublicationContent, value: string) =>
    p.setContent(previous => ({ ...previous, [name]: value }));
  const heading =
    items.find(item => item.id === category)?.title ?? items[0].title;
  const nextCategory = items
    .slice(items.findIndex(item => item.id === category) + 1)
    .find(item => !("disabled" in item && item.disabled));
  const nextSection =
    activationSections[
      activationSections.findIndex(section => section.id === p.section) + 1
    ];
  const goNext = () =>
    nextCategory
      ? chooseCategory(nextCategory.id)
      : nextSection && p.onSection(nextSection.id);
  return (
    <div className="activation-composer">
      <fieldset disabled={p.pending} className="cfg-workspace">
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
                  category: "direction",
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
                      setCategories(previous => ({
                        ...previous,
                        [item.section]: item.category,
                      }));
                      p.onSection(item.section as ActivationSection);
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
        <ActivationSections current={p.section} onSelect={p.onSection} />
        <div className="cfg-body activation-fields" ref={p.scrollBody}>
          <ActivationCategories
            items={items}
            current={category}
            onSelect={chooseCategory}
          />
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
                            <Building2 size={38} />
                            <span>{a.name.slice(0, 2).toUpperCase()}</span>
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
                    <Link href="/app/settings/integrations">Integrations</Link>.
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
                        p.format + ":" + (p.format === "placement" ? slot : "")
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
                    <Link href="/app/creatives/studio">create a new asset</Link>
                    .
                  </p>
                </>
              )}
            </>
          )}
          {p.section === "copy" && (
            <>
              {category === "direction" && (
                <CopyDirectionTiles
                  value={p.content.copyDirection}
                  onChange={value =>
                    p.setContent(previous => ({
                      ...previous,
                      copyDirection: value,
                    }))
                  }
                />
              )}
              {category === "setup" && (
                <div className="activation-copy-setup">
                  <p className="activation-help">
                    Describe the offer, audience and goal. AI combines this
                    setup with your brand and any selected images.
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
                      Use brand setup
                    </button>
                  )}
                </div>
              )}
              {multiple && (
                <div
                  hidden={
                    !["setup", "message", "headline", "description"].includes(
                      category
                    )
                  }
                >
                  <AdTextOptionsEditor
                    studioCategory={
                      (["setup", "message", "headline", "description"].includes(
                        category
                      )
                        ? category
                        : "setup") as "setup" | AdCopyField
                    }
                    organizationId={p.organizationId}
                    assetKeys={copyImages}
                    promotion={p.content.promotion}
                    copyDirection={p.content.copyDirection}
                    callToAction={meta ? p.content.callToAction : undefined}
                    value={p.content}
                    onChange={copy =>
                      p.setContent(previous => ({ ...previous, ...copy }))
                    }
                  />
                </div>
              )}
              {!multiple && (
                <div hidden={category !== "setup"}>
                  <AdCopyAssistant
                    organizationId={p.organizationId}
                    channel={p.channel}
                    assetKeys={copyImages}
                    promotion={p.content.promotion}
                    copyDirection={p.content.copyDirection}
                    callToAction={meta ? p.content.callToAction : undefined}
                    onUse={copy =>
                      p.setContent(previous => ({
                        ...previous,
                        ...copy,
                        message: meta
                          ? copy.message
                          : replaceSocialCaption(
                              previous.message,
                              copy.message
                            ),
                        textVariants: undefined,
                      }))
                    }
                  />
                  <p className="activation-help">
                    Choose one suggestion to use.{" "}
                    {meta
                      ? "This format sends one primary text, headline and description."
                      : "Facebook publishes one caption per post."}
                  </p>
                </div>
              )}
              {!meta && category === "message" && (
                <SocialPostFields
                  content={p.content}
                  hasMedia={!!p.assetKey}
                  onChange={p.setContent}
                  errors={p.errors}
                />
              )}
              {meta &&
                !multiple &&
                (["message", "headline", "description"] as string[]).includes(
                  category
                ) && (
                  <label className="cfg-field">
                    <span>
                      {category === "message"
                        ? "Primary ad text"
                        : category === "headline"
                          ? "Headline"
                          : "Description"}
                    </span>
                    <textarea
                      id={`${uid}-${category}`}
                      rows={category === "message" ? 5 : 3}
                      maxLength={
                        category === "message"
                          ? 5000
                          : category === "headline"
                            ? 200
                            : 300
                      }
                      value={p.content[category as AdCopyField]}
                      onChange={e =>
                        field(category as AdCopyField, e.target.value)
                      }
                    />
                    <small>
                      One option for this format. Switch to Single image for up
                      to five alternatives per field.
                    </small>
                  </label>
                )}
              {meta && category === "description" && (
                <p className="activation-help">
                  Meta uses Description for supporting copy. It has no separate
                  subheadline field; text already in your image stays part of
                  the creative.
                </p>
              )}
              {meta && category === "link" && (
                <div className="activation-form-grid">
                  <label className="cfg-field">
                    <span>Destination URL</span>
                    <input
                      type="url"
                      placeholder="https://"
                      value={p.content.link}
                      onChange={e => field("link", e.target.value)}
                    />
                  </label>
                  <div className="activation-span">
                    <MetaCallToActionTiles
                      value={p.content.callToAction}
                      onChange={value => field("callToAction", value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}
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
            <div className="activation-review-note">
              <h3>Ready for review</h3>
              <p>
                {p.local
                  ? `Requested delivery: ${p.local.replace("T", " at ")} (${p.timezone}).`
                  : "Delivery will wait for your confirmation."}
              </p>
              <p>
                Save your draft, then review approval and delivery.{" "}
                {meta
                  ? "Ads will be created paused."
                  : "Your post is published only after final confirmation."}
              </p>
              {multiple && (
                <p>
                  {1 +
                    (p.content.textVariants?.messages.filter(Boolean).length ??
                      0)}{" "}
                  primary text option(s),{" "}
                  {1 +
                    (p.content.textVariants?.headlines.filter(Boolean).length ??
                      0)}{" "}
                  headline option(s),{" "}
                  {1 +
                    (p.content.textVariants?.descriptions.filter(Boolean)
                      .length ?? 0)}{" "}
                  description option(s).
                </p>
              )}
            </div>
          )}
          {Object.entries(p.errors).map(([key, error]) => (
            <p key={key} role="alert" className="text-destructive mt-3">
              {error}
            </p>
          ))}
        </div>
        <div className="cfg-actions activation-footer">
          <button type="button" onClick={p.onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => p.onSave()}>
            {p.pending ? "Saving…" : "Save draft"}
          </button>
          {p.section !== "preview" ? (
            <button type="button" className="cfg-primary" onClick={goNext}>
              {nextCategory
                ? `Continue to ${nextCategory.title.toLowerCase()}`
                : `Continue to ${nextSection?.title.toLowerCase()}`}
            </button>
          ) : (
            <button
              type="button"
              className="cfg-primary"
              onClick={() => p.onSave("activate")}
            >
              Save & review delivery
            </button>
          )}
        </div>
      </fieldset>
    </div>
  );
}
