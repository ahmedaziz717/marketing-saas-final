import { StudioCategories } from "./configurator/StudioCategories";
import { useState } from "react";
import { Check, Expand, ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  parseWorkflowMediaSelection,
  workflowMediaOptions,
  workflowProductContent,
  type AppField,
  type WorkflowMediaSelection,
} from "@shared/workflowInputs";
import { AssetUploadDialog } from "./AssetUploadDialog";
import { CatalogGallery } from "./CatalogGallery";
import { catalogCardGallery } from "@shared/catalogMedia";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import "@/styles/workflowMedia.css";

export function WorkflowMediaControl({
  field,
  value,
  onChange,
  organizationId,
  preview = false,
  summary = false,
}: {
  field: AppField;
  value: string;
  onChange: (value: string) => void;
  organizationId: number;
  preview?: boolean;
  summary?: boolean;
}) {
  const kind = field.kind as "asset" | "product";
  const options = workflowMediaOptions(field);
  const selected = parseWorkflowMediaSelection(value, kind);
  const [source, setSource] = useState<"products" | "assets">(
    kind === "product" ||
      (options.productImages &&
        !selected?.imageKey?.match(/^(asset|creative):/))
      ? "products"
      : "assets"
  );
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [upload, setUpload] = useState(false);
  const [expanded, setExpanded] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const query = trpc.workflows.mediaChoices.useQuery({
    organizationId,
    kind,
    selectedValue: selected
      ? JSON.stringify({
          productId: selected.productId,
          imageKey: selected.imageKey,
        })
      : "",
    search,
    offset,
  });
  const data = query.data
    ? {
        ...query.data,
        assets: query.data.assets.filter(
          a => !options.finishedAssetsOnly || a.purpose === "finished"
        ),
      }
    : undefined;
  const product = data?.products.find(
    p =>
      p.id === selected?.productId ||
      p.images.some(i => i.key === selected?.imageKey)
  );
  const photo = product?.images.find(i => i.key === selected?.imageKey);
  const asset = data?.assets.find(a => a.key === selected?.imageKey);
  const chosen = photo
    ? { ...photo, name: product!.name }
    : (asset ??
      (product
        ? { name: product.name, url: product.images[0]?.url }
        : undefined));
  const content =
    product && selected
      ? workflowProductContent(
          field,
          /^\d+$/.test(value) && !field.media
            ? {
                ...selected,
                featuredSpecKeys: Object.keys(product.specifications).slice(
                  0,
                  20
                ),
              }
            : selected,
          product.specifications
        )
      : null;
  const tab =
    kind === "product" || !options.approvedAssets
      ? "products"
      : !options.productImages
        ? "assets"
        : source;
  const changeProduct = (patch: Partial<WorkflowMediaSelection>) => {
    if (!selected) return;
    onChange(JSON.stringify({ ...selected, ...patch }));
  };
  const selectProduct = (
    p: NonNullable<typeof data>["products"][number],
    imageKey?: string
  ) => {
    if (p.unavailableReason || field.locked) return;
    onChange(
      JSON.stringify(
        product?.id === p.id && selected
          ? {
              ...selected,
              ...(/^\d+$/.test(value) && !field.media ? content : {}),
              productId: p.id,
              imageKey,
            }
          : {
              productId: p.id,
              imageKey,
              featuredSpecKeys: [],
              includePrice: false,
              includeDescription: true,
              includeLink: false,
            }
      )
    );
  };
  const tile = (
    key: string,
    name: string,
    url: string | undefined,
    detail: string,
    active: boolean,
    select: () => void
  ) => (
    <article
      className={`wf-media-tile${active ? " is-selected" : ""}`}
      key={key}
    >
      <button
        type="button"
        className="wf-media-select"
        disabled={field.locked}
        aria-pressed={active}
        aria-label={`Select ${name}`}
        onClick={select}
      >
        <div className="wf-media-art">
          {url ? (
            <img src={url} alt={name} loading="lazy" />
          ) : (
            <ImageIcon size={32} />
          )}
          <span className="wf-media-check">
            {active ? <Check size={16} /> : "+"}
          </span>
        </div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </button>
      {url && (
        <button
          type="button"
          className="wf-media-expand"
          aria-label={`Preview ${name}`}
          onClick={() => setExpanded({ name, url })}
        >
          <Expand size={15} />
        </button>
      )}
    </article>
  );
  return (
    <div className={`wf-media${summary ? " wf-media-summary" : ""}`}>
      {query.isLoading && <p role="status">Loading images…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message}{" "}
          <button type="button" onClick={() => query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {chosen && (
        <div className="wf-media-chosen">
          {chosen.url && (
            <button
              type="button"
              aria-label={`Preview selected ${chosen.name}`}
              onClick={() =>
                setExpanded({ name: chosen.name, url: chosen.url! })
              }
            >
              <img src={chosen.url} alt={chosen.name} />
            </button>
          )}
          <div>
            <small>Selected {product ? "product" : "asset"}</small>
            <strong>{chosen.name}</strong>
            {product?.unavailableReason && (
              <p role="alert">
                {product.unavailableReason} Your saved selection is retained.
              </p>
            )}
            {content && (
              <p>
                {content.featuredSpecKeys.length
                  ? content.featuredSpecKeys.join(" · ")
                  : "No feature bullets"}{" "}
                ·{" "}
                {content.includePrice
                  ? `Show price: ${product?.currency} ${product?.price}`
                  : "No price"}
              </p>
            )}
          </div>
          {!summary && !field.locked && !field.required && (
            <button type="button" onClick={() => onChange("")}>
              Clear
            </button>
          )}
        </div>
      )}
      {value && data && !chosen && (
        <p role="alert">
          This selection is unavailable or awaiting approval. Choose an approved
          item.
        </p>
      )}
      {!summary && (
        <>
          <div className="wf-media-toolbar">
            {kind === "asset" && (
              <StudioCategories
                compact
                label="Image source"
                current={tab}
                items={[
                  ...(options.productImages
                    ? [{ id: "products", title: "Product images" }]
                    : []),
                  ...(options.approvedAssets
                    ? [{ id: "assets", title: "Approved assets" }]
                    : []),
                ]}
                onSelect={id => {
                  setSource(id as "products" | "assets");
                  setOffset(0);
                }}
              />
            )}
            {kind === "asset" &&
              options.allowUpload &&
              options.approvedAssets && (
                <button
                  type="button"
                  className="wf-media-upload"
                  disabled={field.locked || preview || !data}
                  onClick={() => setUpload(true)}
                >
                  <Upload size={15} />
                  Upload image
                </button>
              )}
          </div>
          {preview && options.allowUpload && (
            <small>Uploads are available when running the App.</small>
          )}
          {!field.locked && (
            <input
              aria-label={
                tab === "products"
                  ? "Search products"
                  : "Search approved assets"
              }
              placeholder={
                tab === "products"
                  ? "Search products, services or plans…"
                  : "Search approved assets…"
              }
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          )}
          <div
            className={
              tab === "products" ? "wf-media-product-grid" : "wf-media-grid"
            }
          >
            {tab === "products"
              ? data?.products
                  .filter(p => data.pageIds.includes(p.id))
                  .map(p => {
                    const gallery = catalogCardGallery(
                      p.images,
                      p.mediaGroups,
                      p.representedGroupIds
                    );
                    return (
                      <article
                        key={p.id}
                        aria-label={`Product ${p.name}`}
                        className={`wf-media-product-card${product?.id === p.id ? " is-selected" : ""}`}
                      >
                        <h3>{p.name}</h3>
                        {p.unavailableReason && (
                          <p role="status">{p.unavailableReason}</p>
                        )}
                        {p.componentKind && (
                          <p className="mb-2 text-xs text-muted-foreground">
                            {p.componentKind} Option
                          </p>
                        )}
                        <CatalogGallery
                          name={p.name}
                          groups={gallery.groups}
                          primaryId={p.primaryImageId}
                          images={gallery.images.map(i => ({
                            id: Number(i.key.split(":")[1]),
                            url: i.url,
                            isPrimary: i.isPrimary,
                            media: i.media,
                          }))}
                          selected={
                            selected?.imageKey?.startsWith("product_image:")
                              ? Number(selected.imageKey.split(":")[1])
                              : null
                          }
                          onSelect={
                            field.locked || p.unavailableReason
                              ? undefined
                              : id => {
                                  const image = p.images.find(
                                    i => i.key === `product_image:${id}`
                                  );
                                  if (image) selectProduct(p, image.key);
                                }
                          }
                        />
                        {!!p.representedGroupIds?.length && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Component options have their own catalog cards. Only
                            approved items can be used.
                          </p>
                        )}
                        {kind === "product" && !p.images.length && (
                          <button
                            type="button"
                            disabled={field.locked || !!p.unavailableReason}
                            aria-pressed={product?.id === p.id}
                            onClick={() => selectProduct(p)}
                          >
                            Select {p.name}
                          </button>
                        )}
                      </article>
                    );
                  })
              : data?.assets
                  .filter(a =>
                    a.name.toLowerCase().includes(search.toLowerCase())
                  )
                  .map(a =>
                    tile(
                      a.key,
                      a.name,
                      a.url,
                      `${a.width && a.height ? `${a.width} × ${a.height} · ` : ""}Approved`,
                      selected?.imageKey === a.key,
                      () => onChange(a.key)
                    )
                  )}
          </div>
          {data &&
            (tab === "products"
              ? !data.products
                  .filter(p => data.pageIds.includes(p.id))
                  .some(p => kind === "product" || p.images.length)
              : !data.assets.some(a =>
                  a.name.toLowerCase().includes(search.toLowerCase())
                )) && (
              <p className="wf-media-empty">
                {tab === "products"
                  ? "No approved catalog items match. Add or approve products in your catalog."
                  : "No approved assets match. Approve an image in Asset Library to use it here."}
              </p>
            )}
          {tab === "products" && (offset > 0 || data?.nextOffset != null) && (
            <div className="wf-media-pagination">
              <button
                type="button"
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 24))}
              >
                Previous products
              </button>
              <button
                type="button"
                disabled={data?.nextOffset == null}
                onClick={() => setOffset(data?.nextOffset ?? offset)}
              >
                More products
              </button>
            </div>
          )}
          {product && selected && content && (
            <fieldset
              disabled={field.locked || !!product.unavailableReason}
              className="wf-media-content"
            >
              <legend>Product content</legend>
              <p>Choose what this workflow may feature in its output.</p>
              <h4>Bullets to feature</h4>
              {Object.entries(product.specifications)
                .filter(([, v]) => v?.trim())
                .map(([key, detail]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      disabled={
                        options.bullets !== "choose" ||
                        (!content.featuredSpecKeys.includes(key) &&
                          content.featuredSpecKeys.length >= 20)
                      }
                      checked={content.featuredSpecKeys.includes(key)}
                      onChange={e =>
                        changeProduct({
                          featuredSpecKeys: e.target.checked
                            ? [...content.featuredSpecKeys, key]
                            : content.featuredSpecKeys.filter(k => k !== key),
                        })
                      }
                    />
                    <span>
                      <strong>{key}</strong>
                      <small>{detail}</small>
                    </span>
                  </label>
                ))}
              {!Object.values(product.specifications).some(v => v?.trim()) && (
                <small>No feature bullets saved in this catalog item.</small>
              )}
              {(
                [
                  [
                    "price",
                    "includePrice",
                    "Show price",
                    product.price && product.currency
                      ? `${product.currency} ${product.price}`
                      : "No verified price available",
                  ],
                  [
                    "description",
                    "includeDescription",
                    "Include description",
                    product.description || "No description saved",
                  ],
                  [
                    "link",
                    "includeLink",
                    "Include product link",
                    product.productUrl,
                  ],
                ] as const
              ).map(([setting, flag, label, detail]) => (
                <label key={setting}>
                  <input
                    type="checkbox"
                    disabled={
                      options[setting] !== "choose" ||
                      (setting === "price" &&
                        !(product.price && product.currency))
                    }
                    checked={content[flag]}
                    onChange={e => changeProduct({ [flag]: e.target.checked })}
                  />
                  <span>
                    <strong>
                      {label}
                      {options[setting] !== "choose"
                        ? " · Set by workflow"
                        : ""}
                    </strong>
                    <small>{detail}</small>
                  </span>
                </label>
              ))}
              {options.bullets !== "choose" && (
                <small>Bullet selection is set by the workflow creator.</small>
              )}
            </fieldset>
          )}
        </>
      )}
      {summary && content && (
        <p className="wf-media-content-summary">
          {content.includeDescription
            ? "Description included"
            : "No description"}{" "}
          · {content.includeLink ? "Product link included" : "No product link"}
        </p>
      )}
      <Dialog
        open={!!expanded}
        onOpenChange={open => !open && setExpanded(null)}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{expanded?.name ?? "Image preview"}</DialogTitle>
            <DialogDescription className="sr-only">
              Full image preview.
            </DialogDescription>
          </DialogHeader>
          {expanded && (
            <img
              src={expanded.url}
              alt={expanded.name}
              className="max-h-[75vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
      {upload && (
        <AssetUploadDialog
          open
          organizationId={organizationId}
          role={data?.role ?? "creator"}
          parent={null}
          defaultDisposition="submit"
          defaultPurpose="source"
          mediaFilter="image"
          onClose={() => setUpload(false)}
          onSaved={() => query.refetch()}
          onComplete={(key, state) => {
            setUpload(false);
            setSource("assets");
            setSearch("");
            if (state === "approved") onChange(key);
            else
              toast.info(
                "Image uploaded for review. It will appear in Approved assets after approval."
              );
          }}
        />
      )}
    </div>
  );
}
