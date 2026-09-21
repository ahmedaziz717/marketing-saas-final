import { Link } from "wouter";
import { ArrowRight, FolderOpen, ShieldCheck } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PRODUCT_STAGES, mayManageBilling } from "@shared/frameProduct";
function Dashboard() {
  const { organization, membership } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="Your marketing workspace"
        title="Create. Activate. Measure. Optimize."
        description={`${organization?.name ?? "Your workspace"}: one connected workflow, with people in control of approvals and delivery.`}
        action={
          <Link href="/app/creatives/overview">
            <Button>
              Open Content Studio
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {PRODUCT_STAGES.map((stage, index) => (
          <article className="surface flex flex-col p-6" key={stage.id}>
            <div className="flex items-center justify-between">
              <p className="eyebrow">0{index + 1}</p>
              {"planned" in stage && (
                <span className="rounded-full bg-muted px-3 py-1 text-xs">
                  Tools planned
                </span>
              )}
            </div>
            <h2 className="mt-5 text-2xl font-semibold">{stage.label}</h2>
            <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-muted-foreground">
              {stage.description}
            </p>
            <Link
              href={stage.href}
              className="inline-flex items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4"
            >
              {"planned" in stage ? "View roadmap" : "Open " + stage.label}
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="surface p-6">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">
            Your content has one home at each stage
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Save working drafts in Content Studio. Submit selected versions to
            Asset Library for review. Use approved assets in Publishing. Weekly
            planning supports future weeks and months.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link
              href="/app/creatives/saved"
              className="text-sm text-primary underline"
            >
              Saved work
            </Link>
            <Link
              href="/app/library?view=needs_review"
              className="text-sm text-primary underline"
            >
              Needs Review
            </Link>
            <Link
              href="/app/publishing"
              className="text-sm text-primary underline"
            >
              Publishing calendar
            </Link>
          </div>
        </section>
        <section className="surface p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">
            One workspace, separate responsibilities
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Account connections and administration stay in Settings. Asset
            approval does not authorize a post, campaign launch or ad budget.
            Planned tools are not yet operational.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link href="/app/brand" className="text-sm text-primary underline">
              Brand kit
            </Link>
            <Link
              href="/app/settings/integrations"
              className="text-sm text-primary underline"
            >
              Integrations
            </Link>
            {mayManageBilling(membership?.role ?? "") && (
              <Link
                href="/app/settings/billing"
                className="text-sm text-primary underline"
              >
                Billing & Usage
              </Link>
            )}
          </div>
        </section>
      </div>
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
