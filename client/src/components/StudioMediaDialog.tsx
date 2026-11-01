import { useState } from "react";
import { CreativeBuilder } from "./CreativeBuilder";
import { AssetWorkbench } from "./AssetWorkbench";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";

export function StudioMediaDialog({
  planId,
  onChoose,
  onClose,
}: {
  planId?: number;
  onChoose: (key: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"create" | "drafts">("drafts");
  const { organizationId } = useWorkspace();
  const jobs = trpc.creatives.overview.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId, refetchInterval: 5000 }
  );
  const pending = jobs.data?.jobs.some(j =>
    ["running", "queued"].includes(j.status)
  );
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[94dvh] overflow-y-auto overflow-x-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Media for this content</DialogTitle>
          <DialogDescription>
            Your copy stays in the composer. Generate or upload media, then
            select an approved finished version.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === "create" ? "default" : "outline"}
            onClick={() => setView("create")}
          >
            Generate image
          </Button>
          <Button
            variant={view === "drafts" ? "default" : "outline"}
            onClick={() => setView("drafts")}
          >
            Uploads & image drafts
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back to content
          </Button>
        </div>
        {pending && (
          <p role="status" className="rounded-xl bg-muted p-3 text-sm">
            Images are generating. Completed versions appear below for review.
          </p>
        )}
        <div hidden={view !== "create"}>
          <CreativeBuilder
            initialPlanId={planId}
            onGenerated={() => setView("drafts")}
          />
        </div>
        {view === "drafts" && (
          <AssetWorkbench surface="studio" embedded onChoose={onChoose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
