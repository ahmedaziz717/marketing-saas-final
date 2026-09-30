import { createHash } from "node:crypto";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { brandAssets } from "../../drizzle/schema";
import { safeFetchImage } from "./websiteCrawler";
import { storagePut } from "../storage";
import { appendActivity } from "./activity";
import type { LibraryDatabase } from "./assetLibrary";

export async function normalizeBrandLogo(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/svg+xml") {
    const svg = bytes.toString("utf8");
    // Rasterize only self-contained vectors: never let the renderer resolve URLs or local files.
    if (
      /<!DOCTYPE|<!ENTITY|<script|<foreignObject|<image|@import|(?:href\s*=\s*["']\s*(?!#))|url\(\s*["']?\s*(?!#)/i.test(
        svg
      )
    )
      throw new Error("Logo contains external references");
  }
  return sharp(bytes, { limitInputPixels: 16_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

export async function importBrandLogos(
  db: LibraryDatabase,
  organizationId: number,
  brandKitId: number,
  actorUserId: number,
  urls: string[]
) {
  const existing = await db
    .select()
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.organizationId, organizationId),
        eq(brandAssets.type, "logo")
      )
    );
  const known = new Set(existing.map(a => String(a.metadata?.sourceUrl ?? "")));
  const failed: string[] = [];
  let imported = 0;
  for (const url of Array.from(new Set(urls))) {
    if (known.has(url)) continue;
    try {
      const image = await safeFetchImage(url, 0, true);
      const bytes = await normalizeBrandLogo(image.data, image.contentType);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const stored = await storagePut(
        `org-${organizationId}/brand/website-${digest}.png`,
        bytes,
        "image/png"
      );
      const [asset] = await db
        .insert(brandAssets)
        .values({
          organizationId,
          brandKitId,
          name: "Website logo",
          type: "logo",
          storageKey: stored.key,
          url: stored.url,
          mimeType: "image/png",
          status: "pending",
          metadata: { sourceUrl: url, library: { purpose: "source", digest } },
          uploadedByUserId: actorUserId,
          createdAtMs: Date.now(),
        })
        .returning({ id: brandAssets.id });
      await appendActivity({
        organizationId,
        actorUserId,
        action: "brand_asset.uploaded",
        entityType: "brand_asset",
        entityId: asset.id,
        payload: { sourceUrl: url, status: "pending" },
      });
      imported++;
    } catch {
      failed.push(url);
    }
  }
  return { imported, failed };
}
