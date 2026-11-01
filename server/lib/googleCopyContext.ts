import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { brandAssets, creativeVariants } from "../../drizzle/schema";
import { parseAssetKey } from "../../shared/assetLibrary";
import type { GoogleAssetInput } from "../../shared/googleCampaigns";
import { normalizeStorageKey, storageGetBase64 } from "../storage";
import { readLibraryAsset, type LibraryDatabase } from "./assetLibrary";
import { googleAdsRows } from "./googleAdsApi";
import { withGoogleAdsAccess } from "./googleAdsConnections";
import { safeFetchImage } from "./websiteCrawler";

type CopyAssetEvidence = {
  reference: string;
  name: string;
  mediaType: "image" | "video" | "text";
  field: string;
  description?: string;
  imageIndex?: number;
  evidence: "selected_image" | "metadata_only";
};

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const unavailable = (message: string) =>
  new TRPCError({ code: "BAD_REQUEST", message });

/** Resolve selected references, never caller-provided image URLs or claims.
 * Image bytes are bounded and reduced only for AI inspection, not publication.
 * Video references contribute labelled metadata, never an invented transcript.
 */
export async function googleCopyContext(
  db: LibraryDatabase,
  organizationId: number,
  selectedAssets: GoogleAssetInput[],
  connectionId?: string
) {
  const assets: CopyAssetEvidence[] = [];
  const images: string[] = [];
  const productIds = new Set<number>();
  const seen = new Set<string>();
  let imageBytes = 0;
  const remoteIds = Array.from(
    new Set(
      selectedAssets.flatMap(a =>
        a.source.kind === "existing" ? [a.source.id] : []
      )
    )
  );
  const existing = remoteIds.length > 0;
  if (existing && !connectionId)
    throw unavailable(
      "Choose a Google account for the selected Google assets."
    );
  // withGoogleAdsAccess inside this read verifies the account belongs to this
  // workspace. A client-provided asset ID alone never grants access.
  if (remoteIds.some(id => !/^\d{1,20}$/.test(id)))
    throw unavailable("Choose valid Google assets from this account.");
  const remote: Array<{
    id: string;
    name: string;
    type: string;
    url?: string;
  }> = existing
    ? await withGoogleAdsAccess(
        db,
        organizationId,
        connectionId!,
        async (connection, token) => {
          const rows = await googleAdsRows(
            token,
            connection.accountId,
            `SELECT asset.id, asset.name, asset.type, asset.text_asset.text, asset.image_asset.full_size.url FROM asset WHERE asset.id IN (${remoteIds.join(",")}) LIMIT 50`,
            connection.details.google?.loginCustomerId
          );
          return rows.map(row => ({
            id: String(row.asset.id),
            name: String(
              row.asset.name ||
                row.asset.textAsset?.text ||
                `Asset ${row.asset.id}`
            ),
            type: String(row.asset.type),
            url: row.asset.imageAsset?.fullSize?.url,
          }));
        }
      )
    : [];

  const addImage = async (bytes: Buffer) => {
    if (images.length >= MAX_IMAGES)
      throw unavailable(
        `Choose at most ${MAX_IMAGES} image references for one copy request.`
      );
    let reduced: Buffer;
    try {
      reduced = await sharp(bytes, {
        limitInputPixels: 25_000_000,
        failOn: "warning",
      })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 78 })
        .toBuffer();
    } catch {
      throw unavailable(
        "A selected image could not be inspected. Choose another image or repair its media before generating copy."
      );
    }
    imageBytes += reduced.length;
    if (imageBytes > MAX_IMAGE_BYTES)
      throw unavailable(
        "These selected images exceed the copy request size. Use fewer images for this run."
      );
    images.push(`data:image/jpeg;base64,${reduced.toString("base64")}`);
    return images.length - 1;
  };

  for (const item of selectedAssets) {
    const source = item.source;
    const reference =
      source.kind === "library"
        ? source.key
        : source.kind === "existing"
          ? `google:${source.id}`
          : source.kind === "youtube"
            ? `youtube:${source.videoId}`
            : `text:${item.field}:${source.text}`;
    if (seen.has(reference)) continue;
    seen.add(reference);
    if (source.kind === "text") {
      assets.push({
        reference,
        name: "Draft text",
        field: item.field,
        mediaType: "text",
        description: source.text,
        evidence: "metadata_only",
      });
      continue;
    }
    if (source.kind === "youtube") {
      assets.push({
        reference,
        name: `Selected YouTube video ${source.videoId}`,
        field: item.field,
        mediaType: "video",
        evidence: "metadata_only",
      });
      continue;
    }
    if (source.kind === "existing") {
      const row = remote.find(a => a.id === source.id);
      if (!row)
        throw unavailable(
          "A selected Google asset is no longer available in this account. Refresh the Google library and select it again."
        );
      const image = row.type === "IMAGE";
      const url = "url" in row ? row.url : undefined;
      if (image && !url)
        throw unavailable(
          "A selected Google image has no readable media. Choose another image for copy generation."
        );
      let imageIndex: number | undefined;
      if (image) {
        try {
          // DNS-pinned public-image fetch validates every redirect and caps bytes.
          imageIndex = await addImage((await safeFetchImage(String(url))).data);
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw unavailable(
            "A selected Google image could not be inspected. Refresh the library or choose another image."
          );
        }
      }
      assets.push({
        reference,
        name: row.name.slice(0, 500),
        field: item.field,
        mediaType: image
          ? "image"
          : row.type === "YOUTUBE_VIDEO"
            ? "video"
            : "text",
        imageIndex,
        evidence: image ? "selected_image" : "metadata_only",
      });
      continue;
    }

    const asset = await readLibraryAsset(db, organizationId, source.key);
    if (
      asset.state !== "approved" ||
      !["image", "video"].includes(asset.mediaType)
    )
      throw unavailable(
        "Choose approved image or video assets from this workspace before generating copy."
      );
    const ref = parseAssetKey(source.key);
    let storageKey: string | null | undefined;
    if (ref.kind === "creative") {
      const [row] = await db
        .select({
          key: creativeVariants.imageStorageKey,
          metadata: creativeVariants.renderMetadata,
        })
        .from(creativeVariants)
        .where(
          and(
            eq(creativeVariants.organizationId, organizationId),
            eq(creativeVariants.id, ref.id)
          )
        )
        .limit(1);
      storageKey = row?.key;
      const linkedProducts = row?.metadata?.productIds;
      if (Array.isArray(linkedProducts))
        for (const id of linkedProducts)
          if (Number.isSafeInteger(id) && id > 0) productIds.add(id);
    } else {
      const [row] = await db
        .select({ key: brandAssets.storageKey })
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.organizationId, organizationId),
            eq(brandAssets.id, ref.id)
          )
        )
        .limit(1);
      storageKey = row?.key;
    }
    let imageIndex: number | undefined;
    if (asset.mediaType === "image") {
      try {
        if (
          !storageKey ||
          !normalizeStorageKey(storageKey).startsWith(`org-${organizationId}/`)
        )
          throw unavailable(
            "A selected image has no usable workspace media. Repair its media before generating copy."
          );
        imageIndex = await addImage(
          Buffer.from(
            await storageGetBase64(storageKey, 8 * 1024 * 1024),
            "base64"
          )
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw unavailable(
          "A selected workspace image could not be inspected. Repair its media or choose another image."
        );
      }
    }
    assets.push({
      reference,
      name: asset.name.slice(0, 500),
      field: item.field,
      mediaType: asset.mediaType as "image" | "video",
      description:
        [asset.headline, asset.subheadline, asset.primaryText, asset.copyText]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000) || undefined,
      imageIndex,
      evidence: imageIndex === undefined ? "metadata_only" : "selected_image",
    });
  }
  // Product IDs are candidates only. The caller filters organization and approval
  // before treating linked catalog facts as authoritative.
  return { assets, images, productIds: Array.from(productIds) };
}
