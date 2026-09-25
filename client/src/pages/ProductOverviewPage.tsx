import { Link, useLocation } from "wouter";
import {
  Sparkles,
  Image,
  Video,
  Mail,
  FileText,
  Layers3,
  ArrowRight,
  Info,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import {
  PRODUCT_FEATURES,
  PRODUCT_STAGES,
  type ProductStage,
} from "@shared/frameProduct";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";

export function ProductFeatureCards({
  stage,
  studioOnly = false,
}: {
  stage: ProductStage;
  studioOnly?: boolean;
}) {
  const features = PRODUCT_FEATURES.filter(
    feature =>
      feature.stage === stage &&
      (!studioOnly || !["asset_library", "catalog"].includes(feature.id))
  );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {features.map(feature => (
        <article
          key={feature.id}
          className="surface evoke-feature-card flex min-w-0 flex-col p-5"
          data-state={feature.availability}
        >
          <div className="evoke-feature-icon">
            {feature.id.includes("video") ? (
              <Video size={20} />
            ) : feature.id.includes("email") ? (
              <Mail size={20} />
            ) : feature.id.includes("blog") ? (
              <FileText size={20} />
            ) : feature.id.includes("image") ? (
              <Image size={20} />
            ) : feature.id.includes("library") ? (
              <Layers3 size={20} />
            ) : (
              <Sparkles size={20} />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{feature.name}</h2>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {feature.availability === "planned"
                ? "Planned"
                : feature.availability === "connection_required"
                  ? "Requires connection"
                  : "Available"}
            </span>
          </div>
          <p className="mb-5 mt-3 flex-1 text-sm leading-6 text-muted-foreground">
            {feature.description}
          </p>
          <Link
            href={feature.href}
            className="inline-flex items-center gap-2 self-start text-sm font-medium text-primary underline underline-offset-4"
          >
            {feature.availability === "planned"
              ? "View planned scope"
              : "Open " + feature.name}
            <ArrowRight size={15} />
          </Link>
        </article>
      ))}
    </div>
  );
}
function ChannelOverview({ kind }: { kind: "advertising" | "social" }) {
  const { organizationId } = useWorkspace();
  const query = trpc.channels.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const advertising = kind === "advertising";
  const channel = advertising ? "meta_ads" : "facebook";
  const name = advertising ? "Meta Ads" : "Facebook";
  const connected =
    query.data?.items.filter(
      c => c.channel === channel && c.status === "connected"
    ) ?? [];
  return (
    <>
      <PageHeader
        eyebrow="Activate"
        title={advertising ? "Advertising overview" : "Social Media overview"}
        description={
          advertising
            ? "Manage paid destinations without mixing campaign delivery with creative production."
            : "Manage organic channels and keep every post on the shared publishing calendar."
        }
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/app/publishing">
          <Button>Open Publishing</Button>
        </Link>
        <Link
          href={
            advertising ? "/app/analytics/advertising" : "/app/analytics/social"
          }
        >
          <Button variant="outline">View performance</Button>
        </Link>
      </div>
      <section className="surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{name}</h2>
          <Link
            href={
              advertising ? "/app/advertising/meta" : "/app/social/facebook"
            }
            className="text-sm font-medium text-primary underline"
          >
            Open channel
          </Link>
        </div>
        {query.isLoading ? (
          <p role="status" className="mt-4">
            Checking connected accounts...
          </p>
        ) : query.error ? (
          <div role="alert" className="mt-4">
            <p>Account status could not be loaded.</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {connected.length
                ? `${connected.length} connected ${advertising ? "ad account(s)" : "Page(s)"}`
                : "No connected destination. Account setup stays in Settings > Integrations."}
            </p>
            {connected.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {connected.map(c => (
                  <span
                    key={c.id}
                    className="rounded-lg bg-muted px-3 py-2 text-sm"
                  >
                    {c.name}
                    {c.expired ? " - reconnect required" : ""}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <p className="mt-4 text-sm leading-6">
          {advertising
            ? "Current scope: inspect existing campaigns and prepare paused image ads. Creating campaigns, changing budgets and activating ads are not included yet."
            : "Current scope: Facebook post planning and approved delivery. Live delivery requires provider authorization and environment activation."}
        </p>
        <Link
          href="/app/settings/integrations"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Manage integrations
        </Link>
      </section>
      <p className="mt-6 text-sm text-muted-foreground">
        {advertising
          ? "Google Ads and Microsoft Ads are planned. Choose channels from the left navigation."
          : "Instagram and TikTok are planned. Choose channels from the left navigation."}
      </p>
    </>
  );
}
export default function ProductOverviewPage() {
  const [path] = useLocation();
  if (path === "/app/advertising" || path === "/app/social")
    return (
      <WorkspaceGate>
        <ChannelOverview
          kind={path === "/app/advertising" ? "advertising" : "social"}
        />
      </WorkspaceGate>
    );
  const stage = path === "/app/optimize" ? "optimize" : "create";
  const details = PRODUCT_STAGES.find(item => item.id === stage)!;
  return (
    <WorkspaceGate>
      <PageHeader
        eyebrow={details.label}
        title={stage === "create" ? "Content Studio" : "Optimize"}
        description={
          stage === "create"
            ? "Create and save working content here. Send selected versions to Asset Library for approval, then use Publishing to schedule them."
            : details.description
        }
      />
      {stage === "create" && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Link href="/app/creatives/saved">
            <Button>Open saved work</Button>
          </Link>
          <Link href="/app/library">
            <Button variant="outline">Open Asset Library</Button>
          </Link>
        </div>
      )}
      {stage === "optimize" && (
        <p className="mb-6 flex gap-3 rounded-xl border p-4 text-sm">
          <Info className="h-5 w-5 shrink-0" />
          These tools are on the roadmap, not paid unlocks. This area cannot run
          experiments, publish content or change budgets yet.
        </p>
      )}
      <ProductFeatureCards stage={stage} studioOnly={stage === "create"} />
    </WorkspaceGate>
  );
}
