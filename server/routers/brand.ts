import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandAssets, brandKits } from "../../drizzle/schema";
import { getDb } from "../db";
import { appendActivity } from "../lib/activity";
import { requireOrganizationRole } from "../lib/access";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const brandInput = z.object({
  organizationId: z.number().int().positive(),
  name: z.string().min(2).max(160),
  voice: z.string().max(4000).optional().default(""),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(10),
  fonts: z.array(z.string().min(1).max(80)).min(1).max(10),
  requiredClaims: z.string().max(6000).optional().default(""),
  prohibitedContent: z.string().max(6000).optional().default(""),
  activate: z.boolean().default(false),
});

export const brandRouter = router({
  get: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return (await db.select().from(brandKits).where(eq(brandKits.organizationId, input.organizationId)).limit(1))[0] ?? null;
  }),

  update: protectedProcedure.input(brandInput).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(brandKits).set({ name: input.name, voice: input.voice, colors: input.colors, fonts: input.fonts, requiredClaims: input.requiredClaims, prohibitedContent: input.prohibitedContent, status: input.activate ? "active" : "draft", updatedByUserId: ctx.user.id, updatedAtMs: Date.now() }).where(eq(brandKits.organizationId, input.organizationId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: input.activate ? "brand_kit.activated" : "brand_kit.updated", entityType: "brand_kit", entityId: input.organizationId });
    return { success: true };
  }),

  assets: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(brandAssets).where(eq(brandAssets.organizationId, input.organizationId)).orderBy(desc(brandAssets.createdAtMs));
  }),

  uploadAsset: protectedProcedure.input(z.object({
    organizationId: z.number().int().positive(),
    name: z.string().min(2).max(180),
    type: z.enum(["logo", "font", "product", "reference", "other"]),
    mimeType: z.string().regex(/^image\//),
    base64: z.string().min(20),
  })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "creator"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const kit = (await db.select().from(brandKits).where(eq(brandKits.organizationId, input.organizationId)).limit(1))[0];
    if (!kit) throw new TRPCError({ code: "NOT_FOUND", message: "Brand kit not found" });
    const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (bytes.length > 8 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Assets must be 8 MB or smaller" });
    const extension = input.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const stored = await storagePut(`org-${input.organizationId}/brand/${Date.now()}-${input.name}.${extension}`, bytes, input.mimeType);
    const inserted = await db.insert(brandAssets).values({ organizationId: input.organizationId, brandKitId: kit.id, name: input.name, type: input.type, storageKey: stored.key, url: stored.url, mimeType: input.mimeType, status: "pending", uploadedByUserId: ctx.user.id, createdAtMs: Date.now() });
    const assetId = Number(inserted[0].insertId);
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: "brand_asset.uploaded", entityType: "brand_asset", entityId: assetId, payload: { name: input.name, type: input.type } });
    return { assetId, url: stored.url };
  }),

  reviewAsset: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), assetId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin", "reviewer"]);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const asset = (await db.select().from(brandAssets).where(and(eq(brandAssets.id, input.assetId), eq(brandAssets.organizationId, input.organizationId))).limit(1))[0];
    if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(brandAssets).set({ status: input.decision, reviewedByUserId: ctx.user.id, reviewedAtMs: Date.now() }).where(eq(brandAssets.id, input.assetId));
    await appendActivity({ organizationId: input.organizationId, actorUserId: ctx.user.id, action: `brand_asset.${input.decision}`, entityType: "brand_asset", entityId: input.assetId });
    return { success: true };
  }),
});

