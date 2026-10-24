import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function CatalogGalleryPilot({
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
      <Button variant="outline" onClick={() => setOpen(true)}>
        Repair one product gallery
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Repair one product gallery</DialogTitle>
            <DialogDescription>
              Preview a documented source recipe before importing photos for one
              existing product. Other products, approvals and source settings are preserved. A due automatic sync is held for explicit resume.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <PilotForm
              organizationId={organizationId}
              sourceId={sourceId}
              onQueued={onQueued}
              sourceBusy={disabled}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function PilotForm({
  organizationId,
  sourceId,
  onQueued,
  sourceBusy,
}: {
  organizationId: number;
  sourceId: number;
  onQueued: () => Promise<void>;
  sourceBusy?: boolean;
}) {
  const scope = { organizationId, sourceId };
  const products = trpc.catalogSources.galleryPilotProducts.useQuery(scope);
  const status = trpc.catalogSources.galleryPilotStatus.useQuery(scope, {
    refetchInterval: 3000,
  });
  const preview = trpc.catalogSources.previewGalleryPilot.useMutation();
  const queue = trpc.catalogSources.queueGalleryPilot.useMutation();
  const resume = trpc.catalogSources.action.useMutation();
  const [productId, setProductId] = useState("");
  const [recipe, setRecipe] = useState("");
  const [identityPath, setIdentityPath] = useState("code");
  const [error, setError] = useState("");
  const reset = () => {
    preview.reset();
    queue.reset();
    setError("");
  };
  const pending = status.data && !status.data.completed;
  return (
    <div className="space-y-3">
      {status.data && (
        <p role="status">
          Product {status.data.externalId}: {status.data.processed} /{" "}
          {status.data.total} images checkpointed.{" "}
          {status.data.completed ? "Complete" : status.data.status}
          {status.data.error ? ` — ${status.data.error}` : ""}
        </p>
      )}
      {status.data?.completed && <p className="text-xs text-muted-foreground">Source status: {status.data.status}. {status.data.sourceScheduleHeld ? "Automatic sync became due during this pilot. The source stays paused until you explicitly resume source sync." : "The prior source lifecycle was restored."}{status.data.sourceError ? ` Previous source error: ${status.data.sourceError}` : ""}</p>}
      {pending && ["error", "paused"].includes(status.data!.status) && (
        <Button
          onClick={async () => {
            try {
              await resume.mutateAsync({ ...scope, action: "resume" });
              await status.refetch();
            } catch {
              /* Visible mutation error below. */
            }
          }}
        >
          Resume gallery repair
        </Button>
      )}
      <label className="grid gap-1">
        Product
        <select
          className="insight-input"
          value={productId}
          disabled={!!pending || sourceBusy}
          onChange={e => {
            reset();
            setProductId(e.target.value);
          }}
        >
          <option value="">Select an existing source product</option>
          {products.data?.map(product => (
            <option key={product.id} value={product.id}>
              {product.name} — {product.externalId}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        Detail response product ID field
        <input
          className="insight-input"
          value={identityPath}
          disabled={!!pending || sourceBusy}
          onChange={e => {
            reset();
            setIdentityPath(e.target.value);
          }}
        />
      </label>
      <label className="grid gap-1">
        Reviewed gallery recipe (JSON)
        <textarea
          className="insight-input min-h-32 font-mono text-xs"
          value={recipe}
          disabled={!!pending || sourceBusy}
          onChange={e => {
            reset();
            setRecipe(e.target.value);
          }}
          placeholder="Paste the documented source-specific gallery recipe"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Preview fetches one product detail response and no images. The approved
        snapshot is reused during import; the source-wide mapping is not
        changed.
      </p>
      <Button
        disabled={
          !productId || !recipe || !!pending || sourceBusy || preview.isPending
        }
        onClick={async () => {
          setError("");
          try {
            await preview.mutateAsync({
              ...scope,
              productId: Number(productId),
              recipe: {
                ...JSON.parse(recipe),
                detailIdentityPath: identityPath,
              },
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Preview failed");
          }
        }}
      >
        Preview gallery repair
      </Button>
      {preview.data && !queue.isSuccess && (
        <div className="rounded border p-3 space-y-2">
          <p>
            {preview.data.productName}: {preview.data.distinctImages} distinct
            views, {preview.data.cachedImages} already cached;{" "}
            {preview.data.groups.length} groups.
          </p>
          <p className="text-xs">
            {preview.data.groupsAdded.length} new groups;{" "}
            {preview.data.groupsReplaced.length} existing groups refreshed. Up
            to {preview.data.maximumNewImages} new image rows;{" "}
            {preview.data.existingImagesReferenced.length} existing images
            referenced. Existing photos are retained.
          </p>
          <p className="text-xs">
            At most {preview.data.maximumImageAttempts} image requests per
            complete pass including retries, in batches of 12. No additional
            detail requests. Existing facts and approvals are preserved.
            Unavailable images stop the batch for explicit retry. Preview
            expires after 30 minutes.
          </p>
          <Button
            disabled={queue.isPending}
            onClick={async () => {
              try {
                await queue.mutateAsync({
                  ...scope,
                  token: preview.data!.token,
                });
                await status.refetch();
                await onQueued();
              } catch {
                /* Mutation error below. */
              }
            }}
          >
            Confirm this product only
          </Button>
        </div>
      )}
      {(error ||
        products.error ||
        status.error ||
        queue.error ||
        resume.error) && (
        <p role="alert">
          {error ||
            products.error?.message ||
            status.error?.message ||
            queue.error?.message ||
            resume.error?.message}
        </p>
      )}
    </div>
  );
}
