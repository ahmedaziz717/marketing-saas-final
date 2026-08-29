import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandAssets, brandKits, campaignBriefs, productImages, products, productVariants, websiteCrawlJobs, websiteCrawlPages } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity } from "../lib/activity";
import { editedProductProvenance, productDedupeKey, pruneDeletedProductIds } from "../lib/brandImport";
import { isExcludedProductUrl, safeFetchImage } from "../lib/websiteCrawler";
import { storagePut } from "../storage";

const organizationInput = z.object({ organizationId: z.number().int().positive() });
const editableProduct = z.object({
  name: z.string().min(1).max(300), sku: z.string().max(180).nullable().optional(), category: z.string().max(240).nullable().optional(),
  description: z.string().max(10000).nullable().optional(), productUrl: z.string().url(), price: z.string().max(80).nullable().optional(), currency: z.string().max(16).nullable().optional(),
  specifications: z.record(z.string(), z.string().max(1000)),
});

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function removeCatalogProducts(db: Database, organizationId: number, productIds: number[], hooks?: { beforeProductDelete?: () => void | Promise<void> }) {
  const uniqueIds = Array.from(new Set(productIds));
  if (!uniqueIds.length) return { removed: 0, briefsUpdated: 0 };
  return db.transaction(async tx => {
    const owned = await tx.select({ id: products.id }).from(products).where(and(eq(products.organizationId, organizationId), inArray(products.id, uniqueIds)));
    const ownedIds = owned.map(item => item.id);
    if (!ownedIds.length) return { removed: 0, briefsUpdated: 0 };
    const briefs = await tx.select().from(campaignBriefs).where(eq(campaignBriefs.organizationId, organizationId));
    let briefsUpdated = 0;
    for (const brief of briefs) {
      const nextProductIds = pruneDeletedProductIds(brief.productIds, ownedIds);
      if (nextProductIds.length !== (brief.productIds ?? []).length) {
        await tx.update(campaignBriefs).set({ productIds: nextProductIds, status: "draft", approvedByUserId: null, approvedAtMs: null, updatedAtMs: Date.now() }).where(and(eq(campaignBriefs.organizationId, organizationId), eq(campaignBriefs.id, brief.id)));
        briefsUpdated++;
      }
    }
    await tx.delete(productImages).where(and(eq(productImages.organizationId, organizationId), inArray(productImages.productId, ownedIds)));
    await tx.delete(productVariants).where(and(eq(productVariants.organizationId, organizationId), inArray(productVariants.productId, ownedIds)));
    await hooks?.beforeProductDelete?.();
    await tx.delete(products).where(and(eq(products.organizationId, organizationId), inArray(products.id, ownedIds)));
    return { removed: ownedIds.length, briefsUpdated };
  });
}

