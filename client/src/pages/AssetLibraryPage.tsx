import { Link } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { AssetWorkbench } from "@/components/AssetWorkbench";
function Library() {
  return (
    <>
      <PageHeader
        eyebrow="Shared content"
        title="Asset Library"
        description="Review submissions and reuse approved images, videos, UGC, and source assets. Create new content and manage working drafts in Create."
        action={
          <Link
            href="/app/creatives"
            className="text-sm font-medium text-primary underline"
          >
            Open Create
          </Link>
        }
      />
      <AssetWorkbench surface="library" />
    </>
  );
}
export default function AssetLibraryPage() {
  return (
    <WorkspaceGate>
      <Library />
    </WorkspaceGate>
  );
}
