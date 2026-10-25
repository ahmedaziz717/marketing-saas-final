import { googleLibraryVideo } from "../lib/googleVideoUploads";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { scopeSchema } from "../../shared/channels";
import { googleChangeSchema } from "../../shared/googleCampaigns";
import { requireOrganizationRole } from "../lib/access";
import { libraryDatabase } from "../lib/assetLibrary";
import { GoogleAdsError } from "../lib/googleAdsApi";
import { GoogleMutationError } from "../lib/googleAdsMutate";
import { and, eq, inArray } from "drizzle-orm";
import { brandKits, products } from "../../drizzle/schema";
import { generatePmaxCopy } from "../lib/googlePmaxAi";
import { attachMarketingCategories } from "../lib/catalogCategories";
import { selectProductFacts } from "../lib/productFacts";
import { categorySelectionState } from "../../shared/catalogCategories";
import {
  getGoogleDraft,
  googleCampaignInventory,
  googleCampaignResources,
  listGoogleDrafts,
  publishGoogleDraft,
  saveGoogleDraft,
  validateGoogleDraft,
} from "../lib/googleCampaigns";

const account = scopeSchema.extend({ connectionId: z.string().uuid() });
const draft = scopeSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
});
async function safe<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        e instanceof GoogleAdsError || e instanceof GoogleMutationError
          ? e.message
          : "Google Ads could not complete this request. Try again.",
    });
  }
}
const libraryVideo = account.extend({
  key: z.string().regex(/^asset:[1-9][0-9]*$/),
  revision: z.string().min(1).max(200),
});
export const googleCampaignsRouter = router({
  draftPmaxCopy: protectedProcedure
    .input(
      scopeSchema.extend({
        productIds: z.array(z.number().int().positive()).max(10).default([]),
        direction: z.string().trim().max(2000).default(""),
        defaultInstructions: z.string().trim().min(1).max(6000).optional(),
        neutralCategories: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        "owner",
        "admin",
        "creator",
        "publisher",
      ]);
      const db = await libraryDatabase();
      const [brand] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.organizationId, input.organizationId))
        .limit(1);
      if (!brand)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set up your Brand Kit before generating PMax copy.",
        });
      const catalog = input.productIds.length
        ? await db
            .select()
            .from(products)
            .where(
              and(
                eq(products.organizationId, input.organizationId),
                eq(products.status, "approved"),
                inArray(products.id, input.productIds)
              )
            )
        : [];
      if (catalog.length !== new Set(input.productIds).size)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose approved products from this workspace.",
        });
      const categorized = await attachMarketingCategories(
        db,
        input.organizationId,
        catalog
      );
      if (
        categorySelectionState(categorized).requiresChoice &&
        !input.neutralCategories
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Selected products have mixed or unmapped marketing categories. Confirm neutral wording or choose one confirmed category.",
        });
      return generatePmaxCopy(
        {
          brand: {
            name: brand.name,
            businessProfile: brand.businessProfile,
            voice: brand.voice,
            requiredClaims: brand.requiredClaims,
            prohibitedContent: brand.prohibitedContent,
          },
          products: categorized.map(product =>
            selectProductFacts(product, {
              productId: product.id,
              featuredSpecKeys: [],
              includePrice: false,
              includeDescription: true,
            })
          ),
          neutralCategories: input.neutralCategories,
          direction: input.direction,
        },
        input.defaultInstructions
      );
    }),
  videoUploadStatus: protectedProcedure
    .input(libraryVideo)
    .query(({ ctx, input }) =>
      safe(() => googleLibraryVideo(ctx.user.id, input))
    ),
  uploadVideo: protectedProcedure
    .input(
      libraryVideo.extend({ confirm: z.literal(true), generated: z.boolean() })
    )
    .mutation(({ ctx, input }) =>
      safe(() => googleLibraryVideo(ctx.user.id, input, true))
    ),
  inventory: protectedProcedure
    .input(
      account.extend({
        includeInactive: z.boolean().default(false),
        campaignId: z
          .string()
          .regex(/^\d{1,20}$/)
          .optional(),
      })
    )
    .query(({ ctx, input }) =>
      safe(async () => {
        await requireOrganizationRole(ctx.user.id, input.organizationId);
        return googleCampaignInventory(
          await libraryDatabase(),
          input.organizationId,
          input.connectionId,
          input.includeInactive,
          input.campaignId
        );
      })
    ),
  resources: protectedProcedure
    .input(
      account.extend({
        kind: z.enum([
          "assets",
          "audiences",
          "merchants",
          "locations",
          "languages",
        ]),
        search: z.string().trim().max(100).default(""),
      })
    )
    .query(({ ctx, input }) =>
      safe(async () => {
        await requireOrganizationRole(ctx.user.id, input.organizationId);
        return googleCampaignResources(
          await libraryDatabase(),
          input.organizationId,
          input.connectionId,
          input.kind,
          input.search
        );
      })
    ),
  drafts: protectedProcedure.input(account).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    return listGoogleDrafts(
      await libraryDatabase(),
      input.organizationId,
      input.connectionId
    );
  }),
  draft: protectedProcedure
    .input(scopeSchema.extend({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      return getGoogleDraft(
        await libraryDatabase(),
        input.organizationId,
        input.id
      );
    }),
  save: protectedProcedure
    .input(
      account.extend({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        change: googleChangeSchema,
      })
    )
    .mutation(({ ctx, input }) =>
      safe(() => saveGoogleDraft(ctx.user.id, input))
    ),
  validate: protectedProcedure
    .input(draft)
    .mutation(({ ctx, input }) =>
      safe(() => validateGoogleDraft(ctx.user.id, input))
    ),
  publish: protectedProcedure
    .input(
      draft.extend({
        reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
        confirm: z.literal(true),
      })
    )
    .mutation(({ ctx, input }) =>
      safe(() => publishGoogleDraft(ctx.user.id, input))
    ),
});
