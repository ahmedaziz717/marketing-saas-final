import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { ActionCredits } from "./ActionCredits";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  constrainProductLayer,
  resizeProductLayer,
  resizeProductLayerFromCorner,
  type ProductResizeCorner,
  type ProductOverlayPlacement,
  type ProductOverlayReplacement,
} from "@shared/productOverlay";

export function ProductOverlayEditor({
  organizationId,
  variantId,
  onSaved,
}: {
  organizationId: number;
  variantId: number;
  onSaved: (key: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Adjust original product
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Place the original product</DialogTitle>
            <DialogDescription>
              Keep the complete creative. Drag and resize the catalog photo to
              cover the generated product, then save a separate version. The
              catalog viewing angle and proportions stay unchanged. Drag the
              product to move it, or drag a corner to resize it without
              stretching.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <OverlayControls
              organizationId={organizationId}
              variantId={variantId}
              onSaved={async key => {
                await onSaved(key);
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OverlayControls({
  organizationId,
  variantId,
  onSaved,
}: {
  organizationId: number;
  variantId: number;
  onSaved: (key: string) => Promise<void>;
}) {
  const [replacements, setReplacements] = useState<ProductOverlayReplacement[]>(
    []
  );
  const [sourceChoice, setSourceChoice] = useState("");
  const [sameView, setSameView] = useState(false);
  const sourceLibrary = trpc.assetLibrary.studioList.useQuery({
    organizationId,
  });
  const query = trpc.creativeBuilder.productOverlay.useQuery(
    { organizationId, variantId, replacements },
    { refetchOnWindowFocus: false }
  );
  const save = trpc.creativeBuilder.saveProductOverlay.useMutation();
  const align = trpc.creativeBuilder.alignProductOverlay.useMutation();
  const [allowUpscale, setAllowUpscale] = useState(false);
  const [notice, setNotice] = useState("");
  const [designReady, setDesignReady] = useState(false);
  const [designFailed, setDesignFailed] = useState(false);
  const [placements, setPlacements] = useState<
    ProductOverlayPlacement[] | null
  >(null);
  const [selected, setSelected] = useState(0);
  const selectLayer = (index: number) => {
    if (index === selected) return;
    setSelected(index);
    setSourceChoice("");
    setSameView(false);
  };
  const [opacity, setOpacity] = useState(100);
  const [original, setOriginal] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    index: number;
    layer: ProductOverlayPlacement;
    corner?: ProductResizeCorner;
  } | null>(null);
  const data = query.data;
  if (!data)
    return (
      <div>
        <p role={query.error ? "alert" : "status"}>
          {query.error?.message || "Loading the original design and product…"}
        </p>
        {replacements.length > 0 && (
          <Button
            onClick={() => {
              setReplacements([]);
              setSourceChoice("");
              setSameView(false);
            }}
          >
            Keep saved source
          </Button>
        )}
      </div>
    );
  const sourceProportionsChanged = data.layers.some(
    layer =>
      layer.height !== undefined &&
      Math.abs(layer.width / layer.aspect - layer.height) > 1
  );
  const layers =
    placements ??
    data.layers.map(({ left, top, width, height, aspect }) => {
      if (height !== undefined && Math.abs(width / aspect - height) > 1) {
        // Legacy independent dimensions stretched the product. Cover that footprint
        // proportionally in this unsaved preview; never mutate the saved original.
        const coverWidth = Math.max(width, height * aspect);
        return resizeProductLayer(
          {
            left: left + width / 2 - coverWidth / 2,
            top: top + height / 2 - coverWidth / aspect / 2,
            width,
          },
          coverWidth,
          aspect,
          data
        );
      }
      return constrainProductLayer({ left, top, width, height }, aspect, data);
    });
  const enlarged = layers.some(
    (layer, i) =>
      layer.width > data.layers[i].sourceWidth ||
      (layer.height ?? layer.width / data.layers[i].aspect) >
        data.layers[i].sourceHeight
  );
  const sourceOptions = [
    ...(data.replacementSources ?? []).filter(
      source => source.productId === data.layers[selected].productId
    ),
    ...(sourceLibrary.data ?? []).filter(
      asset =>
        asset.origin === "uploaded" &&
        asset.purpose === "source" &&
        asset.sourceType === "product" &&
        asset.state === "approved" &&
        ["image/png", "image/webp"].includes(asset.mimeType)
    ),
  ];
  const update = (index: number, value: Partial<ProductOverlayPlacement>) => {
    setOriginal(false);
    setAllowUpscale(false);
    setNotice("");
    setPlacements(
      layers.map((layer, i) =>
        i === index
          ? constrainProductLayer(
              { ...layer, ...value },
              data.layers[i].aspect,
              data
            )
          : layer
      )
    );
  };
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div
        ref={canvas}
        className="relative self-start overflow-hidden rounded-lg bg-muted touch-none"
        style={{ aspectRatio: `${data.width}/${data.height}` }}
        onPointerMove={event => {
          const active = drag.current,
            bounds = canvas.current?.getBoundingClientRect();
          if (!active || !bounds || bounds.width <= 0 || bounds.height <= 0)
            return;
          if (active.corner) {
            update(
              active.index,
              resizeProductLayerFromCorner(
                active.layer,
                active.corner,
                {
                  x: ((event.clientX - active.x) * data.width) / bounds.width,
                  y: ((event.clientY - active.y) * data.height) / bounds.height,
                },
                data.layers[active.index].aspect,
                data
              )
            );
            return;
          }
          update(active.index, {
            left:
              active.left +
              ((event.clientX - active.x) * data.width) / bounds.width,
            top:
              active.top +
              ((event.clientY - active.y) * data.height) / bounds.height,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        aria-label="Product placement canvas"
      >
        <img
          key={query.dataUpdatedAt}
          src={data.designUrl}
          onLoad={() => {
            setDesignReady(true);
            setDesignFailed(false);
          }}
          onError={() => {
            setDesignReady(false);
            setDesignFailed(true);
          }}
          alt="Original complete creative design"
          className="block h-full w-full"
          draggable={false}
        />
        {!original &&
          layers.map((layer, i) => (
            <img
              key={i}
              src={data.layers[i].preview}
              alt={`Original product ${i + 1}`}
              draggable={false}
              className={`absolute cursor-move select-none ${selected === i ? "outline outline-1 outline-dashed outline-white/60" : ""}`}
              style={{
                left: `${(100 * layer.left) / data.width}%`,
                top: `${(100 * layer.top) / data.height}%`,
                width: `${(100 * layer.width) / data.width}%`,
                height: `${(100 * (layer.height ?? layer.width / data.layers[i].aspect)) / data.height}%`,
                objectFit: "contain",
                opacity: opacity / 100,
              }}
              onPointerDown={event => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                selectLayer(i);
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  left: layer.left,
                  top: layer.top,
                  index: i,
                  layer: { ...layer },
                };
              }}
            />
          ))}
        {!original &&
          (["nw", "ne", "sw", "se"] as const).map(corner => {
            const layer = layers[selected];
            const west = corner.includes("w"),
              north = corner.includes("n");
            return (
              <button
                key={corner}
                type="button"
                aria-label={`Resize product from ${corner} corner`}
                className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-primary shadow touch-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  left: `${(100 * (layer.left + (west ? 0 : layer.width))) / data.width}%`,
                  top: `${(100 * (layer.top + (north ? 0 : (layer.height ?? layer.width / data.layers[selected].aspect)))) / data.height}%`,
                  cursor:
                    corner === "nw" || corner === "se"
                      ? "nwse-resize"
                      : "nesw-resize",
                }}
                onPointerDown={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    x: event.clientX,
                    y: event.clientY,
                    left: layer.left,
                    top: layer.top,
                    index: selected,
                    layer: { ...layer },
                    corner,
                  };
                }}
                onKeyDown={event => {
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const step = event.shiftKey ? 10 : 1;
                  update(
                    selected,
                    resizeProductLayerFromCorner(
                      layer,
                      corner,
                      {
                        x:
                          event.key === "ArrowLeft"
                            ? -step
                            : event.key === "ArrowRight"
                              ? step
                              : 0,
                        y:
                          event.key === "ArrowUp"
                            ? -step
                            : event.key === "ArrowDown"
                              ? step
                              : 0,
                      },
                      data.layers[selected].aspect,
                      data
                    )
                  );
                }}
              />
            );
          })}
      </div>
      <div className="space-y-4">
        {!designReady && (
          <div role={designFailed ? "alert" : "status"} className="text-sm">
            <p>
              {designFailed
                ? "The original design could not be displayed. Reload it before aligning or saving."
                : "Loading the original design preview..."}
            </p>
            {designFailed && (
              <Button
                variant="outline"
                onClick={async () => {
                  setDesignFailed(false);
                  const refreshed = await query.refetch();
                  if (refreshed.error) setDesignFailed(true);
                }}
              >
                Reload original design
              </Button>
            )}
          </div>
        )}
        <p role="status" className="text-sm">
          {placements || replacements.length || sourceProportionsChanged
            ? "You are previewing an unsaved placement. Save as a new version to keep it."
            : data.applied
              ? "The original product is already placed. Adjust it only if needed."
              : data.automaticFailure === "source_resolution"
                ? "Automatic placement needs a sharper source or accepted enlargement. The visible product layer is an unsaved preview: move or resize it to cover the generated product."
                : "This saved version has no applied original-product placement. Starting position only: the visible layer has not been matched to the generated product. Move it and drag a corner to align it. The complete design stays unchanged until you save a new version. Opening this editor does not run alignment or spend credits."}
        </p>
        <p className="text-sm">
          {replacements.length ? "Preview cutout" : "Saved cutout"}:{" "}
          {data.layers[selected].sourceWidth} ×{" "}
          {data.layers[selected].sourceHeight} px. This version keeps its
          original source; catalog updates do not replace it.
        </p>
        <details>
          <summary className="cursor-pointer text-sm">
            Recover with a sharper original
          </summary>
          <p className="my-2 text-sm">
            Choose a catalog photo of this product, or upload and approve a
            transparent product source in Asset Library. Verify the exact same
            configuration and camera view. This previews a replacement; saving
            creates a new version.
          </p>
          {sourceLibrary.error && (
            <p role="alert">Could not load product sources.</p>
          )}
          <select
            aria-label="Higher-resolution product source"
            className="w-full border rounded bg-background p-2"
            value={sourceChoice}
            onChange={event => {
              setSourceChoice(event.target.value);
              setSameView(false);
            }}
          >
            <option value="">Choose an approved product source</option>
            {sourceOptions.map(asset => (
              <option key={asset.key} value={asset.key}>
                {asset.name}
              </option>
            ))}
          </select>
          {sourceOptions.find(item => item.key === sourceChoice)?.url && (
            <img
              alt="Replacement source to verify"
              src={sourceOptions.find(item => item.key === sourceChoice)!.url}
              className="my-2 max-h-48 object-contain"
            />
          )}
          <label className="my-2 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={sameView}
              onChange={event => setSameView(event.target.checked)}
            />
            I verified the same product, configuration and camera view.
          </label>
          <Button
            variant="outline"
            disabled={
              !sourceChoice || !sameView || save.isPending || align.isPending
            }
            onClick={() => {
              const asset = sourceOptions.find(
                item => item.key === sourceChoice
              );
              if (!asset) return;
              setReplacements(old => [
                ...old.filter(item => item.index !== selected),
                {
                  index: selected,
                  key: asset.key,
                  revision: asset.revision,
                  sameViewConfirmed: true,
                },
              ]);
              setAllowUpscale(false);
              setOriginal(false);
              setNotice("");
              setError("");
            }}
          >
            Preview replacement
          </Button>
        </details>
        <Button
          variant="outline"
          className="w-full flex-wrap gap-1"
          disabled={!designReady || align.isPending || save.isPending}
          onClick={async () => {
            setError("");
            setNotice("");
            try {
              const result = await align.mutateAsync({
                organizationId,
                variantId,
                replacements,
              });
              setAllowUpscale(false);
              setPlacements(result.layers);
              setOriginal(false);
              setNotice(
                result.sameAngle
                  ? "Alignment suggested. Check source resolution, edges and text before saving."
                  : "The generated product uses a different camera angle. This placement is approximate; resizing cannot recover a different 3D view."
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not suggest placement."
              );
            }
          }}
        >
          {align.isPending ? "Finding product…" : "Suggest alignment"}
          <ActionCredits
            organizationId={organizationId}
            operation="creativeBuilder.alignProductOverlay"
          />
        </Button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}

        {layers.length > 1 && (
          <ChoiceField className="block text-sm">
            Product layer
            <VisualSelect
              className="mt-1 w-full rounded border bg-background p-2"
              value={selected}
              onChange={e => selectLayer(Number(e.target.value))}
            >
              {layers.map((_, i) => (
                <option key={i} value={i}>
                  Product {i + 1}
                </option>
              ))}
            </VisualSelect>
          </ChoiceField>
        )}
        <section
          className="space-y-3 rounded-lg border p-3"
          aria-label="Product size and position"
        >
          <div className="flex items-center justify-between text-sm">
            <strong>Size & position</strong>
            <span className="text-xs text-muted-foreground">
              Proportions locked
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag a corner to resize. Measurements use the full {data.width} ×{" "}
            {data.height} px canvas, not this preview.
          </p>
          <label className="block text-sm">
            Product size
            <input
              type="range"
              className="mt-2 w-full"
              aria-label="Product size"
              min={1}
              max={Math.floor(
                Math.min(data.width, data.height * data.layers[selected].aspect)
              )}
              value={layers[selected].width}
              onChange={e =>
                update(
                  selected,
                  resizeProductLayer(
                    layers[selected],
                    Number(e.target.value),
                    data.layers[selected].aspect,
                    data
                  )
                )
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["width", "height", "left", "top"] as const).map(field => (
              <label
                key={field}
                className="block text-xs text-muted-foreground"
              >
                {
                  { width: "Width", height: "Height", left: "X", top: "Y" }[
                    field
                  ]
                }{" "}
                · px
                <input
                  className="mt-1 w-full rounded border bg-background p-2 text-sm text-foreground"
                  aria-label={`${field} in pixels`}
                  type="number"
                  min={field === "width" || field === "height" ? 1 : 0}
                  value={
                    field === "height"
                      ? (layers[selected].height ??
                        Math.round(
                          layers[selected].width / data.layers[selected].aspect
                        ))
                      : layers[selected][field]
                  }
                  onChange={e => {
                    if (!e.target.value) return;
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    update(
                      selected,
                      field === "width" || field === "height"
                        ? resizeProductLayer(
                            layers[selected],
                            field === "width"
                              ? n
                              : n * data.layers[selected].aspect,
                            data.layers[selected].aspect,
                            data
                          )
                        : { [field]: n }
                    );
                  }}
                />
              </label>
            ))}
          </div>
        </section>
        <label className="block text-sm">
          Alignment opacity · {opacity}%
          <input
            type="range"
            className="mt-2 w-full"
            min={10}
            max={100}
            value={opacity}
            onChange={e => setOpacity(Number(e.target.value))}
          />
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={original}
            onChange={e => setOriginal(e.target.checked)}
          />
          Compare with original design
        </label>
        <p className="text-xs text-muted-foreground">
          Opacity is for alignment only; saved products are fully opaque
          wherever the source is opaque. Check edges and text before saving.
          Different camera angles cannot be matched exactly with resizing.
        </p>
        {enlarged && (
          <div role="status" className="space-y-2 text-sm">
            <p>
              The catalog original is smaller than this placement. Resampling
              can cover the generated product but cannot add detail. Use the
              largest original available and check the edges.
            </p>
            {
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={allowUpscale}
                  onChange={event => setAllowUpscale(event.target.checked)}
                />
                Accept enlargement for this version
              </label>
            }
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          disabled={
            !designReady ||
            (enlarged && !allowUpscale) ||
            save.isPending ||
            align.isPending
          }
          onClick={async () => {
            setError("");
            try {
              const result = await save.mutateAsync({
                organizationId,
                variantId,
                revision: data.revision,
                layers,
                allowUpscale: enlarged && allowUpscale,
                replacements,
              });
              await onSaved(result.key);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not save this version."
              );
            }
          }}
        >
          {save.isPending ? "Saving…" : "Save as new version"}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={align.isPending || save.isPending}
          onClick={() => {
            drag.current = null;
            setPlacements(null);
            setReplacements([]);
            setSourceChoice("");
            setSameView(false);
            setNotice("");
            setError("");
            setAllowUpscale(false);
            setOriginal(false);
            setOpacity(100);
          }}
        >
          Reset placement
        </Button>
      </div>
    </div>
  );
}
