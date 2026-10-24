import { personalizeBrandPrompts } from "../lib/brandPromptDefaults";
import { brandPdfInput, brandVoiceSchema } from "../../shared/brandGuidelines";
import { extractBrandPdf } from "../lib/brandPdf";
import { previewGenerationBrand } from "../lib/brandVoiceSummary";
import sharp from "sharp";
import {
  discoverDriveLogos,
  fetchDriveLogo,
  driveReference,
} from "../lib/driveLogos";
import { normalizeBrandLogo } from "../lib/brandLogoImport";
import { detectAssetMime } from "../lib/assetLibrary";
import { scanBrandWebsite } from "../lib/brandWebsiteScan";
import { importBrandLogos } from "../lib/brandLogoImport";
import { suggestProfile } from "../lib/marketingDrafts";
import {
  businessProfileSchema,
  websiteAddressSchema,
} from "../../shared/businessProfile";
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
  voice: brandVoiceSchema.optional().default(""),
  colors: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .min(1)
    .max(10),
  fonts: z.array(z.string().min(1).max(80)).min(1).max(10),
  requiredClaims: z.string().max(6000).optional().default(""),
  prohibitedContent: z.string().max(6000).optional().default(""),
  activate: z.boolean().default(false),
  websiteLogoUrls: z.array(z.string().url().max(2048)).max(6).default([]),
});

