import { useEffect, useState } from "react";
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
        <DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Repair one product gallery</DialogTitle>
            <DialogDescription>
              Preview a documented source recipe before importing photos for one
              existing product. Other products, approvals and source settings
              are preserved. A due automatic sync is held for explicit resume.
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
  const settings = trpc.catalogSources.galleryRecipeSettings.useQuery(scope);
  const status = trpc.catalogSources.galleryPilotStatus.useQuery(scope, {
    refetchInterval: 3000,
  });
  const preview = trpc.catalogSources.previewGalleryPilot.useMutation();
  const queue = trpc.catalogSources.queueGalleryPilot.useMutation();
  const resume = trpc.catalogSources.action.useMutation();
  const saveRecipe = trpc.catalogSources.saveGalleryRecipe.useMutation();
  const [productId, setProductId] = useState("");
  const [recipe, setRecipe] = useState("");
  const [identityPath, setIdentityPath] = useState("code");
  const [error, setError] = useState("");
  const [recipeEdited, setRecipeEdited] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  useEffect(() => {
    if (!recipeEdited && settings.data?.recipe) {
      setRecipe(JSON.stringify(settings.data.recipe, null, 2));
      setIdentityPath(settings.data.recipe.detailIdentityPath);
    }
  }, [settings.data?.recipe, recipeEdited]);
  const reset = () => {
    preview.reset();
    queue.reset();
    setError("");
    setSaveConfirmed(false);
  };
  const pending = status.data && !status.data.completed;
  return (
    <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      {settings.data && (
        <p className="text-xs text-muted-foreground">
          Gallery coverage for {settings.data.coverage.length} source products:{" "}
          {settings.data.coverage.filter(p => p.imageCount > 1).length} have
          multiple stored photos;{" "}
          {settings.data.coverage.filter(p => p.imageCount <= 1).length} have
          one or no stored photo. A gallery control cannot show photos that have
          not been imported.
          {settings.data.recipeOrigin === "last_repair"
            ? " The last completed repair recipe is suggested below; it is not saved for regular source sync."
            : settings.data.recipeOrigin === "saved"
              ? " Using this source's saved gallery recipe."
              : " No reusable gallery recipe is saved."}
        </p>
      )}
      {status.data && (
        <p role="status">
          Product {status.data.externalId}: {status.data.processed} /{" "}
          {status.data.total} images checkpointed.{" "}
          {status.data.completed ? "Complete" : status.data.status}
          {status.data.error ? ` — ${status.data.error}` : ""}
        </p>
      )}
      {status.data?.completed && (
        <p className="text-xs text-muted-foreground">
          Source status: {status.data.status}.{" "}
          {status.data.sourceScheduleHeld
            ? "Automatic sync became due during this pilot. The source stays paused until you explicitly resume source sync."
            : "The prior source lifecycle was restored."}
          {status.data.sourceError
            ? ` Previous source error: ${status.data.sourceError}`
            : ""}
        </p>
      )}
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
      <label className="grid min-w-0 gap-1">
        Product
        <select
          className="insight-input min-w-0 w-full max-w-full"
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
              {product.name} - {product.externalId}
              {settings.data?.coverage.find(p => p.id === product.id)
                ? ` · ${settings.data.coverage.find(p => p.id === product.id)!.imageCount} stored photos`
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1">
        Detail response product ID field
        <input
          className="insight-input min-w-0 w-full max-w-full"
          value={identityPath}
          disabled={!!pending || sourceBusy}
          onChange={e => {
            reset();
            setRecipeEdited(true);
            setIdentityPath(e.target.value);
          }}
        />
      </label>
      <label className="grid min-w-0 gap-1">
        Reviewed gallery recipe (JSON)
        <textarea
          className="insight-input min-w-0 w-full max-w-full min-h-32 font-mono text-xs"
          value={recipe}
          disabled={!!pending || sourceBusy}
          onChange={e => {
            reset();
            setRecipeEdited(true);
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
            disabled={queue.isPending || saveRecipe.isPending}
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
          <div className="border-t pt-3">
            <p className="text-xs">
              Optional: save this reviewed recipe for this source's future
              manual and scheduled syncs. This does not import now or change the
              sync schedule. Future syncs may fetch detail responses and
              additional images for every source product; the one-product
              preview does not bound those source-wide requests.
            </p>
            <label className="my-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={saveConfirmed}
                onChange={e => setSaveConfirmed(e.target.checked)}
              />
              Use this recipe for future source syncs
            </label>
            <Button
              variant="outline"
              disabled={
                !saveConfirmed ||
                !settings.data ||
                saveRecipe.isPending ||
                queue.isPending ||
                !!pending ||
                sourceBusy
              }
              onClick={async () => {
                try {
                  await saveRecipe.mutateAsync({
                    ...scope,
                    token: preview.data!.token,
                    expectedUpdatedAtMs: settings.data!.updatedAtMs,
                    confirmed: true,
                  });
                  reset();
                  await settings.refetch();
                  await onQueued();
                } catch {
                  /* Mutation error below. */
                }
              }}
            >
              Save reviewed source recipe
            </Button>
          </div>
        </div>
      )}
      {saveRecipe.isSuccess && (
        <p role="status">
          Source recipe saved. No import was started. Preview again to repair
          one product.
        </p>
      )}
      {(error ||
        products.error ||
        settings.error ||
        saveRecipe.error ||
        status.error ||
        queue.error ||
        resume.error) && (
        <p role="alert">
          {error ||
            products.error?.message ||
            settings.error?.message ||
            saveRecipe.error?.message ||
            status.error?.message ||
            queue.error?.message ||
            resume.error?.message}
        </p>
      )}
    </div>
  );
}
