import { Link } from "wouter";
import {
  ArrowRight,
  CalendarDays,
  FolderOpen,
  Link2,
  Palette,
  ShieldCheck,
  LayoutGrid,
  Workflow,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { workspaceStudios } from "@/lib/workspaceStudios";
import { InsightsDashboard } from "@/components/InsightsDashboard";

function Dashboard() {
  const { organization, organizationId } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow={organization?.name || "Your workspace"}
        title="Your marketing, connected."
        description="A clear place to create, activate, measure, and improve."
        action={
          <Button asChild variant="outline">
            <Link href="/app/creatives/drafts">
              <FolderOpen size={16} />
              Continue a draft
            </Link>
          </Button>
        }
      />
      <h2 className="workspace-section-title">Your studios</h2>
      <section
        className="workspace-studios-grid"
        aria-label="Marketing studios"
      >
        {Object.values(workspaceStudios).map(
          ({ name, stage, icon: Icon, description, href, planned }, index) => (
            <Link
              key={href}
              href={href}
              data-workflow={stage}
              data-planned={planned}
              className="workspace-studio-card"
            >
              <div className="workspace-studio-top">
                <span className="workspace-studio-icon">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span className="workspace-studio-stage">
                  0{index + 1} / {stage}
                </span>
                {planned && (
                  <span className="workspace-studio-badge">Planned</span>
                )}
              </div>
              <h2>{name}</h2>
              <p>{description}</p>
              <span className="workspace-studio-action">
                {planned ? "View planned studio" : "Open studio"}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          )
        )}
      </section>
      <nav className="workspace-tools-groups" aria-label="Apps and Workflows">
        <Link href="/app/apps">
          <LayoutGrid size={22} />
          <span>
            <strong>Apps</strong>
            <small>Run your team's published tools</small>
          </span>
          <ArrowRight size={18} />
        </Link>
        <Link href="/app/workflows">
          <Workflow size={22} />
          <span>
            <strong>Workflows</strong>
            <small>Build and manage connected steps</small>
          </span>
          <ArrowRight size={18} />
        </Link>
      </nav>
      {organizationId && (
        <div className="workspace-home-section">
          <InsightsDashboard
            key={organizationId}
            organizationId={organizationId}
            surface="main"
          />
        </div>
      )}
      <section
        className="workspace-home-section"
        aria-labelledby="organize-heading"
      >
        <div className="studio-section-heading">
          <div>
            <h2 id="organize-heading">Keep things moving</h2>
          </div>
        </div>
        <div className="workspace-shortcut-grid">
          {[
            {
              title: "Review your assets",
              detail: "Check submissions and approve versions.",
              icon: ShieldCheck,
              href: "/app/library?view=needs_review",
            },
            {
              title: "Open the calendar",
              detail: "Plan, approve, and schedule delivery.",
              icon: CalendarDays,
              href: "/app/publishing",
            },
            {
              title: "Make it on-brand",
              detail: "Keep your logo, colors, and voice together.",
              icon: Palette,
              href: "/app/brand?tab=brand",
            },
            {
              title: "Connect your channels",
              detail: "Manage your accounts and integrations.",
              icon: Link2,
              href: "/app/settings/integrations",
            },
          ].map(({ title, detail, icon: Icon, href }) => (
            <Link key={href} href={href} className="workspace-shortcut">
              <Icon size={20} aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
export default function WorkspaceApp() {
  return (
    <WorkspaceGate>
      <Dashboard />
    </WorkspaceGate>
  );
}
