import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  ShieldCheck,
  CalendarDays,
  Link2,
  Sparkles,
  Check,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PRODUCT_STAGES, mayManageBilling } from "@shared/frameProduct";
import { MarketingLoop } from "@shared/brand";
function Dashboard() {
  const { organization, membership } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow={organization?.name || "YOUR MARKETING WORKSPACE"}
        title="Make your next move."
        description="Create. Activate. Measure. Optimize. Keep your ideas, approvals and campaign plans connected."
        action={
          <Link href="/app/creatives/images">
            <Button>
              <Sparkles size={15} /> New creative
            </Button>
          </Link>
        }
      />
      <div className="evoke-home-top">
        <section className="evoke-start">
          <p className="eyebrow">CREATE WITH PURPOSE</p>
          <h2>
            From a good idea
            <br />
            to your <em>next campaign.</em>
          </h2>
          <p>
            Start with your product, your brand and a fresh direction. Keep
            working drafts in Studio until you choose what's ready for review.
          </p>
          <div className="evoke-start-actions">
            <Link href="/app/creatives/overview">
              <Button>
                Open Content Studio <ArrowRight size={15} />
              </Button>
            </Link>
            <Link href="/app/creatives/saved">
              <FolderOpen size={15} /> Saved work
            </Link>
          </div>
          <div className="evoke-start-notes">
            <span>
              <Check size={12} /> Product context
            </span>
            <span>
              <Check size={12} /> Brand direction
            </span>
            <span>
              <Check size={12} /> Human approval
            </span>
          </div>
        </section>
        <section className="evoke-home-cycle">
          <div className="evoke-home-cycle-head">
            <h2>Your marketing loop</h2>
            <span>Connected workflow</span>
          </div>
          <MarketingLoop context="app" compact />
          <p>Explore each stage. Automated optimization is on the roadmap.</p>
        </section>
      </div>
      <section className="evoke-next-actions" aria-label="Your next actions">
        <Link
          href="/app/library?view=needs_review"
          className="evoke-next-action"
        >
          <ShieldCheck size={22} />
          <div>
            <h3>Ready for a second look?</h3>
            <p>Open Needs Review and check submitted versions.</p>
          </div>
          <ArrowUpRight className="next-arrow" />
        </Link>
        <Link href="/app/publishing" className="evoke-next-action">
          <CalendarDays size={22} />
          <div>
            <h3>Make room for what's next.</h3>
            <p>Plan this week, next week and beyond.</p>
          </div>
          <ArrowUpRight className="next-arrow" />
        </Link>
        <Link href="/app/settings/integrations" className="evoke-next-action">
          <Link2 size={22} />
          <div>
            <h3>Bring your channels together.</h3>
            <p>Manage your own accounts and connections.</p>
          </div>
          <ArrowUpRight className="next-arrow" />
        </Link>
      </section>
      <section className="evoke-home-section">
        <div className="evoke-section-heading">
          <h2>Explore your workspace</h2>
          <span>One system. Clear next steps.</span>
        </div>
        <div className="evoke-stage-grid">
          {PRODUCT_STAGES.map((stage, i) => (
            <article className="evoke-stage-card" key={stage.id}>
              <div className="eyebrow">
                0{i + 1} /{" "}
                {"planned" in stage ? "ON THE ROADMAP" : "YOUR WORKFLOW"}
              </div>
              <h3>{stage.label}</h3>
              <p>{stage.description}</p>
              <Link href={stage.href}>
                {"planned" in stage ? "View roadmap" : "Open " + stage.label}
                <ArrowRight size={13} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="evoke-home-note">
        <ShieldCheck size={20} />
        <p>
          Asset approval and publishing approval stay separate. Your roles and
          permissions control who can take each action.
        </p>
        <Link href="/app/brand">Brand kit</Link>
        <Link href="/app/settings/integrations">Integrations</Link>
        {mayManageBilling(membership?.role ?? "") && (
          <Link href="/app/settings/billing">Billing & Usage</Link>
        )}
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
