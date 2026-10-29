import { Redirect, useSearch } from "wouter";

/** Keep existing bookmarks and asset handoffs in the unified Activation Studio. */
export default function GoogleCampaignStudioPage() {
  const params = new URLSearchParams(useSearch());
  params.set("channel", "google_ads");
  return <Redirect to={`/app/activate/studio?${params.toString()}`} replace />;
}
