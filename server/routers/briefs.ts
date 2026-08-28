import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandAssets, campaignBriefs, products } from "../../drizzle/schema";
import { getDb } from "../db";
import { appendActivity } from "../lib/activity";
import { requireOrganizationRole } from "../lib/access";
import { protectedProcedure, router } from "../_core/trpc";
import { importedProductCanBeUsed } from "../lib/brandImport";

const briefFields = z.object({
  organizationId: z.number().int().positive(),
  name: z.string().min(3).max(200),
  audience: z.string().min(10).max(5000),
  offer: z.string().min(3).max(5000),
  placements: z.array(z.enum(["facebook_feed", "instagram_feed", "instagram_story", "instagram_reels"])).min(1),
  formats: z.array(z.enum(["square_1_1", "portrait_4_5", "story_9_16", "landscape_1_91_1"])).min(1),
  creativeDirection: z.string().min(10).max(8000),
  destinationUrl: z.string().url().or(z.literal("")).optional().default(""),
  requiredClaims: z.string().max(5000).optional().default(""),
  assetIds: z.array(z.number().int().positive()).min(1),
  productIds: z.array(z.number().int().positive()).max(50).default([]),
});

export const briefsRouter = router({
  list: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(campaignBriefs).where(eq(campaignBriefs.organizationId, input.organizationId)).orderBy(desc(campaignBriefs.updatedAtMs));
  }),

  get: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), briefId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return (await db.select().from(campaignBriefs).where(and(eq(campaignBriefs.id, input.briefId), eq(campaignBriefs.organizationId, input.organizationId))).limit(1))[0] ?? null;
  }),

  create: protectedProcedure.input(briefFields).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = Date.now();
    const inserted = await db.insert(campaignBriefs).values({ ...input, channel: "meta", status: "draft", createdByUserId: ctx.user.id, createdAtMs: now, updatedAtMs: now });
    const briefId = Number(inserted[0].insertId);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "brief.created", entityType: "campaign_brief", entityId: briefId, payload: { name: input.name } });
    return { briefId };
  }),

  update: protectedProcedure.input(briefFields.extend({ briefId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { briefId, organizationId, ...changes } = input;
    const existing = (await db.select().from(campaignBriefs).where(and(eq(campaignBriefs.id, briefId), eq(campaignBriefs.organizationId, organizationId))).limit(1))[0];
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(campaignBriefs).set({ ...changes, status: "draft", approvedByUserId: null, approvedAtMs: null, updatedAtMs: Date.now() }).where(eq(campaignBriefs.id, briefId));
    await appendActivity({ organizationId, actorUserId: ctx.user.id, action: "brief.updated", entityType: "campaign_brief", entityId: briefId, payload: { approvalInvalidated: existing.status === "approved" } });
    return { success: true };
  }),

  submit: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), briefId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const brief = (await db.select().from(campaignBriefs).where(and(eq(campaignBriefs.id, input.briefId), eq(campaignBriefs.organizationId, input.organizationId))).limit(1))[0];
    if (!brief || !["draft", "rejected"].includes(brief.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only draft or rejected briefs can be submitted" });
    const assets = await db.select().from(brandAssets).where(and(eq(brandAssets.organizationId, input.organizationId), inArray(brandAssets.id, brief.assetIds)));
    if (assets.length !== brief.assetIds.length || assets.some(asset => asset.status !== "approved")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every selected brand asset must be approved before brief review" });
    const productIds = brief.productIds ?? [];
    const selectedProducts = productIds.length ? await db.select().from(products).where(and(eq(products.organizationId, input.organizationId), inArray(products.id, productIds))) : [];
    if (selectedProducts.length !== productIds.length || selectedProducts.some(product => !importedProductCanBeUsed(product.status))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every selected catalog product must remain approved before brief review" });
    await db.update(campaignBriefs).set({ status: "in_review", updatedAtMs: Date.now() }).where(eq(campaignBriefs.id, input.briefId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "brief.submitted", entityType: "campaign_brief", entityId: input.briefId });
    return { success: true };
  }),

  review: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), briefId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "reviewer"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const brief = (await db.select().from(campaignBriefs).where(and(eq(campaignBriefs.id, input.briefId), eq(campaignBriefs.organizationId, input.organizationId))).limit(1))[0];
    if (!brief || brief.status !== "in_review") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The brief must be in review" });
    await db.update(campaignBriefs).set({ status: input.decision, approvedByUserId: input.decision === "approved" ? ctx.user.id : null, approvedAtMs: input.decision === "approved" ? Date.now() : null, updatedAtMs: Date.now() }).where(eq(campaignBriefs.id, input.briefId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: `brief.${input.decision}`, entityType: "campaign_brief", entityId: input.briefId });
    return { success: true };
  }),
});
