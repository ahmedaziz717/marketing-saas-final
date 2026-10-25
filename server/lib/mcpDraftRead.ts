import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { campaignBriefs, organizationMemberships } from "../../drizzle/schema";
import {
  channelConnections,
  googleCampaignDrafts,
  publications,
} from "../../drizzle/channelSchema";
import { videoJobs } from "../../drizzle/videoSchema";
import { workflowRoles } from "../../shared/creativeWorkflow";
import { creativeSetupSchema } from "../../shared/creativeBuilder";
import { videoSetupSchema } from "../../shared/videoCreation";
import { googleChangeSchema } from "../../shared/googleCampaigns";
import { contentSchema } from "../../shared/channels";
import { getDb } from "../db";
import { membershipAuthorization } from "./access";
import { withOrganizationTransaction } from "./activity";
import type { DraftTransaction } from "./mcpDraftReceipt";

const pageInput = z.object({
  organizationId: z.number().int().positive(),
  limit: z.number().int().min(1).max(20).default(20),
});
export const mcpCreativeDraftReadInput = pageInput
  .extend({
    id: z.number().int().positive().optional(),
    afterId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    v => v.id === undefined || v.afterId === undefined,
    "Choose a single draft ID or a pagination cursor, not both."
  );
export const mcpUuidDraftReadInput = pageInput
  .extend({
    id: z.string().uuid().optional(),
    afterId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    v => v.id === undefined || v.afterId === undefined,
    "Choose a single draft ID or a pagination cursor, not both."
  );
export const mcpAccountReadInput = pageInput
  .extend({
    afterId: z.string().uuid().optional(),
    channel: z.enum(["google_ads", "meta_ads", "facebook"]).optional(),
  })
  .strict();

function page<T>(rows: T[], limit: number, id: (row: T) => string | number) {
  const items = rows.slice(0, limit);
  return {
    items,
    nextAfterId: rows.length > limit ? id(items[items.length - 1]) : null,
  };
}
function safePayload<S extends z.ZodType>(schema: S, value: unknown) {
  const parsed = schema.safeParse(value);
  return {
    value: parsed.success ? parsed.data : null,
    needsRepair: !parsed.success,
  };
}

/** Local draft context only, with explicit fields and no provider access or raw result history.
 * Adapters bind authorize to the particular creative/campaign scope before calling a method. */
export function mcpDraftRead(
  userId: number,
  authorize: (tx: DraftTransaction, organizationId: number) => Promise<void>
) {
  async function transaction<T>(
    organizationId: number,
    run: (tx: DraftTransaction) => Promise<T>
  ) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return withOrganizationTransaction(db, organizationId, async tx => {
      const [membership] = await tx
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.userId, userId)
          )
        )
        .for("share");
      if (
        !membershipAuthorization({
          membership,
          userId,
          organizationId,
          allowedRoles: [...workflowRoles],
        }).allowed
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Your active workspace membership does not permit this action.",
        });
      await authorize(tx, organizationId);
      return run(tx);
    });
  }
  return {
    async creative(raw: unknown) {
      const input = mcpCreativeDraftReadInput.parse(raw);
      return transaction(input.organizationId, async tx => {
        const rows = await tx
          .select({
            briefId: campaignBriefs.id,
            name: campaignBriefs.name,
            setup: campaignBriefs.creativeSetup,
            status: campaignBriefs.status,
            updatedAtMs: campaignBriefs.updatedAtMs,
          })
          .from(campaignBriefs)
          .where(
            and(
              eq(campaignBriefs.organizationId, input.organizationId),
              eq(campaignBriefs.status, "draft"),
              isNotNull(campaignBriefs.creativeSetup),
              input.id ? eq(campaignBriefs.id, input.id) : undefined,
              input.afterId ? gt(campaignBriefs.id, input.afterId) : undefined
            )
          )
          .orderBy(asc(campaignBriefs.id))
          .limit(input.limit + 1);
        const result = page(rows, input.limit, r => r.briefId);
        return {
          ...result,
          items: result.items.map(row => {
            const setup = safePayload(creativeSetupSchema, row.setup);
            return {
              ...row,
              setup: setup.value,
              needsRepair: setup.needsRepair,
            };
          }),
        };
      });
    },
    async video(raw: unknown) {
      const input = mcpUuidDraftReadInput.parse(raw);
      return transaction(input.organizationId, async tx => {
        const rows = await tx
          .select({
            id: videoJobs.id,
            revision: videoJobs.revision,
            setup: videoJobs.setup,
            status: videoJobs.status,
            updatedAtMs: videoJobs.updatedAtMs,
          })
          .from(videoJobs)
          .where(
            and(
              eq(videoJobs.organizationId, input.organizationId),
              eq(videoJobs.status, "draft"),
              input.id ? eq(videoJobs.id, input.id) : undefined,
              input.afterId ? gt(videoJobs.id, input.afterId) : undefined
            )
          )
          .orderBy(asc(videoJobs.id))
          .limit(input.limit + 1);
        const result = page(rows, input.limit, r => r.id);
        return {
          ...result,
          items: result.items.map(row => {
            const setup = safePayload(videoSetupSchema, row.setup);
            return {
              ...row,
              setup: setup.value,
              needsRepair: setup.needsRepair,
            };
          }),
        };
      });
    },
    async google(raw: unknown) {
      const input = mcpUuidDraftReadInput.parse(raw);
      return transaction(input.organizationId, async tx => {
        const rows = await tx
          .select({
            id: googleCampaignDrafts.id,
            revision: googleCampaignDrafts.revision,
            connectionId: googleCampaignDrafts.connectionId,
            change: googleCampaignDrafts.change,
            state: googleCampaignDrafts.state,
            updatedAtMs: googleCampaignDrafts.updatedAtMs,
          })
          .from(googleCampaignDrafts)
          .where(
            and(
              eq(googleCampaignDrafts.organizationId, input.organizationId),
              eq(googleCampaignDrafts.state, "draft"),
              input.id ? eq(googleCampaignDrafts.id, input.id) : undefined,
              input.afterId
                ? gt(googleCampaignDrafts.id, input.afterId)
                : undefined
            )
          )
          .orderBy(asc(googleCampaignDrafts.id))
          .limit(input.limit + 1);
        const result = page(rows, input.limit, r => r.id);
        return {
          ...result,
          items: result.items.map(row => {
            const change = safePayload(googleChangeSchema, row.change);
            return {
              ...row,
              change: change.value,
              needsRepair: change.needsRepair,
            };
          }),
        };
      });
    },
    async publication(raw: unknown) {
      const input = mcpUuidDraftReadInput.parse(raw);
      return transaction(input.organizationId, async tx => {
        const rows = await tx
          .select({
            id: publications.id,
            revision: publications.revision,
            connectionId: publications.connectionId,
            channel: publications.channel,
            assetKey: publications.assetKey,
            content: publications.content,
            state: publications.state,
            timezone: publications.timezone,
            scheduledAtMs: publications.scheduledAtMs,
            updatedAtMs: publications.updatedAtMs,
          })
          .from(publications)
          .where(
            and(
              eq(publications.organizationId, input.organizationId),
              eq(publications.state, "draft"),
              input.id ? eq(publications.id, input.id) : undefined,
              input.afterId ? gt(publications.id, input.afterId) : undefined
            )
          )
          .orderBy(asc(publications.id))
          .limit(input.limit + 1);
        const result = page(rows, input.limit, r => r.id);
        return {
          ...result,
          items: result.items.map(row => {
            const content = safePayload(contentSchema, row.content);
            return {
              ...row,
              content: content.value,
              needsRepair: content.needsRepair,
            };
          }),
        };
      });
    },
    async accounts(raw: unknown) {
      const input = mcpAccountReadInput.parse(raw);
      return transaction(input.organizationId, async tx =>
        page(
          await tx
            .select({
              id: channelConnections.id,
              name: channelConnections.name,
              channel: channelConnections.channel,
              status: channelConnections.status,
            })
            .from(channelConnections)
            .where(
              and(
                eq(channelConnections.organizationId, input.organizationId),
                eq(channelConnections.status, "connected"),
                input.channel
                  ? eq(channelConnections.channel, input.channel)
                  : inArray(channelConnections.channel, [
                      "google_ads",
                      "meta_ads",
                      "facebook",
                    ]),
                input.afterId
                  ? gt(channelConnections.id, input.afterId)
                  : undefined
              )
            )
            .orderBy(asc(channelConnections.id))
            .limit(input.limit + 1),
          input.limit,
          r => r.id
        )
      );
    },
  };
}
