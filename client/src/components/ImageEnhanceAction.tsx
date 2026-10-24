import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { canEnhanceImage, type LibraryAsset } from "@shared/assetLibrary";
import {
  creativeSetupSchema,
  defaultCreativeSetup,
  generationSetupIssues,
  type CreativeSetup,
} from "@shared/creativeBuilder";
import {
  imageReferenceCount,
  modelCompatibility,
} from "@shared/creativeConfigurator";
import {
  generationModel,
  modelDefaults,
  referenceCapacity,
} from "@shared/modelCatalog";
import { libraryAssetLink } from "@shared/assetWorkflow";
import { studioModelArtwork } from "./configurator/studioArtwork";
import { VisualSelect } from "./choices/VisualSelect";
import { ModelSettings } from "./ModelPicker";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function ImageEnhanceAction({
  asset,
  organizationId,
  onSaved,
}: {
  asset: LibraryAsset;
  organizationId: number;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canEnhanceImage(asset)) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles size={16} className="mr-2" />
        Enhance image
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enhance image</DialogTitle>
            <DialogDescription>
              Improve this creative as a new draft. Review the result before
              approving or publishing it.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <EnhanceEditor
              key={asset.key + asset.revision}
              asset={asset}
              organizationId={organizationId}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EnhanceEditor({
  asset,
  organizationId,
  onSaved,
}: {
  asset: LibraryAsset;
  organizationId: number;
  onSaved?: () => void;
}) {
  const scope = { organizationId };
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const initial = trpc.creativeBuilder.enhancementSetup.useQuery(
    { ...scope, key: asset.key, revision: asset.revision },
    { retry: false, refetchOnWindowFocus: false }
  );
  const catalog = trpc.models.studioCatalog.useQuery(scope, {
    staleTime: 60000,
  });
  const [edits, setEdits] = useState<Partial<CreativeSetup>>({});
  const setup = initial.data ? { ...initial.data.setup, ...edits } : null;
  const signature = JSON.stringify(setup);
  const [quotedSetup, setQuotedSetup] = useState<CreativeSetup | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuotedSetup(setup), 300);
    return () => clearTimeout(timer);
  }, [signature]);
  const valid =
    quotedSetup &&
    creativeSetupSchema.safeParse(quotedSetup).success &&
    !generationSetupIssues(quotedSetup).length;
  const quote = trpc.creativeBuilder.quote.useQuery(
    { ...scope, setup: quotedSetup ?? defaultCreativeSetup() },
    { enabled: !!valid, retry: false, refetchOnWindowFocus: false }
  );
  const save = trpc.creativeBuilder.save.useMutation();
  const generate = trpc.creativeBuilder.generate.useMutation();
  const [jobId, setJobId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const job = trpc.creativeBuilder.studioJob.useQuery(
    { ...scope, jobId: jobId ?? 1 },
    {
      enabled: !!jobId,
      retry: false,
      refetchInterval: q =>
        q.state.data && ["completed", "failed"].includes(q.state.data.status)
          ? false
          : 3000,
    }
  );
  const completed =
    job.data?.status === "completed" ? job.data.variants[0] : undefined;
  const notified = useRef<number | null>(null);
  useEffect(() => {
    if (!completed || notified.current === completed.id) return;
    notified.current = completed.id;
    void utils.assetLibrary.studioList.invalidate();
    void utils.assetLibrary.list.invalidate();
    void utils.models.credits.invalidate();
    onSaved?.();
  }, [completed?.id]);
  const attempt = useRef<{
    signature: string;
    briefId: number;
    updatedAtMs: number;
    requestId: string;
  } | null>(null);
  const model = generationModel(setup?.modelId || "");
  const compatibility =
    model && setup
      ? modelCompatibility(model, imageReferenceCount(setup), false)
      : null;
  const setupError =
    setup && setup.enhancement!.instruction.trim().length < 20
      ? "Add at least 20 characters describing the enhancement."
      : null;
  const ready =
    !!setup &&
    !!valid &&
    signature === JSON.stringify(quotedSetup) &&
    quote.data?.credits !== undefined &&
    !quote.isFetching &&
    !quote.error &&
    !compatibility &&
    !busy &&
    !jobId;
  async function enhance() {
    if (!ready || !setup || quote.data?.credits === undefined) return;
    setBusy(true);
    setError("");
    try {
      if (attempt.current?.signature !== signature) {
        const saved = await save.mutateAsync({ ...scope, setup });
        attempt.current = {
          signature,
          ...saved,
          requestId: crypto.randomUUID(),
        };
      }
      const pending = attempt.current!;
      const result = await generate.mutateAsync({
        ...scope,
        briefId: pending.briefId,
        expectedUpdatedAtMs: pending.updatedAtMs,
        requestId: pending.requestId,
        quotedCredits: quote.data.credits,
      });
      setJobId(result.jobId);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Enhancement could not start. Review your drafts before retrying."
      );
    } finally {
      setBusy(false);
    }
  }
  if (!setup)
    return (
      <p role={initial.error ? "alert" : "status"}>
        {initial.error?.message || "Preparing your image…"}
      </p>
    );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <figure className="rounded-xl border bg-muted/30 p-3">
          <img
            src={asset.url}
            alt={asset.name}
            className="max-h-72 w-full object-contain"
          />
          <figcaption className="mt-2 text-xs text-muted-foreground">
            Original · kept in your library
          </figcaption>
        </figure>
        {completed ? (
          <figure className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <img
              src={completed.url}
              alt="Enhanced draft"
              className="max-h-72 w-full object-contain"
            />
            <figcaption className="mt-2 text-xs">
              Enhanced · ready for review
            </figcaption>
          </figure>
        ) : (
          <div className="rounded-xl border bg-primary/5 p-5 space-y-3">
            <Sparkles className="text-primary" />
            <strong className="block">A sharper, more polished creative</strong>
            <p className="text-sm leading-6">
              Improve lighting, detail and finishing while keeping the original
              creative as the visual reference. Brand fonts and a balanced text
              hierarchy guide the result.
            </p>
            <p className="text-xs text-muted-foreground">
              Output: {initial.data?.width} × {initial.data?.height}. Generation
              saves a new draft automatically.
            </p>
          </div>
        )}
      </div>
      {!jobId && (
        <fieldset disabled={busy} className="space-y-5 min-w-0">
          <label className="block space-y-2 text-sm font-medium">
            Enhancement direction
            <textarea
              aria-label="Enhancement direction"
              className="min-h-28 w-full rounded-xl border bg-background p-3 font-normal"
              maxLength={8000}
              value={setup.enhancement!.instruction}
              onChange={e =>
                setEdits(previous => ({
                  ...previous,
                  enhancement: {
                    ...setup.enhancement!,
                    instruction: e.target.value,
                  },
                }))
              }
            />
          </label>
          <section className="space-y-2">
            <h3 className="font-semibold">Image model</h3>
            <VisualSelect
              aria-label="Enhancement image model"
              value={setup.modelId}
              showAll
              onChange={e => {
                const row = catalog.data?.find(m => m.id === e.target.value);
                const def = generationModel(row?.routeId || e.target.value);
                if (def)
                  setEdits(previous => ({
                    ...previous,
                    modelId: e.target.value,
                    modelOptions: modelDefaults(def),
                  }));
              }}
            >
              {(catalog.data ?? [])
                .filter(m => {
                  const def = generationModel(m.routeId);
                  return (
                    m.kind === "image" &&
                    m.enabled &&
                    def &&
                    referenceCapacity(def) > 0
                  );
                })
                .map(m => (
                  <option
                    key={m.id}
                    value={m.id}
                    data-image={studioModelArtwork(m.routeId, "image")}
                    data-description={m.maker}
                  >
                    {m.name}
                    {m.variant ? ` · ${m.variant}` : ""}
                  </option>
                ))}
            </VisualSelect>
            {catalog.error && (
              <p role="alert">
                Image models could not be loaded. Reopen Enhance to retry.
              </p>
            )}
          </section>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Model settings
            </summary>
            <div className="mt-3">
              <ModelSettings
                organizationId={organizationId}
                modelId={setup.modelId}
                options={setup.modelOptions}
                presentation="tiles"
                onChange={modelOptions =>
                  setEdits(previous => ({ ...previous, modelOptions }))
                }
              />
            </div>
          </details>
          {initial.data?.canPreserveProductOverlay && (
            <section className="space-y-2">
              <h3 className="font-semibold">Original product overlay</h3>
              <VisualSelect
                aria-label="Preserve product overlay"
                searchable={false}
                showAll
                value={setup.preserveProduct ? "keep" : "off"}
                onChange={e =>
                  setEdits(previous => ({
                    ...previous,
                    preserveProduct: e.target.value === "keep",
                  }))
                }
              >
                <option
                  value="keep"
                  data-description="Keep the original cutouts available for precise placement on the enhanced draft."
                >
                  Preserve overlay
                </option>
                <option
                  value="off"
                  data-description="Use the enhanced artwork without editable original-product layers."
                >
                  Artwork only
                </option>
              </VisualSelect>
              <p className="text-xs text-muted-foreground">
                Requires original product images with a transparent background.
              </p>
            </section>
          )}
        </fieldset>
      )}
      {(error ||
        setupError ||
        quote.error ||
        compatibility ||
        job.error ||
        job.data?.status === "failed") && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error ||
            setupError ||
            job.error?.message ||
            job.data?.errorMessage ||
            compatibility ||
            quote.error?.message}
        </p>
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4">
        {completed ? (
          <>
            <p className="text-sm">
              Saved as a new draft
              {setup.preserveProduct ? " with editable product overlay" : ""}.
            </p>
            <Button
              onClick={() =>
                navigate(libraryAssetLink(`creative:${completed.id}`, "draft"))
              }
            >
              Review enhanced image
            </Button>
          </>
        ) : jobId ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            {job.data?.status === "failed" ? (
              "Generation stopped. Reopen Enhance to try again."
            ) : (
              <>
                <Loader2 className="animate-spin" size={16} />
                Enhancing your image. You can close this; the result will appear
                in Drafts.
              </>
            )}
          </p>
        ) : (
          <>
            <span className="text-sm">
              {ready
                ? `${quote.data!.credits.toLocaleString()} credits`
                : "Review choices to calculate credits"}
            </span>
            <Button disabled={!ready} onClick={enhance}>
              {busy ? (
                <Loader2 className="mr-2 animate-spin" size={16} />
              ) : (
                <Sparkles className="mr-2" size={16} />
              )}
              Enhance image
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
