import { trpc } from "@/lib/trpc";
import { Field, ResourcePicker } from "./GoogleCampaignFields";

export function GoogleMerchantFeedPicker({
  organizationId,
  connectionId,
  merchantId,
  feedLabel,
  onChange,
}: {
  organizationId: number;
  connectionId: string;
  merchantId?: string;
  feedLabel?: string;
  onChange: (value: { merchantId?: string; feedLabel?: string }) => void;
}) {
  const feeds = trpc.googleAds.campaigns.merchantFeedLabels.useQuery(
    { organizationId, connectionId, merchantId: merchantId ?? "" },
    { enabled: !!connectionId && !!merchantId, staleTime: 60000, retry: false }
  );
  const labels = feeds.data?.labels ?? [];
  return (
    <>
      <ResourcePicker
        organizationId={organizationId}
        connectionId={connectionId}
        kind="merchants"
        title="Merchant Center account"
        value={merchantId ? [merchantId] : []}
        onChange={ids => onChange({ merchantId: ids[0], feedLabel: undefined })}
      />
      <Field path="feedLabel" title="Product feed label">
        <select
          value={feedLabel ?? ""}
          disabled={!merchantId || feeds.isLoading}
          onChange={event =>
            onChange({ feedLabel: event.target.value || undefined })
          }
        >
          <option value="">
            {!merchantId
              ? "Choose a Merchant Center account first"
              : feeds.isLoading
                ? "Loading feed labels…"
                : "Choose a feed label…"}
          </option>
          {feedLabel && !labels.includes(feedLabel) && (
            <option value={feedLabel}>{feedLabel} (saved selection)</option>
          )}
          {labels.map(label => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {merchantId && feeds.error && (
        <p role="alert">
          Could not load feed labels. Check this account's Google Ads access and
          Merchant Center link. {feeds.error.message}{" "}
          <button type="button" onClick={() => void feeds.refetch()}>
            Retry
          </button>
        </p>
      )}
      {merchantId && feeds.isSuccess && !labels.length && (
        <p role="status">
          No product feed labels are visible to this Google Ads account. Check
          that products are available in the linked Merchant Center account.
        </p>
      )}
      {merchantId && feeds.data?.limited && (
        <p role="status">
          Labels shown are from the first 10,000 products; other labels may be
          missing.
        </p>
      )}
      {merchantId && (
        <details>
          <summary>Enter a known feed label manually</summary>
          <Field path="feedLabel" title="Manual feed label">
            <input
              value={feedLabel ?? ""}
              maxLength={20}
              onChange={event =>
                onChange({ feedLabel: event.target.value || undefined })
              }
            />
          </Field>
        </details>
      )}
      <p>
        Labels are discovered from products visible in Google Ads, not
        individual Merchant Center data sources. This setup includes products
        matching the selected label, which may span multiple data sources.
        Location targeting is configured separately.
      </p>
    </>
  );
}
