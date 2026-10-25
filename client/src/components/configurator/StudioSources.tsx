import { catalogDefaultImage } from "@shared/catalogMedia";
import { CatalogGallery } from "../CatalogGallery";
import type {
  CatalogImageMedia,
  CatalogMediaGroupSummary,
} from "@shared/catalogMedia";
import { ProductPhotoGroups } from "../ProductPhotoGroups";
import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { useEffect, useState } from "react";
import { readStudioDraft, writeStudioDraft } from "@/lib/studioDrafts";
import { Link } from "wouter";
import {
  Film,
  Image,
  Link2,
  Package,
  Upload,
  Building2,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  PROMOTION_TYPES,
  selectedProductImageIds,
  creativeProductViewCount,
  type CreativeSetup,
} from "@shared/creativeBuilder";
import { videoReferenceCount, type VideoSetup } from "@shared/videoCreation";
import type { LibraryAsset } from "@shared/assetLibrary";
import { generationModel, referenceCapacity } from "@shared/modelCatalog";
import { AssetUploadDialog } from "@/components/AssetUploadDialog";
import { StudioCard } from "./StudioCard";
import { PageUrlSource } from "./PageUrlSource";

type Product = {
  id: number;
  name: string;
  recordType?: string;
  sku?: string | null;
  images: Array<{
    id: number;
    url: string;
    isPrimary?: number | boolean;
    media?: CatalogImageMedia | null;
  }>;
  mediaGroups?: CatalogMediaGroupSummary[] | null;
};
export function StudioSources({
  draftKey,
  organizationId,
  role,
  kind,
  image,
  video,
  products,
  assets,
  search,
  updateImage,
  updateVideo,
  onUploaded,
  onModels,
  onProductDetails,
}: {
  draftKey?: string | null;
  organizationId: number;
  role: string;
  kind: "image" | "video";
  image: CreativeSetup;
  video: VideoSetup;
  products: Product[];
  assets: LibraryAsset[];
  search: string;
  updateImage: (patch: Partial<CreativeSetup>) => void;
  updateVideo: (patch: Partial<VideoSetup>) => void;
  onUploaded: () => Promise<unknown>;
  onModels?: () => void;
  onProductDetails?: () => void;
}) {
  const [tab, setTab] = useState(
      (readStudioDraft(draftKey ? `${draftKey}:tab` : null, raw => {
        try {
          const value = JSON.parse(raw);
          return ["url", "business", "catalog", "video", "upload"].includes(
            value
          )
            ? value
            : null;
        } catch {
          return null;
        }
      }) ??
        (kind === "image"
          ? image.promotion?.sourceUrl
          : video.promotion?.sourceUrl))
        ? "url"
        : kind === "image" && image.promotionMode === "platform"
          ? "business"
          : "catalog"
    ),
    [upload, setUpload] = useState(false),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    writeStudioDraft(draftKey ? `${draftKey}:tab` : null, tab);
  }, [draftKey, tab]);
  const isImage = kind === "image";
  const referenceLimit = isImage
    ? 9
    : 30 -
      video.people.length -
      (video.logoAssetId &&
      !video.imageKeys.includes(`asset:${video.logoAssetId}`)
        ? 1
        : 0);
  const videoModel = generationModel(video.modelId ?? "");
  const catalog = trpc.video.catalogImages.useQuery(
    { organizationId, search, offset },
    { enabled: !isImage && tab === "catalog" }
  );
  const selectedCatalog = trpc.video.catalogImages.useQuery(
    {
      organizationId,
      selectedOnly: true,
      selectedKeys: video.imageKeys.filter(k => k.startsWith("product_image:")),
    },
    { enabled: !isImage }
  );
  const sourceKeys = isImage ? (image.sourceAssetKeys ?? []) : video.imageKeys;
  const selectedItems = isImage
    ? [
        ...image.products.flatMap(p =>
          (selectedProductImageIds(p).length
            ? selectedProductImageIds(p)
            : [null]
          ).map(imageId => ({
            key: `product:${p.productId}:${imageId ?? "service"}`,
            name:
              products.find(i => i.id === p.productId)?.name ??
              "Product unavailable",
            url: products
              .find(i => i.id === p.productId)
              ?.images.find(i => i.id === imageId)?.url,
            video: false,
          }))
        ),
        ...sourceKeys.map(key => ({
          key,
          name: assets.find(a => a.key === key)?.name ?? "Image unavailable",
          url: assets.find(a => a.key === key)?.url,
          video: false,
        })),
      ]
    : [
        ...video.imageKeys,
        ...(video.sourceVideoKey ? [video.sourceVideoKey] : []),
      ].map(key => {
        const a =
          assets.find(a => a.key === key) ??
          selectedCatalog.data?.items.find(i => i.key === key);
        return {
          key,
          name:
            a?.name ??
            (selectedCatalog.isLoading
              ? "Loading product…"
              : "Reference unavailable"),
          url: a?.url,
          video: key === video.sourceVideoKey,
        };
      });
  function toggleProductImage(productId: number, imageId: number) {
    const current = image.products.find(p => p.productId === productId);
    const ids = current
      ? selectedProductImageIds(current).filter(
          (id): id is number => id != null
        )
      : [];
    const removing = ids.includes(imageId);
    if (
      !removing &&
      (creativeProductViewCount(image) >= 12 ||
        ids.length >= (image.productMode === "together" ? 1 : 4) ||
        (!current &&
          image.productMode === "together" &&
          image.products.length >= 3))
    )
      return;
    const next = removing
      ? ids.filter(id => id !== imageId)
      : [...ids, imageId];
    updateImage({
      promotionMode: "offerings",
      products: !next.length
        ? image.products.filter(p => p.productId !== productId)
        : current
          ? image.products.map(p =>
              p.productId === productId
                ? { ...p, imageId: next[0], imageIds: next }
                : p
            )
          : [
              ...image.products,
              {
                productId,
                imageId: next[0],
                imageIds: next,
                featuredSpecKeys: [],
                includePrice: false,
              },
            ],
    });
  }
  function remove(key: string) {
    if (isImage) {
      if (key.startsWith("product:")) {
        const [, productId, imageId] = key.split(":");
        if (imageId === "service")
          updateImage({
            products: image.products.filter(
              p => p.productId !== Number(productId)
            ),
          });
        else toggleProductImage(Number(productId), Number(imageId));
      } else
        updateImage({ sourceAssetKeys: sourceKeys.filter(k => k !== key) });
    } else if (key === video.sourceVideoKey)
      updateVideo({ sourceVideoKey: null });
    else updateVideoSources(video.imageKeys.filter(k => k !== key));
  }
  function updateVideoSources(imageKeys: string[]) {
    const removed = video.imageKeys.filter(key => !imageKeys.includes(key));
    const known = [
      ...(selectedCatalog.data?.items ?? []),
      ...(catalog.data?.items ?? []),
    ];
    const removedProductIds = new Set(
      known
        .filter(item => removed.includes(item.key))
        .map(item => item.product?.id)
    );
    const remainingProductIds = new Set(
      known
        .filter(item => imageKeys.includes(item.key))
        .map(item => item.product?.id)
    );
    updateVideo({
      imageKeys,
      productSelections: (video.productSelections ?? []).filter(
        p =>
          !removedProductIds.has(p.productId) ||
          remainingProductIds.has(p.productId)
      ),
    });
  }
  function toggleSource(key: string) {
    const next = sourceKeys.includes(key)
      ? sourceKeys.filter(k => k !== key)
      : sourceKeys.length < referenceLimit
        ? [...sourceKeys, key]
        : sourceKeys;
    if (isImage)
      updateImage({
        sourceAssetKeys: next,
        promotionMode:
          image.promotionMode === "platform" ? "platform" : "offerings",
      });
    else updateVideoSources(next);
  }
  const sourceTabs = [
    ["catalog", "Product catalog", "Choose product photos", Package],
    ["assets", "Image assets", "Reuse your saved images", Image],
    ["url", "Page URL", "Product, service or page content", Link2],
    ["video", "Source video", "Edit or extend a clip", Film],
    ["upload", "Upload", "Add images or video", Upload],
    ["business", "Describe manually", "Start with your own brief", Building2],
  ] as const;
  return (
    <div className="cfg-source-browser">
      {!isImage && (
        <div className="cfg-video-references">
          <strong>Reference images · optional</strong>
          <p>
            Start with your idea alone, or select multiple images from the
            catalog and your saved assets.
          </p>
          <span>
            {video.imageKeys.length}{" "}
            {video.imageKeys.length === 1 ? "image" : "images"} selected
            {video.people.length
              ? ` + ${video.people.length} people references`
              : ""}
            {video.logoAssetId ? " + brand logo" : ""}
          </span>
          {videoModel && (
            <p>
              {referenceCapacity(videoModel)
                ? `${videoModel.name} accepts up to ${Math.min(30, referenceCapacity(videoModel))} image references.`
                : `${videoModel.name} is in prompt-only mode.`}{" "}
              {videoModel.providerModel.startsWith("bytedance/seedance-2.5/") &&
              ["create"].includes(video.mode)
                ? "Its prompt and reference modes follow your selection."
                : "Some models require an image or source clip."}
            </p>
          )}
          <div className="cfg-actions">
            {videoReferenceCount(video) > 0 && (
              <button
                type="button"
                onClick={() =>
                  updateVideo({
                    imageKeys: [],
                    productSelections: [],
                    people: [],
                    logoAssetId: null,
                  })
                }
              >
                Clear image references
              </button>
            )}
            {onModels && (
              <button type="button" onClick={onModels}>
                Explore video models
              </button>
            )}
          </div>
        </div>
      )}
      {isImage && (
        <label className="cfg-preserve-product">
          <ShieldCheck size={22} aria-hidden="true" />
          <span>
            <strong>Preserve original product</strong>
            <small>
              Keep the complete AI design, then align the original product as an
              editable layer. Requires a transparent PNG or WebP cutout.
            </small>
            {image.preserveProduct && (
              <small>
                Adjust product size and position in the result, then save a
                separate version. The complete original design stays saved.
              </small>
            )}
          </span>
          <input
            type="checkbox"
            checked={!!image.preserveProduct}
            onChange={e => updateImage({ preserveProduct: e.target.checked })}
          />
        </label>
      )}
      {!!selectedItems.length && (
        <section className="cfg-selected-sources" aria-label="Selected sources">
          <div className="cfg-choice-count">
            <strong>Your selected sources</strong>
            <span>{selectedItems.length} selected</span>
          </div>
          <div className="cfg-selected-source-grid">
            {selectedItems.map(item => (
              <div className="cfg-source-thumb" key={item.key}>
                {item.url ? (
                  item.video ? (
                    <video src={item.url} controls preload="metadata" />
                  ) : (
                    <img src={item.url} alt={item.name} />
                  )
                ) : (
                  <span className="cfg-thumb-empty">
                    <Image size={24} />
                  </span>
                )}
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.video
                      ? "Source video"
                      : item.key.startsWith("product")
                        ? "Product photo"
                        : "Image asset"}
                  </small>
                </span>
                <button
                  aria-label={`Remove ${item.name}`}
                  onClick={() => remove(item.key)}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          {selectedItems.some(item => item.key.startsWith("product")) &&
            onProductDetails && (
              <button
                type="button"
                className="cfg-product-details-link"
                onClick={onProductDetails}
              >
                <Package size={19} />
                <span>
                  <strong>Choose product details for the ad</strong>
                  <small>Specifications, features, description and price</small>
                </span>
              </button>
            )}
        </section>
      )}
      <div className="cfg-source-tabs" role="group" aria-label="Source type">
        {sourceTabs.map(([id, title, desc, Icon]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            disabled={id === "video" && isImage}
            title={
              id === "video" && isImage
                ? "Choose Video as your creative type to use a source clip"
                : undefined
            }
            onClick={() => {
              setTab(id);
              setOffset(0);
              if (id === "upload") setUpload(true);
            }}
          >
            <Icon size={20} />
            <strong>{title}</strong>
            <small>{desc}</small>
          </button>
        ))}
      </div>
      {tab === "catalog" && (
        <>
          {isImage && (
            <ChoiceField className="cfg-field">
              <span>Product arrangement</span>
              <VisualSelect
                value={image.productMode}
                onChange={e => {
                  if (
                    e.target.value === "together" &&
                    (image.products.length > 3 ||
                      image.products.some(
                        p => selectedProductImageIds(p).length > 1
                      ))
                  )
                    return toast.info(
                      "Choose one view per product and up to three products to combine them."
                    );
                  updateImage({
                    productMode: e.target.value as "separate" | "together",
                  });
                }}
              >
                <option value="separate">
                  One creative set per selected view
                </option>
                <option value="together">Combine up to three products</option>
              </VisualSelect>
            </ChoiceField>
          )}
          <div className="cfg-card-grid">
            {isImage ? (
              products
                .filter(p =>
                  (p.name + (p.sku ?? ""))
                    .toLowerCase()
                    .includes(search.toLowerCase())
                )
                .map(p => {
                  const primary =
                    p.images.find(
                      photo =>
                        photo.isPrimary &&
                        catalogDefaultImage(photo, p.mediaGroups)
                    ) ??
                    p.images.find(photo =>
                      catalogDefaultImage(photo, p.mediaGroups)
                    );
                  const selection = image.products.find(
                    i => i.productId === p.id
                  );
                  return (
                    <StudioCard
                      key={p.id}
                      title={p.name}
                      description={
                        p.sku ||
                        (p.recordType === "service"
                          ? "Service"
                          : "Product catalog")
                      }
                      image={
                        p.images.find(i => i.id === selection?.imageId)?.url ??
                        primary?.url
                      }
                      contain
                      selected={!!selection}
                      disabled={
                        (!primary &&
                          !selection &&
                          p.recordType !== "service") ||
                        (!selection &&
                          (image.productMode === "together"
                            ? image.products.length >= 3
                            : creativeProductViewCount(image) >= 12))
                      }
                      onSelect={() =>
                        updateImage({
                          promotionMode: "offerings",
                          products: selection
                            ? image.products.filter(i => i.productId !== p.id)
                            : [
                                ...image.products,
                                {
                                  productId: p.id,
                                  imageId: primary?.id ?? null,
                                  featuredSpecKeys: [],
                                  includePrice: false,
                                },
                              ],
                        })
                      }
                      gallery={
                        <>
                          <p className="mb-2 text-xs text-muted-foreground">
                            {image.productMode === "together"
                              ? "Choose one view per product."
                              : "Choose up to four views per product, twelve total."}{" "}
                            Preview without changing selection.
                          </p>
                          <CatalogGallery
                            name={p.name}
                            images={p.images}
                            groups={p.mediaGroups}
                            selectedIds={
                              selection
                                ? selectedProductImageIds(selection).filter(
                                    (id): id is number => id != null
                                  )
                                : []
                            }
                            disabled={
                              creativeProductViewCount(image) >= 12 ||
                              (selection
                                ? selectedProductImageIds(selection).length >=
                                  (image.productMode === "together" ? 1 : 4)
                                : image.productMode === "together" &&
                                  image.products.length >= 3)
                            }
                            onSelect={imageId =>
                              toggleProductImage(p.id, imageId)
                            }
                          />
                        </>
                      }
                    />
                  );
                })
            ) : (
              <div className="col-span-full">
                <ProductPhotoGroups
                  choices={catalog.data?.items ?? []}
                  selected={sourceKeys}
                  limit={referenceLimit}
                  onToggle={toggleSource}
                />
              </div>
            )}
          </div>
          {!isImage && catalog.isLoading && (
            <p role="status">Loading product photos…</p>
          )}
          {!isImage && catalog.error && (
            <p role="alert">
              Could not load product photos.{" "}
              <button onClick={() => catalog.refetch()}>Retry</button>
            </p>
          )}
          {!isImage && (offset > 0 || catalog.data?.nextOffset != null) && (
            <div className="cfg-actions">
              <button
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 60))}
              >
                Previous
              </button>
              <button
                disabled={catalog.data?.nextOffset == null}
                onClick={() => setOffset(catalog.data?.nextOffset ?? offset)}
              >
                More product photos
              </button>
            </div>
          )}
          {(isImage ? !products.length : catalog.data?.items.length === 0) && (
            <p className="cfg-empty">
              No approved products yet. Add one using Product page URL, or
              choose an image asset.
            </p>
          )}
        </>
      )}
      {(tab === "assets" || tab === "video") && (
        <>
          <p className="cfg-help">
            {tab === "video"
              ? "Choose an MP4 clip. Compatible models can edit, extend or transfer its motion."
              : "Choose JPG, PNG or WebP images. Selected images become your creative references."}
          </p>
          <div className="cfg-card-grid">
            {assets
              .filter(
                a =>
                  (tab === "video"
                    ? a.mimeType === "video/mp4"
                    : a.mediaType === "image" && a.mimeType !== "image/gif") &&
                  a.name.toLowerCase().includes(search.toLowerCase())
              )
              .map(a => {
                const selected =
                  tab === "video"
                    ? video.sourceVideoKey === a.key
                    : sourceKeys.includes(a.key);
                const blocked = isImage
                  ? a.state !== "approved"
                  : ["rejected", "changes_requested"].includes(a.state);
                return (
                  <StudioCard
                    key={a.key}
                    title={a.name}
                    description={[
                      a.origin === "generated" ? "AI generated" : "Uploaded",
                      a.width && a.height ? `${a.width} × ${a.height}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    image={tab === "assets" ? a.url : undefined}
                    media={
                      tab === "video" ? (
                        <video src={a.url} muted preload="metadata" />
                      ) : undefined
                    }
                    contain
                    badge={blocked ? "Needs approval" : undefined}
                    selected={selected}
                    disabled={
                      blocked ||
                      (tab === "assets" &&
                        sourceKeys.length >= referenceLimit &&
                        !selected)
                    }
                    onSelect={() =>
                      tab === "video"
                        ? updateVideo({
                            sourceVideoKey: selected ? null : a.key,
                          })
                        : toggleSource(a.key)
                    }
                  />
                );
              })}
          </div>
          {!assets.some(a =>
            tab === "video"
              ? a.mimeType === "video/mp4"
              : a.mediaType === "image"
          ) && (
            <div className="cfg-empty">
              No {tab === "video" ? "videos" : "images"} yet.{" "}
              <button onClick={() => setUpload(true)}>Upload a source</button>
            </div>
          )}
        </>
      )}
      {tab === "url" && (
        <PageUrlSource
          draftKey={draftKey}
          organizationId={organizationId}
          kind={kind}
          image={image}
          video={video}
          updateImage={updateImage}
          updateVideo={updateVideo}
          onUploaded={onUploaded}
          onManual={() => setTab("business")}
        />
      )}
      {tab === "upload" && (
        <div className="cfg-upload-zone">
          <Upload size={32} />
          <h3>Your files, your starting point</h3>
          <p>
            {isImage
              ? "JPG, PNG or WebP images"
              : "Images or MP4 source videos"}
            . Uploaded sources appear with thumbnails and titles.
          </p>
          <button className="cfg-primary" onClick={() => setUpload(true)}>
            Choose files
          </button>
        </div>
      )}
      {tab === "business" && (
        <div className="cfg-form">
          <h3>Promote a business, service or idea</h3>
          <p className="cfg-help">
            Directories, subscriptions and services can start without a catalog
            product.
          </p>
          {isImage ? (
            <>
              <button
                className="cfg-secondary"
                onClick={() =>
                  updateImage({
                    promotionMode: "platform",
                    preserveProduct: false,
                    products: [],
                    promotion: image.promotion ?? {
                      kind: "platform",
                      title: "",
                      description: "",
                    },
                  })
                }
              >
                {image.promotionMode === "platform"
                  ? "Business promotion selected"
                  : "Use business promotion"}
              </button>
              <ChoiceField className="cfg-field">
                <span>Promotion type</span>
                <VisualSelect
                  value={image.promotion?.kind ?? "platform"}
                  onChange={e =>
                    updateImage({
                      promotionMode: "platform",
                      products: [],
                      promotion: {
                        title: "",
                        description: "",
                        ...image.promotion,
                        kind: e.target.value as NonNullable<
                          CreativeSetup["promotion"]
                        >["kind"],
                      },
                    })
                  }
                >
                  {PROMOTION_TYPES.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </VisualSelect>
              </ChoiceField>
              <label className="cfg-field">
                <span>Offering name</span>
                <input
                  value={image.promotion?.title ?? ""}
                  onChange={e =>
                    updateImage({
                      promotionMode: "platform",
                      products: [],
                      promotion: {
                        kind: "platform",
                        description: "",
                        ...image.promotion,
                        title: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="cfg-field">
                <span>What should we promote?</span>
                <textarea
                  value={image.promotion?.description ?? ""}
                  onChange={e =>
                    updateImage({
                      promotionMode: "platform",
                      products: [],
                      promotion: {
                        kind: "platform",
                        title: "",
                        ...image.promotion,
                        description: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </>
          ) : (
            <p>
              Describe the offering in{" "}
              <strong>Story & Sound → Copy & prompt</strong>. You can also add
              brand imagery from Image assets.
            </p>
          )}
        </div>
      )}
      {upload && (
        <AssetUploadDialog
          open
          onClose={() => setUpload(false)}
          organizationId={organizationId}
          role={role}
          parent={null}
          defaultDisposition="draft"
          defaultPurpose="source"
          mediaFilter={
            isImage ? "image" : tab === "video" ? "video" : undefined
          }
          onSaved={onUploaded}
          onComplete={(key, state) => {
            setUpload(false);
            setTab("assets");
            if (state !== "approved" && isImage)
              toast.info(
                "Image saved. Approve it in Asset Library before selecting it for generation."
              );
            else
              toast.success(
                "Source saved. Select it from your image assets or source videos."
              );
          }}
        />
      )}
    </div>
  );
}
