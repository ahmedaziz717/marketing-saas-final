import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CatalogSources } from "@/components/CatalogSources";
import { useWorkspace } from "@/hooks/useWorkspace";
function Integrations() {
  const { organizationId } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Manage catalog sources and synchronization. Connections added here also appear in Catalog → Sources."
      />
      {organizationId && <CatalogSources organizationId={organizationId} />}
    </>
  );
}
export default function IntegrationsPage() {
  return (
    <WorkspaceGate>
      <Integrations />
    </WorkspaceGate>
  );
}
