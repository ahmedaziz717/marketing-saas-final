import { PartnerLogo } from "@/components/PartnerLogo";
import { OptimizationTemplates } from "@/components/OptimizationTemplates";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Megaphone,
  MessageSquare,
} from "lucide-react";
import type { WorkflowFamily } from "@shared/creativeWorkflow";
import { workflowSections } from "@shared/workflowPlatform";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { StageToolNavigation } from "@/components/StageToolNavigation";
import { WorkflowApps, WorkflowAppRunner } from "@/components/WorkflowApps";
import { useWorkspace } from "@/hooks/useWorkspace";
import CreativesPage from "./CreativesPage";
import "@/styles/workflows.css";

const tools = {
  activate: [
    {
      name: "Google Ads",
      description: "Create campaigns, add ads and manage asset groups.",
      href: "/app/activate/google",
      icon: Megaphone,
    },
    {
      name: "Meta Ads",
      description:
        "Manage campaigns, ad sets, and ads for your connected accounts.",
      href: "/app/advertising/meta",
      icon: Megaphone,
    },
    {
      name: "Facebook publishing",
      description: "Manage Page posts and prepare your next publication.",
      href: "/app/social/facebook",
      icon: MessageSquare,
    },
    {
      name: "Publishing calendar",
      description:
        "Review, approve, and schedule content across connected channels.",
      href: "/app/publishing",
      icon: CalendarDays,
    },
  ],
  measure: [],
  optimize: [
    {
      name: "Optimization intelligence",
      description:
        "Explore historical Google and Meta evidence, classifications, and suggested tests.",
      href: "/app/optimize/intelligence",
      icon: BarChart3,
    },
  ],
  create: [],
};
const descriptions = {
  create: "Create images, videos, ads, and posts with your creative Apps.",
  activate:
    "Put your content to work with publishing tools and your team's Apps.",
  measure: "Run reusable tools published from your measurement workflows.",
  optimize:
    "Run your team's published Apps for objectives, creative direction, and improvement.",
};

export default function StageAppsPage({
  family = "create",
}: {
  family?: WorkflowFamily;
}) {
  const appId = new URLSearchParams(useSearch()).get("app");
  if (family === "create" && !appId) return <CreativesPage />;
  return (
    <WorkspaceGate>
      <AppsWorkspace family={family} appId={appId} />
    </WorkspaceGate>
  );
}

function AppsWorkspace({
  family,
  appId,
}: {
  family: WorkflowFamily;
  appId: string | null;
}) {
  const { organizationId, membership } = useWorkspace();
  const [, navigate] = useLocation();
  const section = workflowSections[family];
  const canRun = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  if (!organizationId) return null;
  if (appId)
    return canRun ? (
      <WorkflowAppRunner
        key={`${organizationId}:${appId}`}
        organizationId={organizationId}
        id={appId}
        role={membership!.role}
        onBack={() => navigate(section.appsPath)}
      />
    ) : (
      <p className="surface p-8">
        A creator or publisher role is needed to run Apps.
      </p>
    );
  return (
    <div className="wf-library" data-family={family}>
      <header className="wf-library-heading">
        <div>
          <span className="wf-eyebrow">
            {section.name.toUpperCase()} /{" "}
            {family === "measure" ? "WORKFLOW APPS" : "APPS"}
          </span>
          <h1>
            {section.name} {family === "measure" ? "workflow apps" : "Apps"}
          </h1>
          <p>{descriptions[family]}</p>
        </div>
      </header>
      <StageToolNavigation family={family} view="apps" />
      {family === "measure" && (
        <p className="wf-report-guidance">
          Reports you create in Insights Studio, including their schedules and
          results, live in{" "}
          <Link href="/app/analytics/reports">Saved reports</Link>.
        </p>
      )}
      {!!tools[family].length && (
        <section
          className="wf-apps-section"
          aria-label={`${section.name} tools`}
        >
          <div className="wf-section-title">
            <h2>Built-in Apps</h2>
          </div>
          <div className="wf-app-grid">
            {tools[family].map(({ name, description, href, icon: Icon }) => (
              <article className="wf-app-card" key={href}>
                <span className="wf-app-icon">
                  {href === "/app/advertising/meta" ||
                  href === "/app/social/facebook" ? (
                    <PartnerLogo
                      slug={href.includes("facebook") ? "facebook" : "meta"}
                      name={href.includes("facebook") ? "Facebook" : "Meta"}
                    />
                  ) : (
                    <Icon size={24} />
                  )}
                </span>
                <h3>{name}</h3>
                <p>{description}</p>
                <div>
                  <Link href={href}>
                    Open {name} <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {canRun ? (
        <>
          {family === "optimize" && canRun && (
            <OptimizationTemplates organizationId={organizationId} />
          )}
          <WorkflowApps organizationId={organizationId} family={family} />
        </>
      ) : (
        <p className="surface p-6">
          A creator or publisher role is needed to run your team's Apps.
        </p>
      )}
    </div>
  );
}
