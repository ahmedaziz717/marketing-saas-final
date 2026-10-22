import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { scopeSchema } from "../../shared/channels";
import { googleChangeSchema } from "../../shared/googleCampaigns";
import { requireOrganizationRole } from "../lib/access";
import { libraryDatabase } from "../lib/assetLibrary";
import { GoogleAdsError } from "../lib/googleAdsApi";
import { GoogleMutationError } from "../lib/googleAdsMutate";
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
export const googleCampaignsRouter = router({
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
