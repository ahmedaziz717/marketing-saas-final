import { AppWindow, Workflow } from "lucide-react";
import { Link } from "wouter";
import type { WorkflowFamily } from "@shared/creativeWorkflow";
import { workflowSections } from "@shared/workflowPlatform";
import { CreateNavigation } from "./CreateNavigation";

export function StageToolNavigation({
  family,
  view,
}: {
  family: WorkflowFamily;
  view: "apps" | "workflows";
}) {
  if (family === "create") return <CreateNavigation />;
  const section = workflowSections[family];
  return (
    <nav aria-label={`${section.name} navigation`} className="create-tabs">
      <Link
        href={section.appsPath}
        aria-current={view === "apps" ? "page" : undefined}
      >
        <AppWindow size={16} aria-hidden="true" /> Apps
      </Link>
      <Link
        href={section.path}
        aria-current={view === "workflows" ? "page" : undefined}
      >
        <Workflow size={16} aria-hidden="true" /> Workflows
      </Link>
    </nav>
  );
}
