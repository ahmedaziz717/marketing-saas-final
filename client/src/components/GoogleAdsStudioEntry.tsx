import { useLocation, useSearch } from "wouter";
import { PartnerLogo } from "./PartnerLogo";
import { StudioCard } from "./configurator/StudioCard";

export function GoogleAdsStudioEntry({
  context,
}: {
  context: "activation" | "optimization";
}) {
  const [, navigate] = useLocation();
  const asset = new URLSearchParams(useSearch()).get("asset");
  return (
    <StudioCard
      title="Google Ads"
      badge={
        context === "activation"
          ? "Campaigns & assets"
          : "Evidence & recommendations"
      }
      description={
        context === "activation"
          ? "Launch campaigns, add ads and manage Performance Max asset groups."
          : "Analyze Google campaign history and build recommendations from your account data."
      }
      media={
        <div className="activation-channel-art">
          <PartnerLogo slug="googleads" name="Google Ads" size={48} />
          <span>
            {context === "activation"
              ? "Campaign control"
              : "Performance evidence"}
          </span>
        </div>
      }
      onSelect={() =>
        navigate(
          context === "activation"
            ? `/app/activate/google${asset ? `?asset=${encodeURIComponent(asset)}` : ""}`
            : "/app/optimize/studio?channel=google_ads"
        )
      }
    />
  );
}
