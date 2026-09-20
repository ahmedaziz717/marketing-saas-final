import { Link } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { AssetWorkbench } from "@/components/AssetWorkbench";
function Library() {
  return <><PageHeader eyebrow="Shared content" title="Asset Library" description="Review submissions and reuse approved images, videos, UGC, and source assets. Creation and working drafts stay in Content Studio." action={<Link href="/app/creatives?tab=saved" className="text-sm font-medium text-primary underline">Open Content Studio</Link>} /><AssetWorkbench surface="library" /></>;
}
export default function AssetLibraryPage() { return <WorkspaceGate><Library /></WorkspaceGate>; }
