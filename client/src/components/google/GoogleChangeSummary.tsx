import {
  googleCampaignTypes,
  type GoogleChange,
} from "@shared/googleCampaigns";
import { label } from "./GoogleCampaignFields";

export function GoogleChangeSummary({ change }: { change: GoogleChange }) {
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
