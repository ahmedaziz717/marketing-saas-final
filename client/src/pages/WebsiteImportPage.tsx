import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteImportWizard } from "@/components/WebsiteImportWizard";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";

function ImportContent(){ const { organizationId } = useWorkspace(); const [, setLocation] = useLocation(); return <><PageHeader eyebrow="Website intelligence" title="Import company website" description="Refresh the editable brand source of truth and rebuild the product catalog from public website evidence."/><div className="surface mx-auto max-w-5xl p-6 md:p-10"><WebsiteImportWizard organizationId={organizationId!} onComplete={() => setLocation("/app/catalog")}/></div></>; }
export default function WebsiteImportPage(){ return <WorkspaceGate><ImportContent/></WorkspaceGate>; }
