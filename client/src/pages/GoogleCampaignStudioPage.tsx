import { useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { ClipboardCheck, Images, Megaphone, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";
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
  googleAssetFieldSchema,
  type GoogleChange,
  type GoogleCampaignCreate,
  type GoogleAssetInput,
  type GoogleAdContent,
} from "@shared/googleCampaigns";
import type { GoogleCampaignDraft } from "../../../drizzle/channelSchema";
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
const label = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, c => c.toUpperCase());
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="google-field">
      <span>{title}</span>
      {children}
    </label>
  );
}
function ResourcePicker({
  organizationId,
  connectionId,
  kind,
  value,
  onChange,
  title,
}: {
  organizationId: number;
  connectionId: string;
  kind: "locations" | "languages" | "audiences" | "merchants";
  value: string[];
  onChange: (ids: string[]) => void;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const resources = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind, search },
    {
      enabled: !!connectionId && (kind !== "locations" || search.length >= 2),
      staleTime: 60000,
    }
  );
  const [names, setNames] = useState<Record<string, string>>({
    "1000": "English",
  });
  return (
    <div className="google-field">
      <span>{title}</span>
      {kind === "locations" && (
        <input
          aria-label="Search locations"
          placeholder="Search a country, city or region"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}
      <select
        aria-label={`Add ${title.toLowerCase()}`}
        value=""
        onChange={e => {
          const item = resources.data?.find(r => r.id === e.target.value);
          if (!item) return;
          setNames({ ...names, [item.id]: item.name });
          onChange(
            kind === "audiences" || kind === "merchants"
              ? [item.id]
              : Array.from(new Set([...value, item.id]))
          );
        }}
      >
        <option value="">
          {resources.isFetching ? "Loading…" : "Choose…"}
        </option>
        {resources.data
          ?.filter(r => !value.includes(r.id))
          .map(r => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.type}
            </option>
          ))}
      </select>
      <div className="google-chips">
        {value.map(id => (
          <button
            key={id}
            onClick={() => onChange(value.filter(v => v !== id))}
          >
            {names[id] ?? resources.data?.find(r => r.id === id)?.name ?? id} ×
          </button>
        ))}
      </div>
      {resources.error && <p role="alert">{resources.error.message}</p>}
    </div>
  );
}
function AssetEditor({
  organizationId,
  connectionId,
  assets,
  onChange,
  brandAssets = true,
  adType,
}: {
  organizationId: number;
  connectionId: string;
  assets: GoogleAssetInput[];
  onChange: (assets: GoogleAssetInput[]) => void;
  brandAssets?: boolean;
  adType?: string;
}) {
  const library = trpc.assetLibrary.list.useQuery({ organizationId });
  const remote = trpc.googleAds.campaigns.resources.useQuery(
    { organizationId, connectionId, kind: "assets" },
    { enabled: !!connectionId, staleTime: 60000 }
  );
  const [field, setField] =
      useState<GoogleAssetInput["field"]>("MARKETING_IMAGE"),
    [kind, setKind] = useState<GoogleAssetInput["source"]["kind"]>("library"),
    [value, setValue] = useState(
      new URLSearchParams(useSearch()).get("asset") ?? ""
    );
  const [error, setError] = useState("");
  const allowedAdFields: Record<string, string[]> = {
    DISPLAY: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "LOGO",
      "LANDSCAPE_LOGO",
    ],
    DEMAND_GEN: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
      "LOGO",
    ],
    APP: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
      "YOUTUBE_VIDEO",
    ],
    PERFORMANCE_MAX: [
      "MARKETING_IMAGE",
      "SQUARE_MARKETING_IMAGE",
      "PORTRAIT_MARKETING_IMAGE",
      "LOGO",
      "LANDSCAPE_LOGO",
      "YOUTUBE_VIDEO",
    ],
  };
  const fields = googleAssetFieldSchema.options.filter(
    f =>
      (!adType ||
        !allowedAdFields[adType] ||
        allowedAdFields[adType].includes(f)) &&
      (brandAssets || !["BUSINESS_NAME", "LOGO", "LANDSCAPE_LOGO"].includes(f))
  );
  const images =
    library.data?.filter(
      a => a.mediaType === "image" && a.state === "approved"
    ) ?? [];
  return (
    <div className="google-assets">
      <h3>Creative assets</h3>
      <p>
        Select approved workspace images, reuse Google assets, or add text and
        YouTube videos. Square and landscape placements need separate image
        sizes.
      </p>
      <div className="google-form-grid">
        <Field title="Placement">
          <select
            value={field}
            onChange={e => setField(e.target.value as typeof field)}
          >
            {fields.map(f => (
              <option key={f} value={f}>
                {label(f)}
              </option>
            ))}
          </select>
        </Field>
        <Field title="Asset source">
          <select
            value={kind}
            onChange={e => {
              setKind(e.target.value as typeof kind);
              setValue("");
            }}
          >
            {[
              ["library", "Approved library image"],
              ["existing", "Existing Google asset"],
              ["text", "New text"],
              ["youtube", "YouTube video"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field
          title={
            kind === "text"
              ? "Text"
              : kind === "youtube"
                ? "YouTube video ID"
                : "Asset"
          }
        >
          {kind === "text" || kind === "youtube" ? (
            <input
              value={value}
              maxLength={kind === "text" ? 90 : 11}
              onChange={e => setValue(e.target.value)}
            />
          ) : (
            <select value={value} onChange={e => setValue(e.target.value)}>
              <option value="">Choose an asset…</option>
              {kind === "library"
                ? images.map(a => (
                    <option key={a.key} value={a.key}>
                      {a.name} · {a.width ?? "?"} × {a.height ?? "?"}
                    </option>
                  ))
                : remote.data?.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.type}
                    </option>
                  ))}
            </select>
          )}
        </Field>
      </div>
      <Button
        variant="outline"
        disabled={!value}
        onClick={() => {
          const source =
            kind === "text"
              ? { kind, text: value }
              : kind === "library"
                ? { kind, key: value }
                : kind === "youtube"
                  ? { kind, videoId: value }
                  : { kind, id: value };
          const candidate = { field, source } as GoogleAssetInput;
          if (
            assets.some(a => JSON.stringify(a) === JSON.stringify(candidate))
          ) {
            setError("This asset is already selected for that placement.");
            return;
          }
          onChange([...assets, candidate]);
          setValue("");
          setError("");
        }}
      >
        Add asset
      </Button>
      {(error || library.error || remote.error) && (
        <p role="alert">
          {error || library.error?.message || remote.error?.message}
        </p>
      )}
      <ul className="google-asset-list">
        {assets.map((a, i) => (
          <li key={i}>
            <span>
              <strong>{label(a.field)}</strong> ·{" "}
              {a.source.kind === "text"
                ? a.source.text
                : a.source.kind === "library"
                  ? (images.find(
                      l => l.key === (a.source as { key: string }).key
                    )?.name ?? a.source.key)
                  : a.source.kind === "existing"
                    ? (remote.data?.find(
                        r => r.id === (a.source as { id: string }).id
                      )?.name ?? `Google asset ${a.source.id}`)
                    : a.source.videoId}
            </span>
            <button
              aria-label={`Remove selected asset ${i + 1}`}
              onClick={() => onChange(assets.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {kind === "library" && !images.length && (
        <p>
          <Link href="/app/library">
            Approve an image in your asset library
          </Link>{" "}
          to make it available here.
        </p>
      )}
    </div>
  );
}
function AdEditor({
  organizationId,
  connectionId,
  type,
  ad,
  onChange,
}: {
  organizationId: number;
  connectionId: string;
  type: string;
  ad: GoogleAdContent;
  onChange: (ad: GoogleAdContent) => void;
}) {
  const patch = (p: Partial<GoogleAdContent>) => onChange({ ...ad, ...p });
  return (
    <>
      <div className="google-form-grid">
        <Field
          title={type === "PERFORMANCE_MAX" ? "Asset group name" : "Ad name"}
        >
          <input
            value={ad.name}
            onChange={e => patch({ name: e.target.value })}
          />
        </Field>
        {!["SHOPPING", "APP"].includes(type) && (
          <Field title="Landing page">
            <input
              type="url"
              value={ad.finalUrl}
              placeholder="https://"
              onChange={e => patch({ finalUrl: e.target.value })}
            />
          </Field>
        )}
      </div>
      {type !== "SHOPPING" && (
        <>
          <Field title="Headlines · one per line · 30 characters each">
            <textarea
              rows={4}
              value={ad.headlines.join("\n")}
              onChange={e => patch({ headlines: e.target.value.split("\n") })}
            />
          </Field>
          <Field title="Descriptions · one per line · 90 characters each">
            <textarea
              rows={3}
              value={ad.descriptions.join("\n")}
              onChange={e =>
                patch({ descriptions: e.target.value.split("\n") })
              }
            />
          </Field>
        </>
      )}
      {["DISPLAY", "PERFORMANCE_MAX"].includes(type) && (
        <Field title="Long headline · up to 90 characters">
          <input
            maxLength={90}
            value={ad.longHeadline ?? ""}
            onChange={e => patch({ longHeadline: e.target.value })}
          />
        </Field>
      )}
      {["DISPLAY", "PERFORMANCE_MAX", "DEMAND_GEN"].includes(type) && (
        <Field title="Business name · up to 25 characters">
          <input
            maxLength={25}
            value={ad.businessName ?? ""}
            onChange={e => patch({ businessName: e.target.value })}
          />
        </Field>
      )}
      {type === "SEARCH" && (
        <div className="google-form-grid">
          <Field title="Display path 1">
            <input
              maxLength={15}
              value={ad.path1}
              onChange={e => patch({ path1: e.target.value })}
            />
          </Field>
          <Field title="Display path 2">
            <input
              maxLength={15}
              value={ad.path2}
              onChange={e => patch({ path2: e.target.value })}
            />
          </Field>
        </div>
      )}
      {!["SEARCH", "SHOPPING"].includes(type) && (
        <AssetEditor
          organizationId={organizationId}
          connectionId={connectionId}
          adType={type}
          assets={ad.assets}
          onChange={assets => patch({ assets })}
        />
      )}
    </>
  );
}
function GoogleCampaignStudio({ organizationId }: { organizationId: number }) {
  const { membership } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const connections = trpc.googleAds.connections.useQuery({ organizationId });
  const available =
    connections.data?.items.filter(c => c.status === "connected") ?? [];
  const [chosen, setChosen] = useState(params.get("connectionId") ?? "");
  const connection = available.find(c => c.id === chosen) ?? available[0],
    connectionId = connection?.id ?? "";
  const scope = { organizationId, connectionId };
  const [section, setSection] = useState("campaign"),
    [mode, setMode] = useState<"existing" | "new" | "drafts">(
      params.has("asset") ? "new" : "existing"
    );
  const [includeInactive, setIncludeInactive] = useState(false),
    [campaignId, setCampaignId] = useState("");
  const [change, setChange] = useState<GoogleChange>(newCampaign),
    [draft, setDraft] = useState<GoogleCampaignDraft | null>(null),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
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
  const save = trpc.googleAds.campaigns.save.useMutation(),
    validate = trpc.googleAds.campaigns.validate.useMutation(),
    publish = trpc.googleAds.campaigns.publish.useMutation();
  const busy = save.isPending || validate.isPending || publish.isPending;
  const current = detail.data?.campaigns[0];
  const locked =
    !!draft && ["publishing", "published", "uncertain"].includes(draft.state);
  const dirty =
    !draft || JSON.stringify(draft.change) !== JSON.stringify(change);
  const canPublish = ["owner", "admin", "publisher"].includes(
    membership?.role ?? ""
  );
  const edit = (next: GoogleChange) => {
    setChange(next);
    setConfirmed(false);
    setError("");
  };
  const begin = (next: GoogleChange, target = "settings") => {
    edit(next);
    setDraft(null);
    setSection(target);
  };
  const patch = (p: Partial<GoogleCampaignCreate>) => {
    if (change.kind === "campaign_create") edit({ ...change, ...p });
  };
  const journey = useStudioJourney({
    scopeKey: `google:${organizationId}:${connectionId}`,
    section,
    category: section,
    onNavigate: s => setSection(s),
    sections: [
      {
        id: "campaign",
        title: "Campaign",
        subtitle: "New or existing",
        icon: Megaphone,
        categories: [
          {
            id: "campaign",
            title: "Campaign",
            value: mode === "new" ? "New campaign" : "Account campaigns",
          },
        ],
      },
      {
        id: "settings",
        title: "Delivery",
        subtitle: "Budget & targeting",
        icon: Settings2,
        categories: [
          {
            id: "settings",
            title: "Delivery",
            value: "Account currency & timezone",
          },
        ],
      },
      {
        id: "creative",
        title: "Creative",
        subtitle: "Ads & asset groups",
        icon: Images,
        categories: [
          {
            id: "creative",
            title: "Creative",
            value: "Text and approved assets",
          },
        ],
      },
      {
        id: "review",
        title: "Review",
        subtitle: "Validate & publish",
        icon: ClipboardCheck,
        categories: [
          {
            id: "review",
            title: "Review",
            value: draft?.state ?? "Unsaved draft",
          },
        ],
      },
    ],
  });
  async function saveDraft() {
    const parsed = googleChangeSchema.safeParse(change);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map(i => `${i.path.join(" · ")}: ${i.message}`)
          .slice(0, 8)
          .join("\n")
      );
      return null;
    }
    try {
      const row = await save.mutateAsync({
        ...scope,
        ...(draft ? { id: draft.id, revision: draft.revision } : {}),
        change: parsed.data,
      });
      setDraft(row);
      setChange(row.change);
      setConfirmed(false);
      setError("");
      void drafts.refetch();
      return row;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
      return null;
    }
  }
  async function checkDraft() {
    const row = dirty ? await saveDraft() : draft;
    if (!row) return;
    try {
      const result = await validate.mutateAsync({
        organizationId,
        id: row.id,
        revision: row.revision,
      });
      setDraft(result);
      setError("");
      setConfirmed(false);
      toast.success(
        "Google validated this change. Review it before publishing."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed.");
    }
  }
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
  return (
    <div className="configurator-page google-campaign-studio">
      <header className="cfg-header">
        <Link href="/app/activate/studio" className="cfg-back">
          ← Activation Studio
        </Link>
        <h1>
          <PartnerLogo slug="googleads" name="Google Ads" size={32} /> Google
          Ads Studio
        </h1>
        <p>Build campaigns, manage existing ads and review every change.</p>
      </header>
      <div className="google-account-bar">
        <Field title="Google Ads account">
          <select
            value={connectionId}
            onChange={e => {
              setChosen(e.target.value);
              setCampaignId("");
              setDraft(null);
              setChange(newCampaign());
              setSection("campaign");
              setConfirmed(false);
            }}
          >
            <option value="">Choose an account…</option>
            {available.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.accountId}
              </option>
            ))}
          </select>
        </Field>
        {connection && (
          <p>
            {connection.details.currency} · {connection.details.timezone}
          </p>
        )}
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
      {connections.isLoading && <p role="status">Loading accounts…</p>}
      {connections.error && <p role="alert">{connections.error.message}</p>}
      {!connections.isLoading && !available.length && (
        <p>
          <Link href="/app/integrations">Connect a Google Ads account</Link> to
          get started.
        </p>
      )}
      {!!connectionId && (
        <div className="cfg-workspace">
          <StudioSummary subtitle="Campaign preview">
            <div className="cfg-stage google-preview">
              <PartnerLogo slug="googleads" name="Google Ads" size={56} />
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
              {"dailyBudget" in change && (
                <p>
                  {change.dailyBudget.toLocaleString()}{" "}
                  {connection?.details.currency} / day · {label(change.status)}
                </p>
              )}
              {"ad" in change && (
                <>
                  <h3>{change.ad.headlines[0] || "Your headline"}</h3>
                  <p>{change.ad.descriptions[0] || "Your description"}</p>
                  <small>{change.ad.finalUrl}</small>
                </>
              )}
              <p>
                {draft
                  ? `Saved revision ${draft.revision} · ${label(draft.state)}`
                  : "Draft · no changes published"}
              </p>
            </div>
          </StudioSummary>
          <StudioJourney journey={journey} label="Google campaign sections">
            <section className="cfg-body google-fields">
              {section === "campaign" && (
                <>
                  <div className="google-mode-tabs">
                    {(["existing", "new", "drafts"] as const).map(m => (
                      <Button
                        variant={mode === m ? "default" : "outline"}
                        key={m}
                        onClick={() => {
                          setMode(m);
                          if (m === "new") begin(newCampaign(), "campaign");
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
                      {Object.entries(googleCampaignTypes).map(
                        ([type, info]) => (
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
                        )
                      )}
                    </div>
                  )}
                  {mode === "existing" && (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={includeInactive}
                          onChange={e => setIncludeInactive(e.target.checked)}
                        />{" "}
                        Include inactive campaigns
                      </label>
                      {list.isLoading && (
                        <p role="status">Loading campaigns…</p>
                      )}
                      {list.error && (
                        <p role="alert">
                          {list.error.message}
                          <Button onClick={() => void list.refetch()}>
                            Retry
                          </Button>
                        </p>
                      )}
                      <div className="google-campaign-list">
                        {list.data?.campaigns.map(r => (
                          <button
                            key={r.campaign.id}
                            className={
                              campaignId === r.campaign.id ? "is-selected" : ""
                            }
                            onClick={() => setCampaignId(r.campaign.id)}
                          >
                            <strong>{r.campaign.name}</strong>
                            <span>
                              {label(r.campaign.advertisingChannelType)} ·{" "}
                              {label(r.campaign.status)} ·{" "}
                              {Number(r.campaignBudget.amountMicros ?? 0) / 1e6}{" "}
                              {list.data.currency}/day
                            </span>
                          </button>
                        ))}
                      </div>
                      {list.data && !list.data.campaigns.length && (
                        <p>
                          No {includeInactive ? "available" : "active"}{" "}
                          campaigns. Include inactive campaigns or create a new
                          one.
                        </p>
                      )}
                      {detail.isFetching && campaignId && (
                        <p role="status">Loading campaign details…</p>
                      )}
                      {detail.error && (
                        <p role="alert">{detail.error.message}</p>
                      )}
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
                                        "creative"
                                      )
                                    }
                                  >
                                    Manage group assets
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
                                              | "SEARCH"
                                              | "DISPLAY"
                                              | "DEMAND_GEN",
                                            ad: {
                                              ...emptyAd(),
                                              name: group.name,
                                            },
                                          },
                                          "creative"
                                        )
                                      }
                                    >
                                      Add an ad
                                    </Button>
                                  )
                                )}
                                {detail.data.ads
                                  .filter(
                                    a =>
                                      String(a.adGroup.id) === String(group.id)
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
                      {drafts.error && (
                        <p role="alert">{drafts.error.message}</p>
                      )}
                      {drafts.data?.map(d => (
                        <button
                          className="google-draft"
                          key={d.id}
                          onClick={() => {
                            setDraft(d);
                            setChange(d.change);
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
              {section === "settings" && (
                <fieldset disabled={locked || busy}>
                  {change.kind === "campaign_create" ||
                  change.kind === "campaign_update" ? (
                    <>
                      <div className="google-form-grid">
                        <Field title="Campaign name">
                          <input
                            value={change.name}
                            onChange={e =>
                              edit({ ...change, name: e.target.value })
                            }
                          />
                        </Field>
                        <Field
                          title={`Daily budget · ${connection?.details.currency ?? "account currency"}`}
                        >
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={change.dailyBudget || ""}
                            onChange={e =>
                              edit({
                                ...change,
                                dailyBudget: Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field title="Launch status">
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
                      </div>
                      <p>
                        An active campaign may start spending when Google
                        approves its ads. The daily budget is an average; Google
                        may spend more on individual days.
                      </p>
                    </>
                  ) : (
                    <p>
                      This change uses the existing campaign budget and
                      targeting.
                    </p>
                  )}
                  {change.kind === "campaign_create" && (
                    <>
                      <div className="google-form-grid">
                        <Field title="Bidding strategy">
                          <select
                            value={change.bidding.strategy}
                            onChange={e =>
                              patch({
                                bidding: {
                                  strategy: e.target
                                    .value as GoogleCampaignCreate["bidding"]["strategy"],
                                },
                              })
                            }
                          >
                            {{
                              SEARCH: [
                                "MAXIMIZE_CONVERSIONS",
                                "MAXIMIZE_CONVERSION_VALUE",
                                "MAXIMIZE_CLICKS",
                                "TARGET_CPA",
                                "TARGET_ROAS",
                                "MANUAL_CPC",
                              ],
                              PERFORMANCE_MAX: [
                                "MAXIMIZE_CONVERSIONS",
                                "MAXIMIZE_CONVERSION_VALUE",
                              ],
                              DISPLAY: [
                                "MAXIMIZE_CONVERSIONS",
                                "TARGET_CPA",
                                "TARGET_ROAS",
                                "MANUAL_CPC",
                              ],
                              SHOPPING: [
                                "MANUAL_CPC",
                                "MAXIMIZE_CLICKS",
                                "TARGET_ROAS",
                              ],
                              DEMAND_GEN: [
                                "MAXIMIZE_CONVERSIONS",
                                "MAXIMIZE_CLICKS",
                                "TARGET_CPA",
                                "TARGET_ROAS",
                              ],
                              APP: ["MAXIMIZE_CONVERSIONS", "TARGET_CPA"],
                            }[change.type].map(s => (
                              <option key={s} value={s}>
                                {label(s)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field
                          title={
                            change.bidding.strategy.includes("ROAS") ||
                            change.bidding.strategy.includes("VALUE")
                              ? "Target ROAS · multiple, e.g. 4 = 400%"
                              : "Bid target · account currency"
                          }
                        >
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={change.bidding.target ?? ""}
                            onChange={e =>
                              patch({
                                bidding: {
                                  ...change.bidding,
                                  target: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field title="Start date · optional">
                          <input
                            type="date"
                            value={change.startDate ?? ""}
                            onChange={e =>
                              patch({ startDate: e.target.value || undefined })
                            }
                          />
                        </Field>
                        <Field title="End date · optional">
                          <input
                            type="date"
                            value={change.endDate ?? ""}
                            onChange={e =>
                              patch({ endDate: e.target.value || undefined })
                            }
                          />
                        </Field>
                      </div>
                      <ResourcePicker
                        {...scope}
                        kind="locations"
                        title="Locations"
                        value={change.locationIds}
                        onChange={locationIds => patch({ locationIds })}
                      />
                      <ResourcePicker
                        {...scope}
                        kind="languages"
                        title="Languages"
                        value={change.languageIds}
                        onChange={languageIds => patch({ languageIds })}
                      />
                      <Field title="EU political advertising declaration">
                        <select
                          value={change.politicalAdvertising}
                          onChange={e =>
                            patch({
                              politicalAdvertising: e.target
                                .value as GoogleCampaignCreate["politicalAdvertising"],
                            })
                          }
                        >
                          <option value="DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING">
                            Does not contain EU political advertising
                          </option>
                          <option value="CONTAINS_EU_POLITICAL_ADVERTISING">
                            Contains EU political advertising
                          </option>
                        </select>
                      </Field>
                      {change.type === "SEARCH" && (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={change.searchPartners}
                              onChange={e =>
                                patch({ searchPartners: e.target.checked })
                              }
                            />{" "}
                            Search partners
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={change.displayExpansion}
                              onChange={e =>
                                patch({ displayExpansion: e.target.checked })
                              }
                            />{" "}
                            Display expansion
                          </label>
                          <Field title="Keyword match type">
                            <select
                              value={
                                change.keywords.find(k => !k.negative)?.match ??
                                "EXACT"
                              }
                              onChange={e =>
                                patch({
                                  keywords: change.keywords.map(k =>
                                    k.negative
                                      ? k
                                      : {
                                          ...k,
                                          match: e.target.value as
                                            | "EXACT"
                                            | "PHRASE"
                                            | "BROAD",
                                        }
                                  ),
                                })
                              }
                            >
                              <option value="EXACT">Exact</option>
                              <option value="PHRASE">Phrase</option>
                              <option value="BROAD">Broad</option>
                            </select>
                          </Field>
                          <Field title="Keywords · one per line">
                            <textarea
                              rows={4}
                              value={change.keywords
                                .filter(k => !k.negative)
                                .map(k => k.text)
                                .join("\n")}
                              onChange={e =>
                                patch({
                                  keywords: [
                                    ...change.keywords.filter(k => k.negative),
                                    ...e.target.value.split("\n").map(text => ({
                                      text,
                                      match:
                                        change.keywords.find(k => !k.negative)
                                          ?.match ?? ("EXACT" as const),
                                      negative: false,
                                    })),
                                  ],
                                })
                              }
                            />
                          </Field>
                          <Field title="Negative keywords · one per line">
                            <textarea
                              rows={2}
                              value={change.keywords
                                .filter(k => k.negative)
                                .map(k => k.text)
                                .join("\n")}
                              onChange={e =>
                                patch({
                                  keywords: [
                                    ...change.keywords.filter(k => !k.negative),
                                    ...e.target.value
                                      .split("\n")
                                      .filter(Boolean)
                                      .map(text => ({
                                        text,
                                        match: "PHRASE" as const,
                                        negative: true,
                                      })),
                                  ],
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                      {change.type === "PERFORMANCE_MAX" && (
                        <label>
                          <input
                            type="checkbox"
                            checked={change.urlExpansion}
                            onChange={e =>
                              patch({ urlExpansion: e.target.checked })
                            }
                          />{" "}
                          Let Google expand final URLs
                        </label>
                      )}
                      {["SHOPPING", "PERFORMANCE_MAX"].includes(
                        change.type
                      ) && (
                        <>
                          <p>
                            {change.type === "PERFORMANCE_MAX"
                              ? "Optional product feed for retail campaigns"
                              : "Shopping product feed"}
                          </p>
                          <ResourcePicker
                            {...scope}
                            kind="merchants"
                            title="Merchant Center account"
                            value={change.merchantId ? [change.merchantId] : []}
                            onChange={v => patch({ merchantId: v[0] })}
                          />
                          <Field title="Feed label">
                            <input
                              value={change.feedLabel ?? ""}
                              onChange={e =>
                                patch({ feedLabel: e.target.value })
                              }
                            />
                          </Field>
                          <p>
                            This setup includes all products in the selected
                            feed.
                          </p>
                        </>
                      )}
                      {change.type === "DEMAND_GEN" && (
                        <>
                          <ResourcePicker
                            {...scope}
                            kind="audiences"
                            title="Audience"
                            value={change.audienceId ? [change.audienceId] : []}
                            onChange={v => patch({ audienceId: v[0] })}
                          />
                          <Field title="Demand Gen surfaces">
                            <select
                              value={
                                change.demandChannels?.length === 1 &&
                                change.demandChannels[0] === "youtubeShorts"
                                  ? "shorts"
                                  : change.demandChannels?.includes(
                                        "display"
                                      ) === false
                                    ? "owned"
                                    : "all"
                              }
                              onChange={e =>
                                patch({
                                  demandChannels:
                                    e.target.value === "shorts"
                                      ? ["youtubeShorts"]
                                      : e.target.value === "owned"
                                        ? [
                                            "youtubeInStream",
                                            "youtubeInFeed",
                                            "youtubeShorts",
                                            "discover",
                                            "gmail",
                                            "maps",
                                          ]
                                        : undefined,
                                })
                              }
                            >
                              <option value="all">
                                All supported channels
                              </option>
                              <option value="owned">
                                Google owned channels
                              </option>
                              <option value="shorts">YouTube Shorts</option>
                            </select>
                          </Field>
                        </>
                      )}
                      {change.type === "APP" && (
                        <>
                          <Field title="App ID">
                            <input
                              value={change.appId ?? ""}
                              onChange={e => patch({ appId: e.target.value })}
                            />
                          </Field>
                          <Field title="App store">
                            <select
                              value={change.appStore ?? ""}
                              onChange={e =>
                                patch({
                                  appStore: e.target
                                    .value as GoogleCampaignCreate["appStore"],
                                })
                              }
                            >
                              <option value="">Choose…</option>
                              <option value="GOOGLE_APP_STORE">
                                Google Play
                              </option>
                              <option value="APPLE_APP_STORE">
                                Apple App Store
                              </option>
                            </select>
                          </Field>
                        </>
                      )}
                    </>
                  )}
                </fieldset>
              )}
              {section === "creative" && (
                <fieldset disabled={locked || busy}>
                  {"ad" in change && (
                    <AdEditor
                      {...scope}
                      type={change.type}
                      ad={change.ad}
                      onChange={ad => edit({ ...change, ad })}
                    />
                  )}
                  {change.kind === "campaign_update" && (
                    <p>
                      Choose an existing ad group or asset group in Campaign to
                      manage its creative.
                    </p>
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
                      <h3>Current group assets</h3>
                      <p>
                        Select associations to unlink. To replace an asset,
                        select it here and add its replacement below. Shared
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
                      <AssetEditor
                        {...scope}
                        assets={change.add}
                        brandAssets={!current?.campaign.brandGuidelinesEnabled}
                        onChange={add => edit({ ...change, add })}
                      />
                    </>
                  )}
                </fieldset>
              )}
              {section === "review" && (
                <>
                  <h2>Review this change</h2>
                  <p>
                    {connection?.name} · {connection?.accountId} ·{" "}
                    {connection?.details.currency} ·{" "}
                    {connection?.details.timezone}
                  </p>
                  <GoogleChangeSummary change={change} />
                  <p>
                    Google validation checks this account’s current
                    requirements. Publishing submits the reviewed change to
                    Google; approval and delivery are controlled by Google Ads.
                  </p>
                  {draft?.state === "published" ? (
                    <div role="status">
                      <strong>Google confirmed this change.</strong>
                      <p>
                        {draft.result?.resources.length} resources confirmed.
                      </p>
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
                          variant="outline"
                          disabled={busy}
                          onClick={() => void saveDraft()}
                        >
                          Save draft
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => void checkDraft()}
                        >
                          {validate.isPending
                            ? "Validating…"
                            : "Validate with Google"}
                        </Button>
                      </div>
                      {draft?.state === "validated" && !dirty && (
                        <>
                          <p role="status">
                            Validated · revision {draft.revision}. Review
                            expires after 15 minutes.
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
              {error && (
                <p className="google-error" role="alert">
                  {error}
                </p>
              )}
              {section !== "review" && section !== "campaign" && (
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
      )}
    </div>
  );
}
function GoogleChangeSummary({ change }: { change: GoogleChange }) {
  return (
    <div className="google-review">
      <dl>
        <dt>Change</dt>
        <dd>{label(change.kind)}</dd>
        {"name" in change && (
          <>
            <dt>Name</dt>
            <dd>{change.name || "Missing"}</dd>
          </>
        )}
        {"campaignId" in change && (
          <>
            <dt>Campaign</dt>
            <dd>{change.campaignId}</dd>
          </>
        )}
        {"dailyBudget" in change && (
          <>
            <dt>Average daily budget</dt>
            <dd>{change.dailyBudget}</dd>
            <dt>Status</dt>
            <dd>{label(change.status)}</dd>
          </>
        )}
        {change.kind === "campaign_create" && (
          <>
            <dt>Campaign type</dt>
            <dd>{googleCampaignTypes[change.type].label}</dd>
            <dt>Bidding</dt>
            <dd>
              {label(change.bidding.strategy)}
              {change.bidding.target
                ? ` · target ${change.bidding.target}`
                : ""}
            </dd>
            <dt>Dates</dt>
            <dd>
              {change.startDate || "Starts immediately"} →{" "}
              {change.endDate || "No end date"}
            </dd>
            <dt>Location IDs</dt>
            <dd>{change.locationIds.join(", ") || "Missing"}</dd>
            <dt>Language IDs</dt>
            <dd>{change.languageIds.join(", ")}</dd>
            <dt>EU political advertising</dt>
            <dd>
              {change.politicalAdvertising.startsWith("DOES_NOT")
                ? "Does not contain"
                : "Contains"}
            </dd>
            {change.type === "SEARCH" && (
              <>
                <dt>Networks</dt>
                <dd>
                  Google Search
                  {change.searchPartners ? ", search partners" : ""}
                  {change.displayExpansion ? ", Display expansion" : ""}
                </dd>
                <dt>Keywords</dt>
                <dd>
                  {change.keywords
                    .map(
                      k =>
                        `${k.negative ? "Exclude " : ""}${k.text} (${label(k.match)})`
                    )
                    .join("; ")}
                </dd>
              </>
            )}
            {change.type === "PERFORMANCE_MAX" && (
              <>
                <dt>Final URL expansion</dt>
                <dd>{change.urlExpansion ? "Enabled" : "Disabled"}</dd>
              </>
            )}
            {change.merchantId && (
              <>
                <dt>Merchant Center / feed</dt>
                <dd>
                  {change.merchantId} / {change.feedLabel}
                </dd>
              </>
            )}
            {change.appId && (
              <>
                <dt>App</dt>
                <dd>
                  {change.appId} · {change.appStore}
                </dd>
              </>
            )}
            {change.audienceId && (
              <>
                <dt>Audience</dt>
                <dd>{change.audienceId}</dd>
                <dt>Surfaces</dt>
                <dd>
                  {change.demandChannels?.join(", ") ??
                    "All supported channels"}
                </dd>
              </>
            )}
          </>
        )}
        {"adGroupId" in change && (
          <>
            <dt>Ad group</dt>
            <dd>{change.adGroupId}</dd>
          </>
        )}
        {"assetGroupId" in change && (
          <>
            <dt>Asset group</dt>
            <dd>{change.assetGroupId}</dd>
          </>
        )}
        {change.kind === "asset_group_update" && (
          <>
            <dt>Status</dt>
            <dd>{label(change.status)}</dd>
          </>
        )}
        {"finalUrl" in change && (
          <>
            <dt>Landing page</dt>
            <dd>{change.finalUrl}</dd>
          </>
        )}
      </dl>
      {"ad" in change && (
        <>
          <h3>{change.ad.name}</h3>
          <p>{change.ad.finalUrl}</p>
          <ul>
            {[
              ...change.ad.headlines,
              ...change.ad.descriptions,
              change.ad.longHeadline,
              change.ad.businessName,
            ]
              .filter(Boolean)
              .map((t, i) => (
                <li key={i}>{t}</li>
              ))}
          </ul>
        </>
      )}
      {("ad" in change
        ? change.ad.assets
        : change.kind === "asset_group_create"
          ? change.assets
          : change.kind === "asset_group_assets"
            ? change.add
            : []
      ).map((a, i) => (
        <p key={i}>
          Add {label(a.field)}:{" "}
          {a.source.kind === "text"
            ? a.source.text
            : a.source.kind === "library"
              ? a.source.key
              : a.source.kind === "existing"
                ? `Google asset ${a.source.id}`
                : `YouTube ${a.source.videoId}`}
        </p>
      ))}
      {change.kind === "asset_group_assets" &&
        change.remove.map((r, i) => (
          <p key={i}>
            Unlink {label(r.field)}: Google asset {r.assetId}
          </p>
        ))}
    </div>
  );
}
export default function GoogleCampaignStudioPage() {
  const { organizationId } = useWorkspace();
  return (
    <WorkspaceGate>
      {organizationId && (
        <GoogleCampaignStudio
          key={organizationId}
          organizationId={organizationId}
        />
      )}
    </WorkspaceGate>
  );
}
