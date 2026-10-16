import { Link } from "wouter";
import { Clock3, WandSparkles } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { workspaceStudios } from "@/lib/workspaceStudios";

export default function OptimizationStudioPage() {
  const studio = workspaceStudios.optimize;
  return (
    <WorkspaceGate>
      <PageHeader
        eyebrow={studio.stage}
        title={studio.name}
        description={studio.description}
      />
      <section
        className="workspace-studio-planned surface"
        data-workflow="Optimize"
        aria-labelledby="planned-heading"
      >
        <span className="workspace-studio-badge">
          <Clock3 size={15} aria-hidden="true" /> Planned
        </span>
        <WandSparkles
          className="workspace-studio-planned-icon"
          size={36}
          aria-hidden="true"
        />
        <h2 id="planned-heading">The next studio in your marketing loop</h2>
        <p>
          Optimization Studio is planned and is not available yet. It will bring
          the same guided approach to learning from results and deciding what to
          improve next.
        </p>
        <p>
          For now, explore your performance in Insights Studio or use the
          existing optimization tools and workflow apps.
        </p>
        <div className="workspace-studio-planned-actions">
          <Button asChild>
            <Link href={workspaceStudios.measure.href}>
              Open Insights Studio
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/optimize/apps">Existing optimization tools</Link>
          </Button>
        </div>
      </section>
    </WorkspaceGate>
  );
}