export const catalogRouter = router({
  overview: protectedProcedure.input(organizationInput).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [catalog, images, variants, jobs] = await Promise.all([
      db.select().from(products).where(eq(products.organizationId, input.organizationId)).orderBy(desc(products.updatedAtMs)).limit(750),
      db.select().from(productImages).where(eq(productImages.organizationId, input.organizationId)),
      db.select().from(productVariants).where(eq(productVariants.organizationId, input.organizationId)).orderBy(productVariants.name),
      db.select().from(websiteCrawlJobs).where(eq(websiteCrawlJobs.organizationId, input.organizationId)).orderBy(desc(websiteCrawlJobs.createdAtMs)).limit(1),
    ]);
    return { products: catalog.map(product => ({ ...product, images: images.filter(image => image.productId === product.id), variants: variants.filter(variant => variant.productId === product.id) })), latestJob: jobs[0] ?? null };
  }),

  updateProduct: protectedProcedure.input(organizationInput.extend({ productId: z.number().int().positive(), product: editableProduct })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = (await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.organizationId, input.organizationId))).limit(1))[0];
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
    const dedupeKey = productDedupeKey({ sku: input.product.sku, productUrl: input.product.productUrl, name: input.product.name });
    const now = Date.now();
    await db.update(products).set({ ...input.product, dedupeKey, provenance: editedProductProvenance(existing.provenance, ctx.user.id, now), status: "pending", reviewedByUserId: null, reviewedAtMs: null, updatedAtMs: now }).where(eq(products.id, input.productId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "catalog.product_edited", entityType: "product", entityId: input.productId, payload: { priorStatus: existing.status, sourcePageId: existing.sourcePageId } });
    return { success: true };
  }),

  reviewProduct: protectedProcedure.input(organizationInput.extend({ productId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "reviewer"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const product = (await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.organizationId, input.organizationId))).limit(1))[0];
    if (!product) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(products).set({ status: input.decision, reviewedByUserId: ctx.user.id, reviewedAtMs: Date.now(), updatedAtMs: Date.now() }).where(eq(products.id, input.productId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: `catalog.product_${input.decision}`, entityType: "product", entityId: input.productId, payload: { sourcePageId: product.sourcePageId, productUrl: product.productUrl } });
    return { success: true };
  }),

  bulkReview: protectedProcedure.input(organizationInput.extend({ productIds: z.array(z.number().int().positive()).min(1).max(200), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "reviewer"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const owned = await db.select({ id: products.id }).from(products).where(and(eq(products.organizationId, input.organizationId), inArray(products.id, input.productIds)));
    if (owned.length !== new Set(input.productIds).size) throw new TRPCError({ code: "FORBIDDEN", message: "One or more products do not belong to this workspace" });
    await db.update(products).set({ status: input.decision, reviewedByUserId: ctx.user.id, reviewedAtMs: Date.now(), updatedAtMs: Date.now() }).where(and(eq(products.organizationId, input.organizationId), inArray(products.id, input.productIds)));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: `catalog.bulk_${input.decision}`, entityType: "product_batch", entityId: input.productIds.join(","), payload: { count: input.productIds.length } });
    return { updated: input.productIds.length };
  }),

  deleteProduct: protectedProcedure.input(organizationInput.extend({ productId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const product = (await db.select().from(products).where(and(eq(products.organizationId, input.organizationId), eq(products.id, input.productId))).limit(1))[0];
    if (!product) throw new TRPCError({ code: "NOT_FOUND" });
    const result = await removeCatalogProducts(db, input.organizationId, [product.id]);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "catalog.product_deleted", entityType: "product", entityId: product.id, payload: { name: product.name, productUrl: product.productUrl, priorStatus: product.status, briefsUpdated: result.briefsUpdated } });
    return { success: true, ...result };
  }),

  cleanupNonProducts: protectedProcedure.input(organizationInput).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [catalog, pages] = await Promise.all([
      db.select().from(products).where(eq(products.organizationId, input.organizationId)),
      db.select().from(websiteCrawlPages).where(eq(websiteCrawlPages.organizationId, input.organizationId)),
    ]);
    const pagesById = new Map(pages.map(page => [page.id, page]));
    const invalidIds = catalog.filter(product => {
      if (product.status === "approved") return false;
      const page = product.sourcePageId ? pagesById.get(product.sourcePageId) : undefined;
      return isExcludedProductUrl(product.productUrl) || !page || page.pageType !== "product" || !Boolean((page.metadata as { productCandidate?: boolean } | null)?.productCandidate);
    }).map(product => product.id);
    const result = await removeCatalogProducts(db, input.organizationId, invalidIds);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "catalog.non_products_cleaned", entityType: "product_batch", entityId: invalidIds.join(",") || "none", payload: { removed: result.removed, briefsUpdated: result.briefsUpdated, approvedProductsPreserved: true } });
    return result;
  }),

  applyBrandDraft: protectedProcedure.input(organizationInput.extend({
    jobId: z.number().int().positive(),
    draft: z.object({ companyName: z.string().min(1).max(160), summary: z.string().max(4000), voice: z.string().max(4000), colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(24), fonts: z.array(z.string().max(180)).max(16), requiredClaims: z.array(z.string().max(1000)).max(40), prohibitedContent: z.array(z.string().max(1000)).max(40), selectedLogoUrls: z.array(z.string().url()).max(10) }),
    activate: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const job = (await db.select().from(websiteCrawlJobs).where(and(eq(websiteCrawlJobs.id, input.jobId), eq(websiteCrawlJobs.organizationId, input.organizationId))).limit(1))[0];
    const kit = (await db.select().from(brandKits).where(eq(brandKits.organizationId, input.organizationId)).limit(1))[0];
    if (!job || !kit || job.scanMode !== "brand_and_products" || !["review_ready", "completed"].includes(job.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A full brand-and-product analysis must be ready for review" });
    const allowedLogos = new Set(((job.brandDraft as { logoUrls?: string[] } | null)?.logoUrls ?? []));
    if (input.draft.selectedLogoUrls.some(url => !allowedLogos.has(url))) throw new TRPCError({ code: "BAD_REQUEST", message: "A selected logo was not found in the analyzed website evidence" });
    const now = Date.now();
    await db.update(brandKits).set({ name: input.draft.companyName, voice: [input.draft.voice, input.draft.summary].filter(Boolean).join("\n\n"), colors: input.draft.colors, fonts: input.draft.fonts, requiredClaims: input.draft.requiredClaims.join("\n"), prohibitedContent: input.draft.prohibitedContent.join("\n"), status: input.activate ? "active" : "draft", updatedByUserId: ctx.user.id, updatedAtMs: now }).where(eq(brandKits.id, kit.id));
    const existingAssets = await db.select().from(brandAssets).where(eq(brandAssets.organizationId, input.organizationId));
    const existingSources = new Set(existingAssets.map(asset => String((asset.metadata as { sourceUrl?: string } | null)?.sourceUrl ?? "")));
    let importedLogos = 0;
    for (const sourceUrl of input.draft.selectedLogoUrls.filter(url => !existingSources.has(url))) {
      try {
        const image = await safeFetchImage(sourceUrl);
        const extension = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : image.contentType === "image/gif" ? "gif" : "jpg";
        const stored = await storagePut(`organizations/${input.organizationId}/brand/imported-logo.${extension}`, image.data, image.contentType);
        const insertedAsset = await db.insert(brandAssets).values({ organizationId: input.organizationId, brandKitId: kit.id, name: `Imported logo ${importedLogos + 1}`, type: "logo", storageKey: stored.key, url: stored.url, mimeType: image.contentType, status: "pending", metadata: { sourceUrl, crawlJobId: job.id }, uploadedByUserId: ctx.user.id, createdAtMs: Date.now() });
        await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "website_import.logo_stored", entityType: "brand_asset", entityId: Number(insertedAsset[0].insertId), payload: { sourceUrl, storageKey: stored.key, status: "pending" } });
        importedLogos++;
      } catch { /* unavailable source assets remain unselected rather than blocking the brand draft */ }
    }
    await db.update(websiteCrawlJobs).set({ status: "completed", brandDraft: { ...job.brandDraft, ...input.draft }, updatedAtMs: now, completedAtMs: now }).where(eq(websiteCrawlJobs.id, job.id));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: input.activate ? "website_import.brand_activated" : "website_import.draft_applied", entityType: "website_crawl_job", entityId: job.id, payload: { importedLogos, selectedColors: input.draft.colors.length, selectedFonts: input.draft.fonts.length } });
    return { success: true, importedLogos, status: input.activate ? "active" as const : "draft" as const };
  }),
});
