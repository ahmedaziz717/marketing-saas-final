import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { videoJobs } from "../../drizzle/videoSchema";
import { aiUsage, creditLedger } from "../../drizzle/platformSchema";
import { campaignBriefs, brandKits } from "../../drizzle/schema";
import {
  activeVideoStatuses,
  videoSetupSchema,
  videoModelKey,
  videoEndpoint,
} from "../../shared/videoCreation";
import { utcCreditMonth } from "../../shared/platformAdmin";
import { studioRoles } from "../../shared/assetWorkflow";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { libraryDatabase } from "../lib/assetLibrary";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { creditState } from "../lib/aiMetering";
import {
  getVideoJob,
  publicVideoJob,
  resolveVideoReferences,
  validateVideoReferences,
  videoReadiness,
  finishVideoFailure,
  requireProductVideo,
  validateVideoPeople,
} from "../lib/videoJobs";
import { videoQuote, videoRate } from "../lib/videoPricing";

const scope = z.object({ organizationId: z.number().int().positive() });
const reference = scope.extend({ id: z.string().uuid() });
export const videoRouter = router({
  options: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    return videoReadiness(await libraryDatabase());
  }),
  list: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    const rows = await (await libraryDatabase())
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.organizationId, input.organizationId))
      .orderBy(desc(videoJobs.createdAtMs))
      .limit(100);
    return rows.map(publicVideoJob);
  }),
  get: protectedProcedure.input(reference).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId, [
      ...studioRoles,
    ]);
    return publicVideoJob(
      await getVideoJob(await libraryDatabase(), input.organizationId, input.id)
    );
  }),
  save: protectedProcedure
    .input(
      scope.extend({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        setup: videoSetupSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      const db = await libraryDatabase();
      if (input.setup.campaignPlanId) {
        const [plan] = await db
          .select({ id: campaignBriefs.id })
          .from(campaignBriefs)
          .where(
            and(
              eq(campaignBriefs.id, input.setup.campaignPlanId),
              eq(campaignBriefs.organizationId, input.organizationId)
            )
          );
        if (!plan)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign plan not found in this workspace.",
          });
      }
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        await validateVideoPeople(tx, input.organizationId, input.setup);
        const now = Date.now();
        if (input.id) {
          const job = await getVideoJob(tx, input.organizationId, input.id);
          if (job.status !== "draft" || job.revision !== input.revision)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This draft has changed. Reopen it before editing, or start a new version.",
            });
          const [saved] = await tx
            .update(videoJobs)
            .set({
              setup: input.setup,
              revision: job.revision + 1,
              updatedAtMs: now,
            })
            .where(eq(videoJobs.id, job.id))
            .returning();
          return publicVideoJob(saved);
        }
        const [saved] = await tx
          .insert(videoJobs)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            setup: input.setup,
            createdAtMs: now,
            updatedAtMs: now,
          })
          .returning();
        return publicVideoJob(saved);
      });
    }),
  quote: protectedProcedure
    .input(scope.extend({ setup: videoSetupSchema }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      requireProductVideo(input.setup);
      const db = await libraryDatabase(),
        refs = await resolveVideoReferences(
          db,
          input.organizationId,
          input.setup
        ),
        rate = await videoRate(db, input.setup);
      const quote = videoQuote(input.setup, refs, rate);
      return { credits: quote.credits, durationSeconds: quote.durationSeconds };
    }),
  generate: protectedProcedure
    .input(
      reference.extend({
        revision: z.number().int().positive(),
        quotedCredits: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      const db = await libraryDatabase();
      const initial = await getVideoJob(db, input.organizationId, input.id);
      requireProductVideo(initial.setup);
      if (initial.status !== "draft") return publicVideoJob(initial);
      if (!(await videoReadiness(db)).ready)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Video generation is awaiting administrator setup. Your draft has been saved.",
        });
      const refs = await resolveVideoReferences(
        db,
        input.organizationId,
        initial.setup
      );
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const job = await getVideoJob(tx, input.organizationId, input.id);
        requireProductVideo(job.setup);
        if (job.status !== "draft") return publicVideoJob(job);
        if (
          job.revision !== input.revision ||
          job.revision !== initial.revision
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The draft changed. Review it and request a new credit estimate.",
          });
        const [kit] = await tx
          .select({ id: brandKits.id })
          .from(brandKits)
          .where(eq(brandKits.organizationId, input.organizationId));
        if (!kit)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Finish workspace setup before generating videos.",
          });
        const active = await tx
          .select({ id: videoJobs.id })
          .from(videoJobs)
          .where(
            and(
              eq(videoJobs.organizationId, input.organizationId),
              inArray(videoJobs.status, [...activeVideoStatuses, "attention"])
            )
          );
        if (active.length >= 3)
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "This workspace already has three video requests in progress. Wait for one to finish.",
          });
        await validateVideoReferences(tx, { ...job, references: refs });
        const rate = await videoRate(tx, job.setup),
          quote = videoQuote(job.setup, refs, rate);
        if (quote.credits !== input.quotedCredits)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The credit price changed. Review the updated estimate before generating.",
          });
        const period = utcCreditMonth(),
          credit = await creditState(tx, input.organizationId, period),
          now = Date.now();
        if (credit.account?.aiPaused)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "AI generation is paused for this workspace.",
          });
        if (credit.account?.enforceCredits && credit.remaining < quote.credits)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `This video needs ${quote.credits} AI credits; ${Math.max(0, credit.remaining)} remain.`,
          });
        await tx.insert(aiUsage).values({
          id: job.id,
          organizationId: input.organizationId,
          actorUserId: ctx.user.id,
          provider: "higgsfield",
          model: videoModelKey(job.setup),
          kind: "video",
          operation: `video.${job.setup.mode}`,
          status: "pending",
          credits: quote.credits,
          period,
          rateSnapshot: rate,
          createdAtMs: now,
        });
        await tx.insert(creditLedger).values({
          id: job.id,
          organizationId: input.organizationId,
          actorUserId: ctx.user.id,
          period,
          amount: -quote.credits,
          reason: "Reserved: video generation",
          createdAtMs: now,
        });
        const [saved] = await tx
          .update(videoJobs)
          .set({
            status: "queued",
            actorUserId: ctx.user.id,
            endpoint: videoEndpoint(job.setup),
            references: refs,
            credits: quote.credits,
            revision: job.revision + 1,
            updatedAtMs: now,
          })
          .where(eq(videoJobs.id, job.id))
          .returning();
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "video.queued",
            entityType: "video_job",
            entityId: job.id,
            payload: { mode: job.setup.mode, credits: quote.credits },
          },
          tx
        );
        return publicVideoJob(saved);
      });
    }),
  cancel: protectedProcedure
    .input(reference)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      return withOrganizationTransaction(
        await libraryDatabase(),
        input.organizationId,
        async tx => {
          const job = await getVideoJob(tx, input.organizationId, input.id);
          if (!["queued", "submitting", "generating"].includes(job.status))
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "This request can no longer be canceled.",
            });
          if (job.status === "queued" && !job.leaseOwner && !job.requestBody)
            await finishVideoFailure(
              tx,
              job,
              "canceled",
              "Canceled before generation. AI credits refunded."
            );
          else
            await tx
              .update(videoJobs)
              .set({ cancelRequested: 1, updatedAtMs: Date.now() })
              .where(eq(videoJobs.id, job.id));
          return { ok: true };
        }
      );
    }),
  checkAgain: protectedProcedure
    .input(reference)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...studioRoles,
      ]);
      return withOrganizationTransaction(
        await libraryDatabase(),
        input.organizationId,
        async tx => {
          const job = await getVideoJob(tx, input.organizationId, input.id);
          if (job.status !== "attention")
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "This request is already being checked.",
            });
          if (
            !job.providerRequestId &&
            job.requestPreparedAtMs &&
            Date.now() - job.requestPreparedAtMs > 20 * 3600000
          )
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "An administrator must reconcile this request with the video provider before it can be retried. Your references’ download links have expired.",
            });
          await tx
            .update(videoJobs)
            .set({
              status: job.outputUrl
                ? "saving"
                : job.providerRequestId
                  ? "generating"
                  : "submitting",
              error: null,
              nextPollAtMs: 0,
              leaseUntilMs: 0,
              leaseOwner: null,
              updatedAtMs: Date.now(),
            })
            .where(eq(videoJobs.id, job.id));
          return { ok: true };
        }
      );
    }),
});
