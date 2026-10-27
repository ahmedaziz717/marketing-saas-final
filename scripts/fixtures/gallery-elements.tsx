import { useState } from "react";
import { componentCatalogFixture } from "./catalog-components";
import { StudioSources } from "../../client/src/components/configurator/StudioSources";
import { ProductPhotoGroups } from "../../client/src/components/ProductPhotoGroups";
import { WorkflowMediaControl } from "../../client/src/components/WorkflowMediaControl";
import { defaultCreativeSetup } from "../../shared/creativeBuilder";
import { defaultVideoSetup } from "../../shared/videoCreation";
import { canDraftCatalogImage } from "../../shared/catalogReadiness";
import { appFieldSchema } from "../../shared/workflowInputs";
export function galleryElementProducts() {
  const rows: any[] = componentCatalogFixture().products;
  rows[0].status = "approved";
  rows[1].status = "approved";
  for (const row of rows)
    row.componentKind = row.provenance["component.kind"] ?? null;
  const hero = { ...rows[0].images[0], media: null };
  const system = rows[0].mediaGroups[0];
  system.imageIds = Array.from({ length: 8 }, (_, i) => `view-${i}`);
  system.declaredImages = 8;
  system.expectedCount = 8;
  const images = system.imageIds.map((id: string, i: number) => ({
    ...rows[0].images[0],
    id: 10 + i,
    isPrimary: 0,
    media: {
      ...rows[0].images[0].media,
      references: [{ groupId: system.id, imageId: id, position: i }],
    },
  }));
  rows[0].images = [hero, ...images, ...rows[0].images.slice(1)];
  return rows;
}
export function galleryElementChoices() {
  return galleryElementProducts().filter(p => canDraftCatalogImage(p.status)).flatMap(p =>
    p.images.map((i: any) => ({
      ...i,
      key: `product_image:${i.id}`,
      name: p.name,
      origin: "catalog",
      product: { id: p.id },
      mediaGroups: p.mediaGroups,
      representedGroupIds: p.representedGroupIds,
      componentKind: p.componentKind,
      ...(p.status === "pending"
        ? { reviewNotice: "Draft use allowed. Review product facts before publishing." }
        : {}),
    }))
  );
}
export function galleryWorkflowChoices() {
  const products = galleryElementProducts()
    .filter(p => canDraftCatalogImage(p.status))
    .map(p => ({
      ...p,
      primaryImageId: p.images.find((i: any) => i.isPrimary)?.id,
      reviewNotice: p.status === "pending" ? "Draft use allowed. Review product facts before publishing." : null,
      images: p.images.map((i: any) => ({
        ...i,
        key: `product_image:${i.id}`,
        name: p.name,
      })),
    }));
  return {
    products,
    pageIds: products.map(p => p.id),
    nextOffset: null,
    assets: [],
    role: "owner",
  };
}
export function GalleryElementsFixture({
  kind,
}: {
  kind: "image" | "video" | "app";
}) {
  const [image, setImage] = useState({
    ...defaultCreativeSetup(),
    promotionMode: "offerings" as const,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [value, setValue] = useState("product_image:13");
  return (
    <div className="p-4">
      <h1>Gallery element regression: {kind}</h1>
      <p>Offline synthetic catalog. No generation or catalog writes.</p>
      {kind === "image" ? (
        <StudioSources
          organizationId={1}
          role="owner"
          kind="image"
          image={image}
          video={defaultVideoSetup}
          products={galleryElementProducts()}
          assets={[]}
          search=""
          updateImage={patch => setImage(old => ({ ...old, ...patch }))}
          updateVideo={() => {}}
          onUploaded={async () => {}}
        />
      ) : kind === "video" ? (
        <ProductPhotoGroups
          choices={galleryElementChoices() as any}
          selected={selected}
          limit={4}
          onToggle={key =>
            setSelected(old =>
              old.includes(key) ? old.filter(k => k !== key) : [...old, key]
            )
          }
        />
      ) : (
        <WorkflowMediaControl
          organizationId={1}
          field={appFieldSchema.parse({
            key: "product",
            label: "Product image",
            kind: "asset",
            required: true,
          })}
          value={value}
          onChange={setValue}
        />
      )}
      <output data-testid="gallery-selection" hidden>
        {JSON.stringify(
          kind === "image"
            ? image.products
            : kind === "video"
              ? selected
              : value
        )}
      </output>
    </div>
  );
}
