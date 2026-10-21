import { useLocation } from "wouter";
import { PartnerLogo } from "./PartnerLogo";
import { StudioCard } from "./configurator/StudioCard";

export function GoogleAdsStudioEntry({
  context,
}: {
  context: "activation" | "optimization";
}) {
  const [, navigate] = useLocation();
  return (
    <StudioCard
      title="Google Ads"
      badge="Reporting available"
      description="Review spend, clicks, conversions and campaign results in Insights Studio."
      media={
        <div className="activation-channel-art">
          <PartnerLogo slug="googleads" name="Google Ads" size={88} />
          <span>Performance reporting</span>
        </div>
      }
      onSelect={() => navigate("/app/analytics/studio?channel=google_ads")}
    >
      <p className="p-3 text-sm text-muted-foreground">
        {context === "activation"
          ? "Google campaign publishing is not available in Activation Studio yet."
          : "Google optimization analysis is not available yet. Open performance reports to review your results."}
      </p>
    </StudioCard>
  );
}
