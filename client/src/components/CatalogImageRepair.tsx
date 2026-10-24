import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { VisualSelect } from "./choices/VisualSelect";

export function CatalogImageRepair({
  organizationId,
  sourceId,
  disabled,
  onQueued,
}: {
  organizationId: number;
  sourceId: number;
  disabled?: boolean;
  onQueued: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Repair source images
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repair source images</DialogTitle>
            <DialogDescription>
              Confirm the image directory documented by this source. Repair
              keeps product details, review decisions and existing images.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <RepairForm
              organizationId={organizationId}
              sourceId={sourceId}
              onQueued={async () => {
                await onQueued();
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function RepairForm({
  organizationId,
  sourceId,
  onQueued,
}: {
  organizationId: number;
  sourceId: number;
  onQueued: () => Promise<void>;
}) {
  const query = trpc.catalogSources.imageSettings.useQuery(
    { organizationId, sourceId },
    { refetchOnWindowFocus: false }
  );
  const repair = trpc.catalogSources.repairImages.useMutation();
  const [base, setBase] = useState("");
  const [mode, setMode] = useState<"url" | "directory">("url");
  const [gallery, setGallery] = useState("");
  useEffect(() => {
    if (query.data) {
      setBase(query.data.imageBaseUrl);
      setMode(query.data.imagePathMode);
      setGallery(query.data.imagesPath);
    }
  }, [query.data]);
  return (
    <form
      className="space-y-4"
      onSubmit={async e => {
        e.preventDefault();
        if (!query.data) return;
        try {
          await repair.mutateAsync({
            organizationId,
            sourceId,
            expectedUpdatedAtMs: query.data.updatedAtMs,
            imageBaseUrl: base.trim() || undefined,
            imagePathMode: mode,
            imagesPath: gallery.trim() || undefined,
          });
          await onQueued();
        } catch {
          /* Visible mutation error below. */
        }
      }}
    >
      <label className="grid gap-2">
        Image directory
        <input
          className="insight-input"
          type="url"
          value={base}
          onChange={e => setBase(e.target.value)}
          placeholder="https://images.example.com/products/"
        />
      </label>
      <label className="grid gap-2">
        How this source defines image paths
        <VisualSelect
          value={mode}
          onChange={e => setMode(e.target.value as typeof mode)}
        >
          <option value="url">
            Standard URLs — / starts at the website root
          </option>
          <option value="directory">
            Relative to this directory — including leading /
          </option>
        </VisualSelect>
      </label>
      <p className="text-sm text-muted-foreground">
        Choose directory-relative paths only when your source documentation
        specifies them. Complete image URLs keep their original address.
      </p>
      <label className="grid gap-2">
        Product gallery field · optional
        <input
          className="insight-input"
          value={gallery}
          onChange={e => setGallery(e.target.value)}
          placeholder="images"
        />
      </label>
      {(query.error || repair.error) && (
        <p role="alert">{query.error?.message || repair.error?.message}</p>
      )}
      <Button type="submit" disabled={!query.data || repair.isPending}>
        {repair.isPending ? "Queuing repair…" : "Save image settings & repair"}
      </Button>
    </form>
  );
}
