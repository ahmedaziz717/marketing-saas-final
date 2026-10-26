import {
  GoogleFormatPicker,
  googleCreativeFormats,
  googleFormatLabel,
  googleExistingMediaCampaign,
  type GoogleCreativeFormat,
} from "./GoogleCreativeFormat";
import { AdEditor, AssetEditor } from "./GoogleAdEditor";
import { StudioAccountPicker } from "../activation/StudioAccountPicker";
import { GooglePmaxAi } from "./GooglePmaxAi";
import { Field, label } from "./GoogleCampaignFields";
import { GoogleDeliverySettings } from "./GoogleDeliverySettings";
import { GoogleChangeSummary } from "./GoogleChangeSummary";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { ClipboardCheck, Images, Radio, Settings2, Type } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { z } from "zod";
import { useAuth } from "@/_core/hooks/useAuth";
import { useStudioDraft } from "@/hooks/useStudioDraft";
import { studioDraftKey, draftShapeSchema } from "@/lib/studioDrafts";
import { StudioCard } from "@/components/configurator/StudioCard";
import {
  StudioJourney,
  StudioSummary,
  useStudioJourney,
} from "@/components/configurator/StudioJourney";
import { Button } from "@/components/ui/button";
import { PartnerLogo } from "@/components/PartnerLogo";
import {
  googleCampaignTypes,
  googleChangeSchema,
  type GoogleChange,
  type GoogleCampaignCreate,
  type GoogleAdContent,
} from "@shared/googleCampaigns";
import type { GoogleCampaignDraft } from "../../../../drizzle/channelSchema";
import "@/styles/configurator.css";
import "@/styles/activationStudio.css";
import "@/styles/googleCampaignStudio.css";

