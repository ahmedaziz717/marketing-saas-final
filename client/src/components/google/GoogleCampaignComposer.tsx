import { AdEditor, AssetEditor } from "./GoogleAdEditor";
import { Field, label } from "./GoogleCampaignFields";
import { GoogleDeliverySettings } from "./GoogleDeliverySettings";
import { GoogleChangeSummary } from "./GoogleChangeSummary";
import { useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { ClipboardCheck, Images, Radio, Settings2, Type } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
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
  const hasAd = "ad" in change;
  const journey = useStudioJourney({
    scopeKey: `google:${organizationId}:${connectionId}`,
    section: ["channel", "account", "campaign"].includes(section)
      ? "setup"
      : ["settings", "targeting", "options"].includes(section)
        ? "delivery"
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
          {
            id: "creative",
            title:
              hasAd && change.type === "PERFORMANCE_MAX"
                ? "Asset group"
                : "Creative",
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
      {
        id: "review",
        title: "Review & activate",
        subtitle: "Validate & publish",
        icon: ClipboardCheck,
        categories: [
          {
            id: "review",
            title: "Review change",
            value: draft?.state ?? "Unsaved draft",
            disabled: !connection,
            reason: "Choose an account first",
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
                <div className="cfg-card-grid">
                  {available.map(c => (
                    <StudioCard
                      key={c.id}
                      title={c.name}
                      description={`${c.accountId} · ${c.details.currency} · ${c.details.timezone}`}
                      badge="Google Ads"
                      selected={c.id === connectionId}
                      disabled={busy}
                      onSelect={() => {
                        if (c.id !== connectionId) {
                          setChosen(c.id);
                          setCampaignId("");
                          setDraft(null);
                          setChange(newCampaign());
                          setConfirmed(false);
                          setError("");
                        }
                        setSection("campaign");
                      }}
                    />
                  ))}
                </div>
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
                        No {includeInactive ? "available" : "active"} campaigns.
                        Include inactive campaigns or create a new one.
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
            {(section === "creative" || section === "copy") && !!connection && (
              <fieldset disabled={locked || busy}>
                {"ad" in change && (
                  <AdEditor
                    {...scope}
                    part={section === "copy" ? "copy" : "creative"}
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
                      Select associations to unlink. To replace an asset, select
                      it here and add its replacement below. Shared Google
                      assets remain available in other groups.
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
                                            field: a.assetGroupAsset.fieldType,
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
                  Google validation checks this account’s current requirements.
                  Publishing submits the reviewed change to Google; approval and
                  delivery are controlled by Google Ads.
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
                        variant="outline"
                        disabled={busy}
                        onClick={() => void saveDraft()}
                      >
                        Save draft
                      </Button>
                      <Button disabled={busy} onClick={() => void checkDraft()}>
                        {validate.isPending
                          ? "Validating…"
                          : "Validate with Google"}
                      </Button>
                    </div>
                    {draft?.state === "validated" && !dirty && (
                      <>
                        <p role="status">
                          Validated · revision {draft.revision}. Review expires
                          after 15 minutes.
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
            {!!connection &&
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