export const brandRouter = router({
  personalizePrompts: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, ["owner", "admin"]);
      return personalizeBrandPrompts(input.organizationId, ctx.user.id);
    }),
  promptContext: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [brand] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, input.organizationId))
        .limit(1);
      return brand ? previewGenerationBrand(input.organizationId, brand) : null;
    }),
  extractGuidelines: protectedProcedure
    .input(brandPdfInput)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      return extractBrandPdf(input.base64, input.organizationId);
    }),
  discoverDriveLogos: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        url: z.string().url().max(2048),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      return discoverDriveLogos(input.url);
    }),
  importDriveLogos: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        urls: z.array(z.string().url().max(2048)).min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      const db = (await getDb())!;
      const [kit] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, input.organizationId))
        .limit(1);
      if (!kit)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set up your brand before adding logos.",
        });
      const urls = input.urls.map(url => {
        const ref = driveReference(url);
        if (ref.kind !== "file")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose an individual logo file.",
          });
        return ref.downloadUrl;
      });
      return importBrandLogos(
        db,
        input.organizationId,
        kit.id,
        ctx.user.id,
        urls,
        { label: "Google Drive logo", fetchImage: fetchDriveLogo }
      );
    }),

  scanWebsite: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        website: websiteAddressSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      try {
        return await scanBrandWebsite(input.website);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            "We couldn't read this website. Check the address and that it is publicly accessible, then retry. Your saved brand kit has not changed.",
        });
      }
    }),
  suggestProfile: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        website: websiteAddressSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      try {
        return await suggestProfile(input.website);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            "We couldn't prepare answers from this website. Try again or fill in the profile manually. Your saved answers have not changed.",
        });
      }
    }),
  saveProfile: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        profile: businessProfileSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const saved = await db
        .update(brandKits)
        .set({
          businessProfile: input.profile,
          updatedByUserId: ctx.user.id,
          updatedAtMs: Date.now(),
        })
        .where(eq(brandKits.organizationId, input.organizationId))
        .returning({ id: brandKits.id });
      if (!saved.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Brand kit not found",
        });
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "business_profile.updated",
        entityType: "brand_kit",
        entityId: saved[0].id,
      });
      return { success: true };
    }),
  get: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return (
        (
          await db
            .select()
            .from(brandKits)
            .where(eq(brandKits.organizationId, input.organizationId))
            .limit(1)
        )[0] ?? null
      );
    }),

  update: protectedProcedure
    .input(brandInput)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const kit = (
        await db
          .select()
          .from(brandKits)
          .where(eq(brandKits.organizationId, input.organizationId))
          .limit(1)
      )[0];
      if (!kit)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Brand kit not found",
        });
      const logos = await importBrandLogos(
        db,
        input.organizationId,
        kit.id,
        ctx.user.id,
        input.websiteLogoUrls
      );
      await db
        .update(brandKits)
        .set({
          name: input.name,
          voice: input.voice,
          colors: input.colors,
          fonts: input.fonts,
          requiredClaims: input.requiredClaims,
          prohibitedContent: input.prohibitedContent,
          status: input.activate ? "active" : "draft",
          updatedByUserId: ctx.user.id,
          updatedAtMs: Date.now(),
        })
        .where(eq(brandKits.organizationId, input.organizationId));
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: input.activate ? "brand_kit.activated" : "brand_kit.updated",
        entityType: "brand_kit",
        entityId: input.organizationId,
      });
      let personalizedDefaults: { updated: number; preserved: number } | null = null;
      let personalizationError: string | null = null;
      if (input.activate && kit.status !== "active") {
        try { personalizedDefaults = await personalizeBrandPrompts(input.organizationId, ctx.user.id); }
        catch { personalizationError = "Your Brand Kit is saved and active, but its prompt defaults could not be prepared. Existing defaults are unchanged. Use Refresh brand defaults to retry."; }
      }
      return {
        success: true,
        personalizedDefaults,
        personalizationError,
        importedLogos: logos.imported,
        failedLogoUrls: logos.failed,
      };
    }),

  assets: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select()
        .from(brandAssets)
        .where(eq(brandAssets.organizationId, input.organizationId))
        .orderBy(desc(brandAssets.createdAtMs));
    }),

  uploadAsset: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        name: z.string().min(2).max(180),
        type: z.enum(["logo", "font", "product", "reference", "other"]),
        mimeType: z.string().regex(/^image\//),
        base64: z
          .string()
          .min(20)
          .max(12 * 1024 * 1024),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const kit = (
        await db
          .select()
          .from(brandKits)
          .where(eq(brandKits.organizationId, input.organizationId))
          .limit(1)
      )[0];
      if (!kit)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Brand kit not found",
        });
      let bytes: Buffer = Buffer.from(
        input.base64.replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
      if (bytes.length > 8 * 1024 * 1024)
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Assets must be 8 MB or smaller",
        });
      const detected = detectAssetMime(bytes);
      if (!detected?.startsWith("image/") || detected !== input.mimeType)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a valid PNG, JPEG, WebP or GIF image.",
        });
      const outputMimeType = input.type === "logo" ? "image/png" : detected;
      if (input.type === "logo")
        bytes = await normalizeBrandLogo(bytes, detected);
      else await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
      const extension = outputMimeType.split("/")[1].replace("jpeg", "jpg");
      const stored = await storagePut(
        `org-${input.organizationId}/brand/${Date.now()}-${input.name}.${extension}`,
        bytes,
        outputMimeType
      );
      const inserted = await db
        .insert(brandAssets)
        .values({
          organizationId: input.organizationId,
          brandKitId: kit.id,
          name: input.name,
          type: input.type,
          storageKey: stored.key,
          url: stored.url,
          mimeType: outputMimeType,
          status: "pending",
          uploadedByUserId: ctx.user.id,
          createdAtMs: Date.now(),
        })
        .returning({ insertId: brandAssets.id });
      const assetId = Number(inserted[0].insertId);
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "brand_asset.uploaded",
        entityType: "brand_asset",
        entityId: assetId,
        payload: { name: input.name, type: input.type },
      });
      return { assetId, url: stored.url };
    }),

  reviewAsset: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        assetId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "reviewer",
      ]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const asset = (
        await db
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.id, input.assetId),
              eq(brandAssets.organizationId, input.organizationId)
            )
          )
          .limit(1)
      )[0];
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(brandAssets)
        .set({
          status: input.decision,
          reviewedByUserId: ctx.user.id,
          reviewedAtMs: Date.now(),
        })
        .where(eq(brandAssets.id, input.assetId));
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: `brand_asset.${input.decision}`,
        entityType: "brand_asset",
        entityId: input.assetId,
      });
      return { success: true };
    }),
});
