import { Link, useLocation } from "wouter";
import { Clock3 } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { CreateNavigation } from "@/components/CreateNavigation";
import { PageHeader } from "@/components/PageHeader";
import { SettingsLayout } from "@/components/SettingsLayout";
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
  const content = (
    <>
      <PageHeader
        compact={feature.id === "api_assistants"}
        eyebrow={feature.id === "api_assistants" ? "Settings" : stage.label}
        title={feature.name}
        description={feature.description}
      />
      {feature.id === "creative_workflows" && <CreateNavigation />}
      <section className="surface max-w-3xl p-6 md:p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
          <Clock3 size={16} />
          Planned - not available yet
        </span>
        <h2 className="mt-5 text-xl font-semibold">
          Part of the EvokeLoop roadmap
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This capability is planned and is not available yet. It will build on
          your existing brand, content, and campaign workspace.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          You can use the creation apps, shared library, connected channels, and
          reporting today. These future tools will use the same content and
          permissions.
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
                ? "Back to apps"
                : feature.stage === "activate"
                  ? "Open Calendar"
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
    </>
  );
  return (
    <WorkspaceGate>
      {feature.id === "api_assistants" ? (
        <SettingsLayout>{content}</SettingsLayout>
      ) : (
        content
      )}
    </WorkspaceGate>
  );
}
