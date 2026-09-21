import { Link, useLocation, useSearch } from "wouter";
import { AlertTriangle, Loader2 } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CreativeBuilder } from "@/components/CreativeBuilder";
import { AssetWorkbench } from "@/components/AssetWorkbench";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { mayCreateAssets } from "@shared/assetWorkflow";

function CreativeStudio() {
  const { organizationId, membership } = useWorkspace();
  const [path, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const saved =
    path.endsWith("/saved") ||
    path.endsWith("/ugc") ||
    params.get("tab") === "saved" ||
    !!params.get("asset") ||
    !!params.get("revise");
  const canCreate = mayCreateAssets(membership?.role ?? "");
  const utils = trpc.useUtils();
  const query = trpc.creatives.overview.useQuery(
    { organizationId: organizationId! },
    {
      enabled: !!organizationId && canCreate,
      refetchInterval: query =>
        query.state.data?.jobs.some(job =>
          ["running", "queued"].includes(job.status)
        )
          ? 5000
          : false,
    }
  );
  const pending = query.data?.jobs.some(job =>
    ["running", "queued"].includes(job.status)
  );
  const latest = query.data?.jobs[0];
  return (
    <>
      <PageHeader
        eyebrow="Content Studio"
        title={
          path.endsWith("/ads")
            ? "Ad creative"
            : path.endsWith("/social")
              ? "Social content"
              : path.endsWith("/ugc")
                ? "UGC uploads"
                : "Content Studio"
        }
        description="Create, upload, and refine working drafts. Submit selected versions for approval when they are ready for the shared Asset Library."
        action={
          <Link
            className="text-sm font-medium text-primary underline"
            href="/app/library"
          >
            Open Asset Library
          </Link>
        }
      />
      {!canCreate ? (
        <div className="surface p-6">
          <p>
            Your role does not permit creating or submitting assets. Review
            submitted work in Asset Library.
          </p>
          <Link
            className="mt-4 inline-block text-primary underline"
            href="/app/library?view=needs_review"
          >
            Open Needs Review
          </Link>
        </div>
      ) : (
        <>
          <nav
            aria-label="Content Studio views"
            className="mb-6 flex gap-2 border-b pb-4"
          >
            <Button
              aria-pressed={!saved}
              variant={!saved ? "default" : "outline"}
              onClick={() => navigate("/app/creatives")}
            >
              Create
            </Button>
            <Button
              aria-pressed={saved}
              variant={saved ? "default" : "outline"}
              onClick={() => navigate("/app/creatives?tab=saved")}
            >
              Saved work
            </Button>
          </nav>
          <div hidden={saved}>
            {(path.endsWith("/ads") || path.endsWith("/social")) && (
              <p className="mb-5 rounded-xl border p-4 text-sm">
                This uses the shared image builder. Create and review assets
                here;{" "}
                {path.endsWith("/ads")
                  ? "manage campaigns in Activate > Advertising"
                  : "manage posts in Activate > Social Media"}
                . Scheduling stays in Publishing.
              </p>
            )}
            <CreativeBuilder
              onGenerated={() => {
                navigate("/app/creatives?tab=saved");
                void utils.assetLibrary.studioList.invalidate();
                void utils.creatives.overview.invalidate();
              }}
            />
          </div>
          {saved && (
            <>
              {pending && (
                <p
                  role="status"
                  className="mb-5 rounded-xl bg-primary/5 p-4 text-sm"
                >
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Generating your images. Completed results will be saved here
                  as drafts, not added to the library.
                </p>
              )}
              {latest?.status === "failed" && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-medium">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    The latest generation did not complete.
                  </p>
                  <p className="mt-2 text-sm">{latest.errorMessage}</p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() => navigate("/app/creatives")}
                  >
                    Return to saved setups
                  </Button>
                </div>
              )}
              <AssetWorkbench
                surface="studio"
                initialType={path.endsWith("/ugc") ? "ugc" : undefined}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
export default function CreativesPage() {
  return (
    <WorkspaceGate>
      <CreativeStudio />
    </WorkspaceGate>
  );
}
