import { Link, useLocation } from "wouter";
import { Clock3 } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { PRODUCT_FEATURES, PRODUCT_STAGES } from "@shared/frameProduct";
export default function PlannedFeaturePage() {
  const [path] = useLocation();
  const feature = PRODUCT_FEATURES.find(
    item => item.href === path && item.availability === "planned"
  );
  if (!feature)
    return (
      <WorkspaceGate>
        <p>This tool is not available.</p>
      </WorkspaceGate>
    );
  const stage = PRODUCT_STAGES.find(item => item.id === feature.stage)!;
  return (
    <WorkspaceGate>
      <PageHeader
        eyebrow={stage.label}
        title={feature.name}
        description={feature.description}
      />
      <section className="surface max-w-3xl p-6 md:p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
          <Clock3 size={16} />
          Planned - not available yet
        </span>
        <h2 className="mt-5 text-xl font-semibold">
          Part of the EvokeLoop roadmap
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This is a scope preview, not an operational tool or a feature you can
          unlock by changing plans. No action, budget change or charge is
          available from this page.
        </p>
        <p className="mt-4 text-sm leading-6">
          Delivery order: core workflows and usage tracking, then video and the
          unified event layer, then attribution and budget optimization,
          followed by incrementality, experiments and the AI Agent.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={
              feature.stage === "create"
                ? "/app/creatives/overview"
                : feature.stage === "activate"
                  ? "/app/publishing"
                  : "/app/analytics"
            }
          >
            <Button variant="outline">
              {feature.stage === "create"
                ? "Back to Content Studio"
                : feature.stage === "activate"
                  ? "Open Publishing"
                  : "Open Analytics"}
            </Button>
          </Link>
          {feature.id === "video" && (
            <Link href="/app/creatives/saved?type=videos">
              <Button>Upload existing video</Button>
            </Link>
          )}
        </div>
      </section>
    </WorkspaceGate>
  );
}