const emptyAd = (): GoogleAdContent => ({
  name: "",
  finalUrl: "",
  headlines: ["", "", ""],
  descriptions: ["", ""],
  assets: [],
  path1: "",
  path2: "",
});
const googleDraftSchema = z.object({
  chosen: z.string().max(128),
  mode: z.enum(["existing", "new", "drafts"]),
  format: z.enum(["image", "video", "text", "logo"]),
  campaignMedia: z.enum(["image", "video"]).default("image"),
  editingSettings: z.boolean().default(false),
  includeInactive: z.boolean(),
  campaignId: z.string().max(128),
  change: draftShapeSchema(googleChangeSchema),
  draftId: z.string().nullable().default(null),
  draftRevision: z.number().nullable().default(null),
});
const newCampaign = (): GoogleCampaignCreate => ({
  kind: "campaign_create",
  type: "SEARCH",
  name: "",
  status: "ENABLED",
  dailyBudget: 0,
  bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
  politicalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  locationIds: [],
  languageIds: ["1000"],
  keywords: [],
  ad: emptyAd(),
  searchPartners: false,
  displayExpansion: false,
  shoppingPriority: 0,
  urlExpansion: false,
});
export function GoogleCampaignComposer({
  organizationId,
  channelChoices,
}: {
  organizationId: number;
  channelChoices: ReactNode;
}) {
  const { membership } = useWorkspace();
  const { user } = useAuth();
  const params = new URLSearchParams(useSearch());
  const connections = trpc.googleAds.connections.useQuery({ organizationId });
  const available =
    connections.data?.items.filter(
      c => c.status === "connected" && !c.needsReconnect
    ) ?? [];
  const [chosen, setChosen] = useState(params.get("connectionId") ?? "");
  const connection = available.find(c => c.id === chosen),
    connectionId = connection?.id ?? "";
  const scope = { organizationId, connectionId };
  const [section, setSection] = useState(
      params.get("connectionId") ? "campaign" : "account"
    ),
    [mode, setMode] = useState<"existing" | "new" | "drafts">("existing");
  const [format, setFormat] = useState<GoogleCreativeFormat>("image");
  const [campaignMedia, setCampaignMedia] = useState<"image" | "video">(
    "image"
  );
  const [checking, setChecking] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const entryAssets = trpc.assetLibrary.list.useQuery(
    { organizationId },
    { enabled: params.has("asset") }
  );
  const entryApplied = useRef(false);
  useEffect(() => {
    if (entryApplied.current || !entryAssets.data || !params.has("asset"))
      return;
    entryApplied.current = true;
    const asset = entryAssets.data.find(row => row.key === params.get("asset"));
    if (asset?.state === "approved" && asset.mediaType === "video") {
      setCampaignMedia("video");
      setFormat("video");
    }
  }, [entryAssets.data]);
  const [includeInactive, setIncludeInactive] = useState(false),
    [campaignId, setCampaignId] = useState("");
  const [change, setChange] = useState<GoogleChange>(newCampaign),
    [draft, setDraft] = useState<GoogleCampaignDraft | null>(null),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<z.infer<
    typeof googleDraftSchema
  > | null>(null);
  const remembered = useStudioDraft({
    key: studioDraftKey(
      user?.id,
      organizationId,
      "activation:google",
      `new:${params.get("connectionId") ?? ""}:${params.get("asset") ?? ""}`
    ),
    ready: !pendingRestore,
    value: {
      chosen,
      mode,
      format,
      campaignMedia,
      editingSettings,
      includeInactive,
      campaignId,
      change,
      draftId: draft?.id ?? null,
      draftRevision: draft?.revision ?? null,
    },
    schema: googleDraftSchema,
    restore: value => {
      setChosen(value.chosen);
      setMode(value.mode);
      setFormat(value.format);
      setCampaignMedia(value.campaignMedia);
      setEditingSettings(value.editingSettings);
      setIncludeInactive(value.includeInactive);
      setCampaignId(value.campaignId);
      if (value.draftId) setPendingRestore(value);
      else setChange(value.change);
      setConfirmed(false);
    },
  });
  const list = trpc.googleAds.campaigns.inventory.useQuery(
    { ...scope, includeInactive },
    { enabled: !!connectionId }
  );
  const detail = trpc.googleAds.campaigns.inventory.useQuery(
    { ...scope, campaignId, includeInactive: true },
    { enabled: !!connectionId && !!campaignId }
  );
  const drafts = trpc.googleAds.campaigns.drafts.useQuery(scope, {
    enabled: !!connectionId,
  });
  useEffect(() => {
    if (!pendingRestore || !drafts.data) return;
    const saved = drafts.data.find(row => row.id === pendingRestore.draftId);
    if (!saved) {
      setError(
        "The saved Google draft is unavailable. Your local choices remain on this device; reset to start a new setup."
      );
      return;
    }
    setDraft(saved);
    setChange(
      saved.revision === pendingRestore.draftRevision &&
        !["publishing", "published", "uncertain"].includes(saved.state)
        ? pendingRestore.change
        : saved.change
    );
    if (saved.revision !== pendingRestore.draftRevision)
      setError(
        "This saved draft changed elsewhere. Its current version was opened."
      );
    setConfirmed(false);
    setPendingRestore(null);
  }, [pendingRestore, drafts.data]);
  const save = trpc.googleAds.campaigns.save.useMutation(),
    validate = trpc.googleAds.campaigns.validate.useMutation(),
    publish = trpc.googleAds.campaigns.publish.useMutation();
  const busy =
    checking ||
    save.isPending ||
    validate.isPending ||
    publish.isPending ||
    !!pendingRestore;
  const eligibleCampaigns =
    list.data?.campaigns.filter(r =>
      googleExistingMediaCampaign(
        r.campaign.advertisingChannelType,
        campaignMedia
      )
    ) ?? [];
  const current = detail.data?.campaigns.find(
    r =>
      String(r.campaign.id) === campaignId &&
      (mode !== "existing" ||
        googleExistingMediaCampaign(
          r.campaign.advertisingChannelType,
          campaignMedia
        ))
  );
  const locked =
    !!draft && ["publishing", "published", "uncertain"].includes(draft.state);
  const normalizedChange = googleChangeSchema.safeParse(change);
  const dirty =
    !draft ||
    !normalizedChange.success ||
    JSON.stringify(draft.change) !== JSON.stringify(normalizedChange.data);
  const canPublish = ["owner", "admin", "publisher"].includes(
    membership?.role ?? ""
  );
  const edit = (next: GoogleChange) => {
    setChange(next);
    setShowValidation(false);
    setConfirmed(false);
    setError("");
  };
  const begin = (next: GoogleChange, target = "settings") => {
    setCheckAttempt(value => value + 1);
    edit(next);
    setEditingSettings(
      next.kind === "campaign_update" && target === "settings"
    );
    setPendingRestore(null);
    setDraft(null);
    setFormat(campaignMedia);
    setSection(target);
  };
  const hasAd = "ad" in change;
  const hasAssets =
    hasAd ||
    change.kind === "asset_group_assets" ||
    change.kind === "asset_group_create";
  const creativeType = hasAd ? change.type : "PERFORMANCE_MAX";
  const brandAssets = hasAd || !current?.campaign.brandGuidelinesEnabled;
  const choices = googleCreativeFormats(creativeType, brandAssets).filter(
    f => !hasAd || f !== "text" || creativeType === "SEARCH"
  );
  const activeFormat = choices.includes(format)
    ? format
    : (choices[0] ?? "image");
  const selectedGroup = detail.data?.groups.find(
    r =>
      String((r.assetGroup ?? r.adGroup)?.id) ===
      ("assetGroupId" in change
        ? change.assetGroupId
        : "adGroupId" in change
          ? change.adGroupId
          : "")
  );

  const journey = useStudioJourney({
    scopeKey: `google:${organizationId}:${connectionId}`,
    section: ["channel", "account", "campaign"].includes(section)
      ? "setup"
      : ["settings", "targeting", "options"].includes(section)
        ? "delivery"
        : section === "format"
          ? "creative"
          : section,
    category: section,
    onNavigate: (_section, category) => setSection(category),
    sections: [
      {
        id: "setup",
        title: "Destination",
        subtitle: "Channel, account & campaign",
        icon: Radio,
        categories: [
          { id: "channel", title: "Channel", value: "Google Ads" },
          {
            id: "account",
            title: "Account",
            value: connection?.name ?? "Choose a Google account",
            needsInput: !connection,
          },
          {
            id: "campaign",
            title: "Campaign",
            value:
              mode === "new" ? "New campaign" : "Existing campaigns & drafts",
            disabled: !connection,
            reason: "Choose an account first",
          },
        ],
      },
      {
        id: "creative",
        title: "Creative",
        subtitle: "Ads & asset groups",
        icon: Images,
        categories: [
          ...(hasAssets && choices.length > 0
            ? [
                {
                  id: "format",
                  title:
                    creativeType === "PERFORMANCE_MAX"
                      ? "Asset type"
                      : "Ad format",
                  value: googleFormatLabel(activeFormat),
                  disabled: !connection,
                  reason: "Choose an account first",
                },
              ]
            : []),
          {
            id: "creative",
            title: hasAssets ? "Assets & details" : "Creative",
            value: "Native formats & approved assets",
            disabled: !connection,
            reason: "Choose an account first",
          },
        ],
      },
      ...(hasAd
        ? [
            {
              id: "copy",
              title: "Copy",
              subtitle: "Headlines & descriptions",
              icon: Type,
              categories: [
                {
                  id: "copy",
                  title: "Ad copy",
                  value:
                    change.type === "SHOPPING"
                      ? "From your product feed"
                      : "Channel-specific text limits",
                  disabled: !connection,
                  reason: "Choose an account first",
                },
              ],
            },
          ]
        : []),
      ...(change.kind === "campaign_create" || editingSettings
        ? [
            {
              id: "delivery",
              title: "Delivery",
              subtitle: "Budget & targeting",
              icon: Settings2,
              categories: [
                {
                  id: "settings",
                  title: "Budget & bidding",
                  value: "Account currency & schedule",
                  disabled: !connection,
                  reason: "Choose an account first",
                },
                ...(change.kind === "campaign_create"
                  ? [
                      {
                        id: "targeting",
                        title: "Locations & languages",
                        value: "Reach the right audience",
                      },
                      {
                        id: "options",
                        title: "Campaign options",
                        value: googleCampaignTypes[change.type].label,
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
      {
        id: "review",
        title: "Review & activate",
        subtitle: "Review & publish",
        icon: ClipboardCheck,
        categories: [
          {
            id: "review",
            title: "Review change",
            value: draft?.state ?? "Unsaved draft",
            disabled:
              !connection ||
              (change.kind === "campaign_update" && !editingSettings),
            reason: !connection
              ? "Choose an account first"
              : "Choose a group and creative first",
          },
        ],
      },
    ],
  });
  const reviewInput = JSON.stringify({ organizationId, connectionId, change });
  const latestReview = useRef(reviewInput);
  latestReview.current = reviewInput;
  // Save and validate only when reviewing a complete draft. Never publish here.
  useEffect(() => {
    if (
      section !== "review" ||
      !connectionId ||
      pendingRestore ||
      locked ||
      (change.kind === "campaign_update" && !editingSettings)
    )
      return;
    let cancelled = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const stillCurrent = () =>
      !cancelled && latestReview.current === reviewInput;
    const timer = setTimeout(async () => {
      const parsed = googleChangeSchema.safeParse(change);
      setConfirmed(false);
      setCheckFailed(false);
      setError("");
      if (!parsed.success) {
        setShowValidation(true);
        return;
      }
      if (
        mode === "existing" &&
        change.kind !== "campaign_create" &&
        !current
      ) {
        setError(
          "Choose a compatible campaign in Destination before continuing."
        );
        return;
      }
      setChecking(true);
      let row = draft;
      try {
        if (dirty) {
          row = await save.mutateAsync({
            ...scope,
            ...(draft ? { id: draft.id, revision: draft.revision } : {}),
            change: parsed.data,
          });
        }
        if (!row || !stillCurrent()) return;
        // Keep the saved revision on provider failure so retry updates the same draft.
        setDraft(row);
        const result = await validate.mutateAsync({
          organizationId,
          id: row.id,
          revision: row.revision,
        });
        if (!stillCurrent()) return;
        setDraft(result);
        setShowValidation(false);
        void drafts.refetch();
        // Recheck before the server's 15-minute review window expires.
        refresh = setTimeout(() => {
          if (stillCurrent()) {
            setConfirmed(false);
            setCheckAttempt(value => value + 1);
          }
        }, 14 * 60_000);
      } catch (e) {
        if (stillCurrent()) {
          setCheckFailed(true);
          setError(
            e instanceof Error
              ? e.message
              : "Could not check this change with Google."
          );
        }
      } finally {
        if (stillCurrent()) setChecking(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(refresh);
      setChecking(false);
    };
    // Draft state and mutation handles change during the check, but do not restart it.
  }, [section, reviewInput, checkAttempt, !!pendingRestore, locked]);
  async function deliver() {
    if (!draft?.reviewHash || dirty || !confirmed) return;
    try {
      const result = await publish.mutateAsync({
        organizationId,
        id: draft.id,
        revision: draft.revision,
        reviewHash: draft.reviewHash,
        confirm: true,
      });
      setDraft(result);
      setConfirmed(false);
      if (result.state === "published") {
        toast.success("Google confirmed the campaign change.");
        void list.refetch();
        if (campaignId) void detail.refetch();
      } else setError(result.error ?? "Check the delivery status.");
      void drafts.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing could not finish.");
    }
  }
  const localValidation = showValidation
    ? googleChangeSchema.safeParse(change)
    : null;
  const fieldIssues =
    localValidation && !localValidation.success
      ? localValidation.error.issues
      : [];
  function goToIssue(path: PropertyKey[]) {
    const key = path.join(".");
    const target = key.startsWith("ad.")
      ? ["ad.name", "ad.finalUrl", "ad.assets"].some(p => key.startsWith(p))
        ? "creative"
        : "copy"
      : ["locationIds", "languageIds", "keywords"].some(p => key.startsWith(p))
        ? "targeting"
        : change.kind.startsWith("asset_group")
          ? "creative"
          : "settings";
    setSection(target);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-google-field="${path.slice(0, 2).join(".")}"]`
        )
        ?.focus()
    );
  }
  return (
    <div className="google-campaign-studio">
      <div className="cfg-workspace">
        <StudioSummary subtitle="Google Ads · campaign draft">
          <div className="cfg-stage google-preview">
            <div className="google-preview-ad" aria-label="Google ad preview">
              <span className="cfg-eyebrow">
                <PartnerLogo slug="googleads" name="Google Ads" size={24} />{" "}
                Google Ads · draft preview
              </span>
              <h3>
                {"ad" in change
                  ? change.ad.headlines[0] || "Your headline"
                  : "Your campaign creative"}
              </h3>
              <p>
                {"ad" in change
                  ? change.ad.descriptions[0] ||
                    "Your description appears here."
                  : "Select a campaign, ad or asset group to prepare a change."}
              </p>
              {"ad" in change && (
                <small>{change.ad.finalUrl || "Landing page"}</small>
              )}
            </div>
            <div className="google-preview-summary">
              <span className="cfg-eyebrow">
                {change.kind === "campaign_create"
                  ? googleCampaignTypes[change.type].label
                  : label(change.kind)}
              </span>
              <h2>
                {"name" in change
                  ? change.name || "Your next campaign"
                  : (current?.campaign.name ?? "Campaign change")}
              </h2>
              <p>
                {connection
                  ? `${connection.name} · ${connection.details.currency} · ${connection.details.timezone}`
                  : "Choose a connected Google Ads account"}
              </p>
              {"dailyBudget" in change && (
                <p>
                  {change.dailyBudget.toLocaleString()}{" "}
                  {connection?.details.currency} / day · {label(change.status)}
                </p>
              )}
              <small>
                {draft
                  ? `Saved revision ${draft.revision} · ${label(draft.state)}`
                  : "Draft · no changes published"}
              </small>
              {connection && (
                <div className="google-summary-links">
                  <Link
                    href={`/app/analytics/studio?channel=google_ads&connectionId=${connectionId}`}
                  >
                    Measure results
                  </Link>
                  <Link
                    href={`/app/optimize/studio?channel=google_ads&connectionId=${connectionId}`}
                  >
                    Optimize
                  </Link>
                </div>
              )}
            </div>
          </div>
        </StudioSummary>
        <StudioJourney journey={journey} label="Activation sections">
          <section className="cfg-body google-fields">
            {section === "channel" && channelChoices}
            {section === "account" && (
              <>
                <h2>Choose your Google Ads account</h2>
                <p>
                  Campaign types, formats and delivery settings follow this
                  account.
                </p>
                {connections.isLoading && (
                  <p role="status">Loading accounts…</p>
                )}
                {connections.error && (
                  <p role="alert">{connections.error.message}</p>
                )}
                {chosen && !connections.isLoading && !connection && (
                  <p role="alert">
                    This Google Ads account is unavailable. Choose a connected
                    account to continue.
                  </p>
                )}
                <StudioAccountPicker
                  accounts={available.map(c => ({
                    id: c.id,
                    name: c.name,
                    accountId: c.accountId,
                    currency: c.details.currency,
                    timezone: c.details.timezone,
                  }))}
                  channelLabel="Google Ads"
                  value={connectionId}
                  disabled={busy}
                  onChange={id => {
                    if (id !== connectionId) {
                      setChosen(id);
                      setCampaignId("");
                      setPendingRestore(null);
                      setDraft(null);
                      setChange(newCampaign());
                      setConfirmed(false);
                      setError("");
                    }
                    setSection("campaign");
                  }}
                />
                {!connections.isLoading && !available.length && (
                  <p>
                    <Link href="/app/settings/integrations">
                      Connect a Google Ads account
                    </Link>{" "}
                    to get started.
                  </p>
                )}
              </>
            )}
            {!connection && !["channel", "account"].includes(section) && (
              <p>Choose a connected Google Ads account in Destination.</p>
            )}

            {section === "campaign" && !!connection && (
              <>
                <div className="google-mode-tabs">
                  {(["existing", "new", "drafts"] as const).map(m => (
                    <Button
                      variant={mode === m ? "default" : "outline"}
                      key={m}
                      onClick={() => {
                        setMode(m);
                        if (m === "new") {
                          setCampaignId("");
                          begin(newCampaign(), "campaign");
                        }
                      }}
                    >
                      {label(
                        m === "existing"
                          ? "existing campaigns"
                          : m === "new"
                            ? "new campaign"
                            : "saved drafts"
                      )}
                    </Button>
                  ))}
                </div>
                {mode === "new" && (
                  <div className="cfg-card-grid">
                    {Object.entries(googleCampaignTypes).map(([type, info]) => (
                      <StudioCard
                        key={type}
                        title={info.label}
                        description={info.description}
                        selected={
                          change.kind === "campaign_create" &&
                          change.type === type
                        }
                        onSelect={() => {
                          begin({
                            ...newCampaign(),
                            type: type as GoogleCampaignCreate["type"],
                            ad:
                              type === "SHOPPING"
                                ? {
                                    ...emptyAd(),
                                    headlines: [],
                                    descriptions: [],
                                  }
                                : emptyAd(),
                            bidding: {
                              strategy:
                                type === "SHOPPING"
                                  ? "MANUAL_CPC"
                                  : "MAXIMIZE_CONVERSIONS",
                            },
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
                {mode === "existing" && (
                  <>
                    <Field title="Creative to add">
                      <select
                        value={campaignMedia}
                        onChange={event => {
                          const media = event.target.value as "image" | "video";
                          setCampaignMedia(media);
                          setFormat(media);
                          setCampaignId("");
                          setDraft(null);
                          setPendingRestore(null);
                          edit(newCampaign());
                        }}
                      >
                        <option value="image">Images</option>
                        <option value="video">Videos</option>
                      </select>
                    </Field>
                    <p>
                      Only campaigns that support this creative in Activation
                      Studio are shown.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={includeInactive}
                        onChange={e => setIncludeInactive(e.target.checked)}
                      />{" "}
                      Include inactive campaigns
                    </label>
                    {list.isLoading && <p role="status">Loading campaigns…</p>}
                    {list.error && (
                      <p role="alert">
                        {list.error.message}
                        <Button onClick={() => void list.refetch()}>
                          Retry
                        </Button>
                      </p>
                    )}
                    <div className="google-campaign-list">
                      {eligibleCampaigns.map(r => (
                        <button
                          key={r.campaign.id}
                          className={
                            campaignId === r.campaign.id ? "is-selected" : ""
                          }
                          onClick={() => {
                            setCampaignId(String(r.campaign.id));
                            begin(
                              {
                                kind: "campaign_update",
                                campaignId: String(r.campaign.id),
                                name: r.campaign.name,
                                status:
                                  r.campaign.status === "ENABLED"
                                    ? "ENABLED"
                                    : "PAUSED",
                                dailyBudget:
                                  Number(r.campaignBudget.amountMicros ?? 0) /
                                  1e6,
                              },
                              "campaign"
                            );
                          }}
                        >
                          <strong>{r.campaign.name}</strong>
                          <span>
                            {label(r.campaign.advertisingChannelType)} ·{" "}
                            {label(r.campaign.status)} ·{" "}
                            {Number(r.campaignBudget.amountMicros ?? 0) / 1e6}{" "}
                            {list.data?.currency}/day
                          </span>
                        </button>
                      ))}
                    </div>
                    {list.data && !eligibleCampaigns.length && (
                      <p>
                        No {includeInactive ? "available" : "active"} campaigns
                        support adding{" "}
                        {campaignMedia === "image" ? "images" : "videos"} here.
                        Include inactive campaigns or choose another media type.
                      </p>
                    )}
                    {detail.isFetching && campaignId && (
                      <p role="status">Loading campaign details…</p>
                    )}
                    {detail.error && <p role="alert">{detail.error.message}</p>}
                    {current && (
                      <div className="google-existing-detail">
                        <h3>{current.campaign.name}</h3>
                        <Button
                          variant="outline"
                          onClick={() =>
                            begin({
                              kind: "campaign_update",
                              campaignId: current.campaign.id,
                              name: current.campaign.name,
                              status:
                                current.campaign.status === "ENABLED"
                                  ? "ENABLED"
                                  : "PAUSED",
                              dailyBudget:
                                Number(
                                  current.campaignBudget.amountMicros ?? 0
                                ) / 1e6,
                            })
                          }
                        >
                          Edit name, status & budget
                        </Button>
                        {current.campaign.advertisingChannelType ===
                          "PERFORMANCE_MAX" && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              begin(
                                {
                                  kind: "asset_group_create",
                                  campaignId,
                                  name: "",
                                  finalUrl: "",
                                  assets: [],
                                },
                                "creative"
                              )
                            }
                          >
                            New asset group
                          </Button>
                        )}
                        {detail.data?.groups.map(r => {
                          const group = r.assetGroup ?? r.adGroup,
                            pmax = !!r.assetGroup;
                          return (
                            <div className="google-group" key={group.id}>
                              <strong>{group.name}</strong>
                              <p>
                                {label(group.status ?? "UNKNOWN")}
                                {group.adStrength
                                  ? ` · ${label(group.adStrength)} ad strength`
                                  : ""}
                              </p>
                              {pmax && (
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    begin(
                                      {
                                        kind: "asset_group_update",
                                        campaignId,
                                        assetGroupId: String(group.id),
                                        name: group.name,
                                        status:
                                          group.status === "ENABLED"
                                            ? "ENABLED"
                                            : "PAUSED",
                                        finalUrl: group.finalUrls?.[0] ?? "",
                                      },
                                      "creative"
                                    )
                                  }
                                >
                                  Edit group settings
                                </Button>
                              )}
                              {pmax ? (
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    begin(
                                      {
                                        kind: "asset_group_assets",
                                        campaignId,
                                        assetGroupId: String(group.id),
                                        add: [],
                                        remove: [],
                                      },
                                      "format"
                                    )
                                  }
                                >
                                  Add images, videos & text
                                </Button>
                              ) : (
                                ["SEARCH", "DISPLAY", "DEMAND_GEN"].includes(
                                  current.campaign.advertisingChannelType
                                ) && (
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      begin(
                                        {
                                          kind: "ad_create",
                                          campaignId,
                                          adGroupId: String(group.id),
                                          type: current.campaign
                                            .advertisingChannelType as
                                            "SEARCH" | "DISPLAY" | "DEMAND_GEN",
                                          ad: {
                                            ...emptyAd(),
                                            name: group.name,
                                          },
                                        },
                                        "format"
                                      )
                                    }
                                  >
                                    Add an ad
                                  </Button>
                                )
                              )}
                              {detail.data.ads
                                .filter(
                                  a => String(a.adGroup.id) === String(group.id)
                                )
                                .map(a => (
                                  <p key={a.adGroupAd.resourceName}>
                                    {a.adGroupAd.ad.name ||
                                      `Ad ${a.adGroupAd.ad.id}`}{" "}
                                    · {label(a.adGroupAd.status)} ·{" "}
                                    {label(
                                      a.adGroupAd.policySummary
                                        ?.approvalStatus ?? "Not reviewed"
                                    )}
                                  </p>
                                ))}
                            </div>
                          );
                        })}
                        {current.campaign.advertisingChannelType ===
                          "VIDEO" && (
                          <p>
                            Video campaign setup varies by subtype. Use Google
                            Ads for creative changes to this campaign;
                            measurement remains available here.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {mode === "drafts" && (
                  <>
                    <h3>Saved changes</h3>
                    {drafts.error && <p role="alert">{drafts.error.message}</p>}
                    {drafts.data?.map(d => (
                      <button
                        className="google-draft"
                        key={d.id}
                        onClick={() => {
                          setPendingRestore(null);
                          setDraft(d);
                          setCheckAttempt(value => value + 1);
                          setChange(d.change);
                          setEditingSettings(
                            d.change.kind === "campaign_update"
                          );
                          setConfirmed(false);
                          setSection("review");
                          if (d.change.kind !== "campaign_create")
                            setCampaignId(d.change.campaignId);
                        }}
                      >
                        <strong>
                          {"name" in d.change
                            ? d.change.name
                            : label(d.change.kind)}
                        </strong>
                        <span>
                          {label(d.state)} · revision {d.revision}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {(list.data?.limited || detail.data?.limited) && (
                  <p>
                    Showing the first 1,000 items. Use Google Ads for the full
                    inventory.
                  </p>
                )}
              </>
            )}
            {["settings", "targeting", "options"].includes(section) &&
              !!connection && (
                <GoogleDeliverySettings
                  {...scope}
                  section={section}
                  change={change}
                  onChange={edit}
                  currency={connection.details.currency}
                  disabled={locked || busy}
                />
              )}
            {section === "format" && !!connection && hasAssets && (
              <fieldset disabled={locked || busy}>
                <p>
                  {current?.campaign.name}
                  {selectedGroup
                    ? ` · ${(selectedGroup.assetGroup ?? selectedGroup.adGroup).name}`
                    : ""}
                </p>
                <GoogleFormatPicker
                  type={creativeType}
                  includeText={!hasAd}
                  brandAssets={brandAssets}
                  value={activeFormat}
                  onChange={value => {
                    setFormat(value);
                    setSection("creative");
                  }}
                />
              </fieldset>
            )}
            {(section === "creative" || section === "copy") && !!connection && (
              <fieldset disabled={locked || busy}>
                {change.kind !== "campaign_create" && (
                  <p>
                    {current?.campaign.name}
                    {selectedGroup
                      ? ` · ${(selectedGroup.assetGroup ?? selectedGroup.adGroup).name}`
                      : ""}
                  </p>
                )}
                {"ad" in change && (
                  <AdEditor
                    {...scope}
                    part={section === "copy" ? "copy" : "creative"}
                    type={change.type}
                    format={activeFormat}
                    ad={change.ad}
                    onChange={ad => edit({ ...change, ad })}
                  />
                )}
                {(change.kind === "asset_group_assets" ||
                  change.kind === "asset_group_create") && (
                  <GooglePmaxAi
                    key={`${connectionId}:${campaignId}:${change.kind}:${"assetGroupId" in change ? change.assetGroupId : "new"}`}
                    organizationId={organizationId}
                    onAdd={asset => {
                      const list =
                        change.kind === "asset_group_assets"
                          ? change.add
                          : change.assets;
                      if (
                        list.some(
                          a => JSON.stringify(a) === JSON.stringify(asset)
                        )
                      )
                        return;
                      if (change.kind === "asset_group_assets")
                        edit({ ...change, add: [...list, asset] });
                      else edit({ ...change, assets: [...list, asset] });
                    }}
                  />
                )}
                {change.kind === "campaign_update" && (
                  <>
                    <h2>
                      {current?.campaign.advertisingChannelType ===
                      "PERFORMANCE_MAX"
                        ? "Choose an asset group"
                        : "Choose an ad group"}
                    </h2>
                    <p>
                      Choose where to add your creative, then browse EvokeLoop
                      Library, upload files, or reuse Google assets.
                    </p>
                    {detail.isFetching && <p role="status">Loading groups…</p>}
                    {detail.error && <p role="alert">{detail.error.message}</p>}
                    <div className="cfg-card-grid">
                      {current &&
                        detail.data?.groups.map(row => {
                          const group = row.assetGroup ?? row.adGroup;
                          return (
                            <StudioCard
                              key={group.id}
                              title={group.name}
                              description={label(group.status ?? "UNKNOWN")}
                              selected={false}
                              onSelect={() =>
                                begin(
                                  row.assetGroup
                                    ? {
                                        kind: "asset_group_assets",
                                        campaignId,
                                        assetGroupId: String(group.id),
                                        add: [],
                                        remove: [],
                                      }
                                    : {
                                        kind: "ad_create",
                                        campaignId,
                                        adGroupId: String(group.id),
                                        type: current.campaign
                                          .advertisingChannelType as
                                          "DISPLAY" | "DEMAND_GEN",
                                        ad: { ...emptyAd(), name: group.name },
                                      },
                                  "creative"
                                )
                              }
                            />
                          );
                        })}
                    </div>
                    {!detail.isFetching &&
                      current &&
                      !detail.data?.groups.length && (
                        <p>
                          No available groups. Choose another campaign or create
                          a group in Google Ads.
                        </p>
                      )}
                    {!current && (
                      <Button onClick={() => setSection("campaign")}>
                        Choose a compatible campaign
                      </Button>
                    )}
                  </>
                )}
                {(change.kind === "asset_group_create" ||
                  change.kind === "asset_group_update") && (
                  <>
                    <Field title="Asset group name">
                      <input
                        value={change.name}
                        onChange={e =>
                          edit({ ...change, name: e.target.value })
                        }
                      />
                    </Field>
                    <Field title="Landing page">
                      <input
                        type="url"
                        value={change.finalUrl}
                        onChange={e =>
                          edit({ ...change, finalUrl: e.target.value })
                        }
                      />
                    </Field>
                    {change.kind === "asset_group_update" && (
                      <Field title="Asset group status">
                        <select
                          value={change.status}
                          onChange={e =>
                            edit({
                              ...change,
                              status: e.target.value as "ENABLED" | "PAUSED",
                            })
                          }
                        >
                          <option value="ENABLED">Active</option>
                          <option value="PAUSED">Paused</option>
                        </select>
                      </Field>
                    )}
                    {change.kind === "asset_group_create" && (
                      <>
                        <p>
                          Add at least 3 headlines, 1 long headline, 2
                          descriptions, a landscape image and a square image.
                          Campaign brand assets are retained.
                        </p>
                        <AssetEditor
                          key={`${connectionId}:${campaignId}:${activeFormat}`}
                          format={activeFormat}
                          {...scope}
                          assets={change.assets}
                          brandAssets={
                            !current?.campaign.brandGuidelinesEnabled
                          }
                          onChange={assets => edit({ ...change, assets })}
                        />
                      </>
                    )}
                  </>
                )}
                {change.kind === "asset_group_assets" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setSection("format")}
                    >
                      Choose another asset type
                    </Button>
                    <AssetEditor
                      key={`${connectionId}:${campaignId}:${change.assetGroupId}:${activeFormat}`}
                      format={activeFormat}
                      {...scope}
                      assets={change.add}
                      brandAssets={!current?.campaign.brandGuidelinesEnabled}
                      onChange={add => edit({ ...change, add })}
                    />
                    <details className="google-existing-assets">
                      <summary>
                        Replace or remove existing assets (
                        {change.remove.length} selected)
                      </summary>
                      <h3>Current group assets</h3>
                      <p>
                        Select associations to unlink. To replace an asset,
                        select it here and add its replacement above. Shared
                        Google assets remain available in other groups.
                      </p>
                      <div className="google-current-assets">
                        {detail.data?.assets
                          .filter(
                            a => String(a.assetGroup.id) === change.assetGroupId
                          )
                          .map(a => {
                            const selected = change.remove.some(
                              r =>
                                r.assetId === String(a.asset.id) &&
                                r.field === a.assetGroupAsset.fieldType
                            );
                            return (
                              <label key={a.assetGroupAsset.resourceName}>
                                {a.asset.imageAsset?.fullSize?.url && (
                                  <img
                                    src={a.asset.imageAsset.fullSize.url}
                                    alt={a.asset.name || "Google asset"}
                                  />
                                )}
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={e =>
                                    edit({
                                      ...change,
                                      remove: e.target.checked
                                        ? [
                                            ...change.remove,
                                            {
                                              assetId: String(a.asset.id),
                                              field:
                                                a.assetGroupAsset.fieldType,
                                            },
                                          ]
                                        : change.remove.filter(
                                            r =>
                                              !(
                                                r.assetId ===
                                                  String(a.asset.id) &&
                                                r.field ===
                                                  a.assetGroupAsset.fieldType
                                              )
                                          ),
                                    })
                                  }
                                />
                                <span>
                                  {label(a.assetGroupAsset.fieldType)} ·{" "}
                                  {a.asset.textAsset?.text ||
                                    a.asset.name ||
                                    a.asset.id}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    </details>
                  </>
                )}
              </fieldset>
            )}
            {section === "review" && !!connection && (
              <>
                <h2>Review this change</h2>
                <p>
                  {connection?.name} · {connection?.accountId} ·{" "}
                  {connection?.details.currency} ·{" "}
                  {connection?.details.timezone}
                </p>
                <GoogleChangeSummary change={change} />
                <p>
                  Compatibility is checked automatically against this account’s
                  requirements. Publishing submits the reviewed change to
                  Google; approval and delivery are controlled by Google Ads.
                </p>
                {draft?.state === "published" ? (
                  <div role="status">
                    <strong>Google confirmed this change.</strong>
                    <p>{draft.result?.resources.length} resources confirmed.</p>
                    <Button
                      onClick={() => {
                        setSection("campaign");
                        setMode("existing");
                      }}
                    >
                      View campaigns
                    </Button>
                  </div>
                ) : locked ? (
                  <p role="status">
                    {draft?.state === "publishing"
                      ? "This change was submitted. Refresh its saved draft for the result. If confirmation remains unavailable, check Google Ads before creating another change."
                      : (draft?.error ??
                        "Check Google Ads before creating another change.")}
                  </p>
                ) : (
                  <>
                    <div className="google-actions">
                      <Button
                        variant="ghost"
                        disabled={
                          save.isPending ||
                          validate.isPending ||
                          publish.isPending
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              "Reset this Google setup on this device? Saved drafts, live campaigns and prompt defaults remain unchanged."
                            )
                          ) {
                            remembered.clear();
                            setChange(newCampaign());
                            setPendingRestore(null);
                            setDraft(null);
                            setConfirmed(false);
                            setCampaignId("");
                          }
                        }}
                      >
                        Reset setup
                      </Button>
                      {checkFailed && (
                        <Button
                          disabled={busy}
                          onClick={() => setCheckAttempt(value => value + 1)}
                        >
                          Retry check
                        </Button>
                      )}
                    </div>
                    <p role="status">
                      {checking
                        ? "Saving and checking compatibility with Google…"
                        : checkFailed
                          ? "Compatibility could not be confirmed. Check the issue below."
                          : draft?.state === "validated" && !dirty
                            ? "Compatibility checked. Ready for your review."
                            : "Your draft is saved and checked automatically when its required details are complete."}
                    </p>
                    {draft?.state === "validated" &&
                      !dirty &&
                      !checking &&
                      !checkFailed && (
                        <>
                          <p role="status">
                            Draft saved. Compatibility checks refresh
                            automatically.
                          </p>
                          <label>
                            <input
                              type="checkbox"
                              checked={confirmed}
                              onChange={e => setConfirmed(e.target.checked)}
                            />{" "}
                            I approve the settings, creative and budget shown
                            above.
                          </label>
                          <Button
                            disabled={
                              busy ||
                              !confirmed ||
                              !canPublish ||
                              !connections.data?.livePublishingEnabled
                            }
                            onClick={() => void deliver()}
                          >
                            {publish.isPending
                              ? "Publishing…"
                              : change.kind === "campaign_create"
                                ? "Publish campaign to Google Ads"
                                : "Publish reviewed changes"}
                          </Button>
                          {!connections.data?.livePublishingEnabled && (
                            <p>
                              Live advertising changes are disabled in this
                              environment. Drafts can still be saved and
                              validated.
                            </p>
                          )}
                          {!canPublish && (
                            <p>
                              A workspace publisher, admin or owner must approve
                              publishing.
                            </p>
                          )}
                        </>
                      )}
                  </>
                )}
              </>
            )}
            {fieldIssues.length > 0 && (
              <div role="alert">
                <h3>Required fields</h3>
                <ul>
                  {fieldIssues.map((issue, index) => (
                    <li key={index}>
                      <Button
                        variant="link"
                        onClick={() => goToIssue(issue.path)}
                      >
                        {issue.path
                          .join(" / ")
                          .replaceAll(
                            "ad / name",
                            creativeType === "PERFORMANCE_MAX"
                              ? "Asset group name"
                              : "Ad name"
                          )
                          .replaceAll("ad /", "Copy /") || "Campaign settings"}
                        : {issue.message}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <p className="google-error" role="alert">
                {error}
              </p>
            )}
            {!!connection &&
              !(section === "creative" && change.kind === "campaign_update") &&
              !["review", "campaign", "channel", "account"].includes(
                section
              ) && (
                <Button
                  onClick={() => {
                    setSection("review");
                    setConfirmed(false);
                  }}
                >
                  Review change →
                </Button>
              )}
          </section>
        </StudioJourney>
      </div>
    </div>
  );
}
