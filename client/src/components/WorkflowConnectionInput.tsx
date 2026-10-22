import { VisualSelect } from "@/components/choices/VisualSelect";
import { trpc } from "@/lib/trpc";
import { PartnerLogo } from "./PartnerLogo";

export function WorkflowConnectionInput({
  organizationId,
  value,
  onChange,
  channel = "facebook",
  disabled,
  title,
  summary = false,
}: {
  organizationId: number;
  value: string;
  onChange: (value: string) => void;
  channel?: "facebook" | "meta_ads" | "google_ads";
  disabled?: boolean;
  title: string;
  summary?: boolean;
}) {
  const meta = trpc.channels.connections.useQuery({ organizationId });
  const google = trpc.googleAds.connections.useQuery(
    { organizationId },
    { enabled: channel === "google_ads" }
  );
  const query = channel === "google_ads" ? google : meta;
  const items =
    query.data?.items.filter(
      c => c.channel === channel && c.status === "connected"
    ) ?? [];
  if (summary)
    return (
      <span>
        {query.isLoading
          ? "Loading destination…"
          : (items.find(c => c.id === value)?.name ??
            "Selected destination unavailable")}
      </span>
    );
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <PartnerLogo
          slug={
            channel === "google_ads"
              ? "googleads"
              : channel === "facebook"
                ? "facebook"
                : "meta"
          }
          name={
            channel === "google_ads"
              ? "Google Ads"
              : channel === "facebook"
                ? "Facebook"
                : "Meta"
          }
          size={28}
        />
        {channel === "google_ads"
          ? "Google Ads accounts"
          : channel === "facebook"
            ? "Facebook Pages"
            : "Meta accounts"}
      </span>
      <VisualSelect
        visual="account"
        imageOrganizationId={organizationId}
        aria-label={title}
        value={value}
        disabled={disabled || query.isLoading}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">
          {query.isLoading
            ? "Loading destinations…"
            : `Choose a ${channel === "google_ads" ? "Google Ads account" : channel === "facebook" ? "Facebook Page" : "Meta ad account"}`}
        </option>
        {value && !items.some(c => c.id === value) && (
          <option value={value}>
            Selected destination unavailable — choose another
          </option>
        )}
        {items.map(c => (
          <option
            key={c.id}
            value={c.id}
            data-account-id={c.id}
            data-image={c.details.imageUrl}
            data-description={
              c.details.imageSource === "business"
                ? "Business photo"
                : undefined
            }
          >
            {c.name}
          </option>
        ))}
      </VisualSelect>
      {query.error && <p role="alert">{query.error.message}</p>}
      {!query.isLoading && !query.error && !items.length && (
        <p>
          No connected destinations. Connect one in Settings → Integrations.
        </p>
      )}
    </div>
  );
}
