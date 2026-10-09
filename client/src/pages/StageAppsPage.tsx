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
  measure: [
    {
      name: "Performance overview",
      description: "See your connected-channel results in one place.",
      href: "/app/analytics",
      icon: BarChart3,
    },
    {
      name: "Advertising analytics",
      description: "Explore ad performance by account and reporting period.",
      href: "/app/analytics/advertising",
      icon: Megaphone,
    },
    {
      name: "Social analytics",
      description: "Explore post engagement and Page performance.",
      href: "/app/analytics/social",
      icon: MessageSquare,
    },
  ],
  optimize: [],
  create: [],
};
const descriptions = {
  create: "Create images, videos, ads, and posts with your creative Apps.",
  activate:
    "Put your content to work with publishing tools and your team's Apps.",
  measure: "Explore performance with reporting tools and your team's Apps.",
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
            {section.name.toUpperCase()} / APPS
          </span>
          <h1>{section.name} Apps</h1>
          <p>{descriptions[family]}</p>
        </div>
      </header>
      <StageToolNavigation family={family} view="apps" />
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
                  <Icon size={24} />
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
        <WorkflowApps organizationId={organizationId} family={family} />
      ) : (
        <p className="surface p-6">
          A creator or publisher role is needed to run your team's Apps.
        </p>
      )}
    </div>
  );
}
