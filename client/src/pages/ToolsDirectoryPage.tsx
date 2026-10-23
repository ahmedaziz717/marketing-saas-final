import { Link } from "wouter";
import { ArrowRight, LayoutGrid, Workflow } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { workspaceStudios } from "@/lib/workspaceStudios";
import { workflowSections } from "@shared/workflowPlatform";

/** Navigation only: the existing family libraries retain their role and run gates. */
export default function ToolsDirectoryPage({
  workflows = false,
}: {
  workflows?: boolean;
}) {
  const title = workflows ? "Workflows" : "Apps";
  const Icon = workflows ? Workflow : LayoutGrid;
  return (
    <WorkspaceGate>
      <PageHeader
        eyebrow="Your workspace"
        title={title}
        description={
          workflows
            ? "Build and manage the steps behind your team's work. Choose a collection to open its workflows."
            : "Run the tools your team has published. Choose a collection to explore its Apps."
        }
      />
      <nav className="directory-switch" aria-label="Tools">
        <Link href="/app/apps" aria-current={!workflows ? "page" : undefined}>
          <LayoutGrid size={18} />
          Apps
        </Link>
        <Link
          href="/app/workflows"
          aria-current={workflows ? "page" : undefined}
        >
          <Workflow size={18} />
          Workflows
        </Link>
      </nav>
      <section
        className="tools-directory-grid"
        aria-label={`${title} collections`}
      >
        {Object.entries(workspaceStudios).map(([family, studio]) => {
          const section =
            workflowSections[family as keyof typeof workflowSections];
          return (
            <Link
              key={family}
              className="surface tools-directory-card"
              href={workflows ? section.path : section.appsPath}
            >
              <Icon size={24} aria-hidden="true" />
              <h2>
                {studio.stage} {title}
              </h2>
              <p>{studio.description}</p>
              <span>
                Browse collection <ArrowRight size={16} />
              </span>
            </Link>
          );
        })}
      </section>
    </WorkspaceGate>
  );
}
