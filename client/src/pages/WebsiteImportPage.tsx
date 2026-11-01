import { Link, useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteImportWizard } from "@/components/WebsiteImportWizard";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";

function ImportContent() {
  const { organizationId } = useWorkspace();
  const [, setLocation] = useLocation();
  return (
    <>
      <Link
        href="~/app/catalog?view=sources"
        className="inline-flex text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to catalog sources
      </Link>
      <PageHeader
        compact
        eyebrow="Catalog"
        title="Import from a website"
        description="Add or refresh product facts from your website, then review them in your catalog."
      />
      <div className="surface p-6 md:p-8">
        <WebsiteImportWizard
          organizationId={organizationId!}
          scanMode="products_only"
          onComplete={() => setLocation("/app/catalog")}
        />
      </div>
    </>
  );
}
export default function WebsiteImportPage() {
  return (
    <WorkspaceGate>
      <ImportContent />
    </WorkspaceGate>
  );
}
