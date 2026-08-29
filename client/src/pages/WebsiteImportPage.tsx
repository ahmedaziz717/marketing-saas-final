import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteImportWizard } from "@/components/WebsiteImportWizard";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";

function ImportContent(){ const { organizationId } = useWorkspace(); const [, setLocation] = useLocation(); return <><PageHeader eyebrow="Catalog intelligence" title="Rescan product website" description="Refresh product facts from verified commerce pages without changing the approved brand kit."/><div className="surface mx-auto max-w-5xl p-6 md:p-10"><WebsiteImportWizard organizationId={organizationId!} scanMode="products_only" onComplete={() => setLocation("/app/catalog")}/></div></>; }
export default function WebsiteImportPage(){ return <WorkspaceGate><ImportContent/></WorkspaceGate>; }
