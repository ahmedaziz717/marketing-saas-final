import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { channelConnections } from "../../drizzle/channelSchema";
import { scopeSchema } from "../../shared/channels";
import { googleCustomerIdSchema } from "../../shared/googleAds";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { libraryDatabase } from "../lib/assetLibrary";
import { GoogleAdsError, googleOAuthConfigured } from "../lib/googleAdsApi";
import { googleCampaignsRouter } from "./googleCampaigns";
import {
  beginGoogleOAuth,
  cancelGoogleSelection,
  connectGoogleAccounts,
  disconnectGoogleAccount,
  googleSelection,
  safeGoogleConnection,
  verifyGoogleConnection,
} from "../lib/googleAdsConnections";

const reference = scopeSchema.extend({ id: z.string().uuid() });
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        error instanceof GoogleAdsError
          ? error.message
          : "Google could not complete this request. Please try again.",
    });
  }
}
export const googleAdsRouter = router({
  campaigns: googleCampaignsRouter,
  connections: protectedProcedure
    .input(scopeSchema)
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await libraryDatabase();
      const rows = await db
        .select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.organizationId, input.organizationId),
            eq(channelConnections.channel, "google_ads")
          )
        )
        .orderBy(channelConnections.name);
      return {
        items: rows.map(safeGoogleConnection),
        oauthConfigured: googleOAuthConfigured(),
        livePublishingEnabled: process.env.LIVE_AD_ACTIONS_ENABLED === "true",
      };
    }),
  beginOAuth: protectedProcedure
    .input(scopeSchema)
    .mutation(({ ctx, input }) =>
      safe(async () =>
        beginGoogleOAuth(
          await libraryDatabase(),
          input.organizationId,
          ctx.user.id,
          ctx.res
        )
      )
    ),
  selection: protectedProcedure
    .input(reference)
    .query(({ ctx, input }) =>
      safe(async () =>
        googleSelection(
          await libraryDatabase(),
          input.organizationId,
          ctx.user.id,
          input.id
        )
      )
    ),
  cancelSelection: protectedProcedure
    .input(reference)
    .mutation(({ ctx, input }) =>
      safe(async () =>
        cancelGoogleSelection(
          await libraryDatabase(),
          input.organizationId,
          ctx.user.id,
          input.id
        )
      )
    ),
  connect: protectedProcedure
    .input(
      scopeSchema.extend({
        discoveryId: z.string().uuid(),
        accountIds: z.array(googleCustomerIdSchema).min(1).max(25),
      })
    )
    .mutation(({ ctx, input }) =>
      safe(async () =>
        connectGoogleAccounts(await libraryDatabase(), {
          ...input,
          userId: ctx.user.id,
        })
      )
    ),
  verify: protectedProcedure
    .input(reference)
    .mutation(({ ctx, input }) =>
      safe(async () =>
        verifyGoogleConnection(
          await libraryDatabase(),
          input.organizationId,
          ctx.user.id,
          input.id
        )
      )
    ),
  disconnect: protectedProcedure
    .input(reference.extend({ confirm: z.literal(true) }))
    .mutation(({ ctx, input }) =>
      safe(async () =>
        disconnectGoogleAccount(
          await libraryDatabase(),
          input.organizationId,
          ctx.user.id,
          input.id
        )
      )
    ),
});
