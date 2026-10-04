import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  CalendarDays,
  Clapperboard,
  FolderOpen,
  Image,
  Link2,
  MessageSquare,
  Palette,
  Send,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { studioContentHref } from "@shared/contentWorkflow";

const stages = [
  {
    label: "Create",
    icon: Sparkles,
    description: "Turn an idea into content.",
    href: "/app/creatives",
  },
  {
    label: "Activate",
    icon: Send,
    description: "Put approved work into motion.",
    href: "/app/publishing",
  },
  {
    label: "Measure",
    icon: BarChart3,
    description: "See how your campaigns perform.",
    href: "/app/analytics",
  },
  {
    label: "Optimize",
    icon: WandSparkles,
    description: "Learn, test, and improve.",
    href: "/app/optimize",
    planned: true,
  },
];
function Dashboard() {
  const { organization } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow={organization?.name || "Your workspace"}
        title="What will you make next?"
        description="Your brand, creative work, and campaigns. All connected."
        action={
          <Button asChild>
            <Link href="/app/creatives">
              <Sparkles size={16} />
              Explore apps
            </Link>
          </Button>
        }
      />
      <section className="workspace-home-start" aria-labelledby="start-heading">
        <div className="workspace-home-intro">
          <span className="workspace-home-icon">
            <Sparkles size={25} />
          </span>
          <h2 id="start-heading">
            Start with an idea.
            <br />
            <span>Make it your own.</span>
          </h2>
          <p>
            Create something new or bring your next campaign together. Your
            drafts are ready whenever you are.
          </p>
          <Link href="/app/creatives/drafts" className="workspace-draft-link">
            <FolderOpen size={17} />
            Continue a draft
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="workspace-quick-apps">
          {[
            {
              title: "Create an image",
              detail: "Products, services, and ideas",
              icon: Image,
              href: "/app/creatives/images",
              color: "images",
            },
            {
              title: "Create a video",
              detail: "Product stories and motion",
              icon: Clapperboard,
              href: "/app/creatives/video",
              color: "video",
            },
            {
              title: "Compose a post",
              detail: "Content for your social channels",
              icon: MessageSquare,
              href: studioContentHref("facebook"),
              color: "social",
            },
            {
              title: "Plan a campaign",
              detail: "A goal, an audience, a direction",
              icon: BookOpenText,
              href: "/app/plans",
              color: "plans",
            },
          ].map(({ title, detail, icon: Icon, href, color }) => (
            <Link
              key={href}
              href={href}
              className="workspace-quick-app"
              data-app={color}
            >
              <span>
                <Icon size={22} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>
      <section
        className="workspace-home-section"
        aria-labelledby="loop-heading"
      >
        <div className="studio-section-heading">
          <div>
            <h2 id="loop-heading">Your marketing loop</h2>
            <p>Move between stages without losing the context.</p>
          </div>
        </div>
        <div className="workspace-loop-grid">
          {stages.map(
            ({ label, icon: Icon, description, href, planned }, index) => (
              <Link
                key={label}
                href={href}
                data-workflow={label}
                className="workspace-loop-card"
              >
                <div className="workspace-loop-top">
                  <Icon size={22} />
                  <span>{planned ? "Planned" : `0${index + 1}`}</span>
                </div>
                <h3>{label}</h3>
                <p>{description}</p>
                <ArrowRight size={16} className="workspace-loop-arrow" />
              </Link>
            )
          )}
        </div>
      </section>
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
              href: "/app/brand",
            },
            {
              title: "Connect your channels",
              detail: "Manage your accounts and integrations.",
              icon: Link2,
              href: "/app/settings/integrations",
            },
          ].map(({ title, detail, icon: Icon, href }) => (
            <Link key={href} href={href} className="workspace-shortcut">
              <Icon size={20} />
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
              <ArrowRight size={15} />
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
