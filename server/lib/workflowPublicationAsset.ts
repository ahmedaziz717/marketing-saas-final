import { and, eq, sql } from "drizzle-orm";
import { brandAssets, brandKits } from "../../drizzle/schema";
import { readVideoCatalogImage } from "./videoCatalog";
import {
  detectAssetMime,
  normalizeUpload,
  readLibraryAsset,
  type LibraryDatabase,
} from "./assetLibrary";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { storageGetBase64 } from "../storage";
import type { WorkflowValue } from "../../shared/creativeWorkflow";

/** Catalog approval does not grant finished-asset approval. Materialize once and retain the normal review gate. */
export async function workflowPublicationAsset(
  db: LibraryDatabase,
  organizationId: number,
  actorUserId: number,
  image: Extract<WorkflowValue, { type: "image" | "video" }>
) {
  if (!image.key.startsWith("product_image:"))
    return readLibraryAsset(db, organizationId, image.key);
  const source = await readVideoCatalogImage(db, organizationId, image.key);
  const expected =
    image.catalogSourceVersion === undefined
      ? source.legacyFingerprint
      : source.reference.fingerprint;
  if (
    (image.catalogSourceVersion !== undefined &&
      image.catalogSourceVersion !== 2) ||
    expected !== image.fingerprint
  )
    throw new Error(
      "This product image changed. Run the workflow again with the updated image."
    );
  const owned = and(
    eq(brandAssets.organizationId, organizationId),
    sql`${brandAssets.metadata}->>'workflowCatalogFingerprint' = ${image.fingerprint}`
  );
  const [existing] = await db
    .select({ id: brandAssets.id })
    .from(brandAssets)
    .where(owned)
    .limit(1);
  if (existing)
    return readLibraryAsset(db, organizationId, `asset:${existing.id}`);
  const mimeType = detectAssetMime(
    Buffer.from(await storageGetBase64(source.reference.storageKey), "base64")
  );
  if (
    !mimeType ||
    !["image/png", "image/jpeg", "image/webp"].includes(mimeType)
  )
    throw new Error("Choose a PNG, JPEG or WebP product image.");
  const id = await withOrganizationTransaction(db, organizationId, async tx => {
    const [prior] = await tx
      .select({ id: brandAssets.id })
      .from(brandAssets)
      .where(owned)
      .limit(1);
    if (prior) return prior.id;
    const [kit] = await tx
      .select({ id: brandKits.id })
      .from(brandKits)
      .where(eq(brandKits.organizationId, organizationId))
      .limit(1);
    if (!kit)
      throw new Error(
        "Create your workspace brand before preparing a product post."
      );
    const [asset] = await tx
      .insert(brandAssets)
      .values({
        organizationId,
        brandKitId: kit.id,
        name: `${source.choice.name} · social image`.slice(0, 180),
        type: "product",
        storageKey: source.reference.storageKey,
        url: source.choice.url,
        mimeType,
        status: "pending",
        metadata: {
          workflowCatalogFingerprint: image.fingerprint,
          catalogSourceKey: image.key,
          library: { purpose: "finished", isUgc: false },
        },
        uploadedByUserId: actorUserId,
        createdAtMs: Date.now(),
      })
      .returning();
    await appendActivity(
      {
        organizationId,
        actorUserId,
        action: "asset_library.submitted",
        entityType: "library_asset",
        entityId: `asset:${asset.id}`,
        payload: {
          sourceKey: image.key,
          purpose: "finished",
          fingerprint: normalizeUpload(asset).fingerprint,
        },
      },
      tx
    );
    return asset.id;
  });
  return readLibraryAsset(db, organizationId, `asset:${id}`);
}
