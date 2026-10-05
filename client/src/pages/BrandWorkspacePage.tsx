import { CompanyBrandSettings } from "@/components/CompanyBrandSettings";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";

function BrandWorkspace() {
  const { organizationId } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="Workspace identity"
        title="Brand"
        description="Your company profile, logo, colors, and voice in one place."
      />
      <div className="mx-auto max-w-6xl space-y-6">
        <CompanyBrandSettings key={organizationId} />
      </div>
    </>
  );
}

export default function BrandWorkspacePage() {
  return (
    <WorkspaceGate>
      <BrandWorkspace />
    </WorkspaceGate>
  );
}
