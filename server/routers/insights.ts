import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  insightDashboards,
  insightReports,
  insightRuns,
} from "../../drizzle/insightsSchema";
import { channelConnections } from "../../drizzle/channelSchema";
import {
  dashboardLayoutSchema,
  insightConfigSchema,
  nextInsightRun,
} from "../../shared/insights";
import { scopeSchema } from "../../shared/channels";
import { protectedProcedure, router } from "../_core/trpc";
import { requireOrganizationRole } from "../lib/access";
import { appendActivity, withOrganizationTransaction } from "../lib/activity";
import { libraryDatabase } from "../lib/assetLibrary";
import {
  enqueueInsight,
  insightRecipients,
  reportById,
  reportEditors,
  validateInsightConfig,
  type InsightsDatabase,
} from "../lib/insights";
import { insightEmailConfigured } from "../lib/insightDelivery";
import { insightPdf } from "../lib/insightPdf";
import { saveInsightDashboard, widgetEditSchema } from "../lib/insightWidgets";

const ref = scopeSchema.extend({ id: z.string().uuid() });
const surface = z.enum(["main", "measure"]);
const canEdit = (role: string) =>
  (reportEditors as readonly string[]).includes(role);
export const insightsRouter = router({
  options: protectedProcedure
    .input(scopeSchema)
    .query(async ({ ctx, input }) => {
      const access = await requireOrganizationRole(
        ctx.user.id,
        input.organizationId
      );
      const db = await libraryDatabase();
      const connections = await db
        .select({
          id: channelConnections.id,
          name: channelConnections.name,
          channel: channelConnections.channel,
          status: channelConnections.status,
          details: channelConnections.details,
        })
        .from(channelConnections)
        .where(eq(channelConnections.organizationId, input.organizationId));
      return {
        connections: connections.map(c => ({
          id: c.id,
          name: c.name,
          channel: c.channel,
          status: c.status,
          currency: c.details.currency,
          timezone: c.details.timezone,
        })),
        recipients: await insightRecipients(db, input.organizationId),
        emailConfigured: insightEmailConfigured(),
        canEdit: canEdit(access.membership.role),
      };
    }),
  list: protectedProcedure.input(scopeSchema).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await libraryDatabase();
    const reports = await db
      .select()
      .from(insightReports)
      .where(
        and(
          eq(insightReports.organizationId, input.organizationId),
          eq(insightReports.archived, 0),
          isNull(insightReports.widgetOwnerUserId)
        )
      )
      .orderBy(desc(insightReports.updatedAtMs))
      .limit(100);
    const latest = reports.length
      ? await db
          .selectDistinctOn([insightRuns.reportId], {
            id: insightRuns.id,
            reportId: insightRuns.reportId,
            status: insightRuns.status,
            createdAtMs: insightRuns.createdAtMs,
            finishedAtMs: insightRuns.finishedAtMs,
            deliveryState: insightRuns.deliveryState,
            deliveryError: insightRuns.deliveryError,
          })
          .from(insightRuns)
          .where(
            and(
              eq(insightRuns.organizationId, input.organizationId),
              inArray(
                insightRuns.reportId,
                reports.map(r => r.id)
              )
            )
          )
          .orderBy(insightRuns.reportId, desc(insightRuns.createdAtMs))
      : [];
    return reports.map(report => ({
      ...report,
      latest: latest.find(r => r.reportId === report.id) ?? null,
    }));
  }),
  get: protectedProcedure.input(ref).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    return reportById(await libraryDatabase(), input.organizationId, input.id);
  }),
  save: protectedProcedure
    .input(
      scopeSchema.extend({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        config: insightConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...reportEditors,
      ]);
      const db = await libraryDatabase();
      await validateInsightConfig(db, input.organizationId, input.config);
      if (input.config.delivery.email && !insightEmailConfigured())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Email delivery is not configured. Save with email notifications off or ask your administrator to enable delivery.",
        });
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const now = Date.now();
        const existing = input.id
          ? await reportById(
              tx as unknown as InsightsDatabase,
              input.organizationId,
              input.id
            )
          : null;
        if (existing && existing.revision !== input.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Someone updated this report. Reload to keep their changes.",
          });
        if (
          existing &&
          !existing.scheduleError &&
          isDeepStrictEqual(existing.config, input.config)
        )
          return existing;
        const nextRunAtMs =
          existing &&
          isDeepStrictEqual(existing.config.schedule, input.config.schedule) &&
          existing.config.timezone === input.config.timezone &&
          !existing.scheduleError
            ? existing.nextRunAtMs
            : nextInsightRun(input.config, now);
        const values = {
          config: input.config,
          actorUserId: ctx.user.id,
          nextRunAtMs,
          scheduleError: null,
          updatedAtMs: now,
        };
        const [row] = existing
          ? await tx
              .update(insightReports)
              .set({ ...values, revision: existing.revision + 1 })
              .where(
                and(
                  eq(insightReports.id, existing.id),
                  eq(insightReports.revision, existing.revision)
                )
              )
              .returning()
          : await tx
              .insert(insightReports)
              .values({
                ...values,
                id: randomUUID(),
                organizationId: input.organizationId,
                createdAtMs: now,
              })
              .returning();
        if (!row)
          throw new TRPCError({
            code: "CONFLICT",
            message: "The report changed. Reload and try again.",
          });
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: existing
              ? "insight_report_updated"
              : "insight_report_created",
            entityType: "insight_report",
            entityId: row.id,
            payload: {
              revision: row.revision,
              scheduled: input.config.schedule.enabled,
            },
          },
          tx
        );
        return row;
      });
    }),
  archive: protectedProcedure
    .input(ref.extend({ revision: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...reportEditors,
      ]);
      const db = await libraryDatabase();
      const [row] = await db
        .update(insightReports)
        .set({
          archived: 1,
          nextRunAtMs: null,
          revision: input.revision + 1,
          updatedAtMs: Date.now(),
        })
        .where(
          and(
            eq(insightReports.id, input.id),
            isNull(insightReports.widgetOwnerUserId),
            eq(insightReports.organizationId, input.organizationId),
            eq(insightReports.revision, input.revision),
            eq(insightReports.archived, 0)
          )
        )
        .returning({ id: insightReports.id });
      if (!row)
        throw new TRPCError({
          code: "CONFLICT",
          message: "The report changed or is no longer available.",
        });
      await appendActivity({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        action: "insight_report_archived",
        entityType: "insight_report",
        entityId: input.id,
      });
      return { ok: true };
    }),
  pause: protectedProcedure
    .input(ref.extend({ revision: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...reportEditors,
      ]);
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const report = await reportById(
          tx as unknown as InsightsDatabase,
          input.organizationId,
          input.id
        );
        if (report.revision !== input.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This report changed. Reload before pausing it.",
          });
        await tx
          .update(insightReports)
          .set({
            config: {
              ...report.config,
              schedule: { ...report.config.schedule, enabled: false },
            },
            nextRunAtMs: null,
            revision: report.revision + 1,
            scheduleError: null,
            updatedAtMs: Date.now(),
          })
          .where(eq(insightReports.id, input.id));
        await appendActivity(
          {
            organizationId: input.organizationId,
            actorUserId: ctx.user.id,
            action: "insight_schedule_paused",
            entityType: "insight_report",
            entityId: input.id,
          },
          tx
        );
        return { ok: true };
      });
    }),
  run: protectedProcedure
    .input(
      ref.extend({
        revision: z.number().int().positive(),
        notify: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId, [
        ...reportEditors,
      ]);
      return enqueueInsight(
        await libraryDatabase(),
        input.organizationId,
        input.id,
        ctx.user.id,
        input.revision,
        input.notify
      );
    }),
  runs: protectedProcedure
    .input(ref.extend({ before: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await libraryDatabase();
      await reportById(db, input.organizationId, input.id, ctx.user.id);
      return db
        .select({
          id: insightRuns.id,
          revision: insightRuns.revision,
          status: insightRuns.status,
          trigger: insightRuns.trigger,
          createdAtMs: insightRuns.createdAtMs,
          finishedAtMs: insightRuns.finishedAtMs,
          error: insightRuns.error,
          deliveryState: insightRuns.deliveryState,
          deliveryError: insightRuns.deliveryError,
          deliveredAtMs: insightRuns.deliveredAtMs,
        })
        .from(insightRuns)
        .where(
          and(
            eq(insightRuns.organizationId, input.organizationId),
            eq(insightRuns.reportId, input.id)
          )
        )
        .orderBy(desc(insightRuns.createdAtMs))
        .limit(50);
    }),
  runDetail: protectedProcedure.input(ref).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await libraryDatabase();
    const [run] = await db
      .select()
      .from(insightRuns)
      .where(
        and(
          eq(insightRuns.organizationId, input.organizationId),
          eq(insightRuns.id, input.id)
        )
      )
      .limit(1);
    if (!run)
      throw new TRPCError({ code: "NOT_FOUND", message: "Run not found." });
    await reportById(db, input.organizationId, run.reportId, ctx.user.id);
    const { deliveryPayload, deliveryLeaseId, leaseId, ...safe } = run;
    return safe;
  }),
  pdf: protectedProcedure.input(ref).query(async ({ ctx, input }) => {
    await requireOrganizationRole(ctx.user.id, input.organizationId);
    const db = await libraryDatabase();
    const [run] = await db
      .select()
      .from(insightRuns)
      .where(
        and(
          eq(insightRuns.organizationId, input.organizationId),
          eq(insightRuns.id, input.id)
        )
      )
      .limit(1);
    if (!run?.result)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "This run has no report to export.",
      });
    await reportById(db, input.organizationId, run.reportId, ctx.user.id);
    return {
      filename: `evokeloop-report-${run.result.range.until}-${run.id.slice(0, 8)}.pdf`,
      base64: (await insightPdf(run)).toString("base64"),
    };
  }),
  dashboards: protectedProcedure
    .input(scopeSchema.extend({ surface }))
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      return (await libraryDatabase())
        .select()
        .from(insightDashboards)
        .where(
          and(
            eq(insightDashboards.organizationId, input.organizationId),
            eq(insightDashboards.userId, ctx.user.id),
            eq(insightDashboards.surface, input.surface)
          )
        )
        .orderBy(desc(insightDashboards.updatedAtMs))
        .limit(20);
    }),
  saveDashboard: protectedProcedure
    .input(
      scopeSchema.extend({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        layout: dashboardLayoutSchema,
        widgetEdits: z.array(widgetEditSchema).max(30).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      return saveInsightDashboard(await libraryDatabase(), ctx.user.id, input);
    }),
  refreshWidget: protectedProcedure
    .input(ref.extend({ revision: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await libraryDatabase();
      const entity = await reportById(
        db,
        input.organizationId,
        input.id,
        ctx.user.id
      );
      if (entity.widgetOwnerUserId !== ctx.user.id)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Widget not found.",
        });
      return enqueueInsight(
        db,
        input.organizationId,
        input.id,
        ctx.user.id,
        input.revision,
        false
      );
    }),
  deleteDashboard: protectedProcedure
    .input(ref)
    .mutation(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      const db = await libraryDatabase();
      return withOrganizationTransaction(db, input.organizationId, async tx => {
        const [row] = await tx
          .delete(insightDashboards)
          .where(
            and(
              eq(insightDashboards.id, input.id),
              eq(insightDashboards.organizationId, input.organizationId),
              eq(insightDashboards.userId, ctx.user.id)
            )
          )
          .returning();
        if (row?.widgets.length)
          await tx
            .update(insightReports)
            .set({ archived: 1, nextRunAtMs: null, updatedAtMs: Date.now() })
            .where(
              and(
                inArray(
                  insightReports.id,
                  row.widgets.map(w => w.reportId)
                ),
                eq(insightReports.widgetOwnerUserId, ctx.user.id)
              )
            );
        return { ok: true };
      });
    }),
  dashboardData: protectedProcedure
    .input(
      scopeSchema.extend({ reportIds: z.array(z.string().uuid()).max(30) })
    )
    .query(async ({ ctx, input }) => {
      await requireOrganizationRole(ctx.user.id, input.organizationId);
      if (!input.reportIds.length) return [];
      const db = await libraryDatabase();
      const reports = await db
        .select()
        .from(insightReports)
        .where(
          and(
            eq(insightReports.organizationId, input.organizationId),
            eq(insightReports.archived, 0),
            inArray(insightReports.id, input.reportIds),
            or(
              isNull(insightReports.widgetOwnerUserId),
              eq(insightReports.widgetOwnerUserId, ctx.user.id)
            )
          )
        );
      const fields = {
        id: insightRuns.id,
        reportId: insightRuns.reportId,
        revision: insightRuns.revision,
        config: insightRuns.config,
        status: insightRuns.status,
        result: insightRuns.result,
        error: insightRuns.error,
        createdAtMs: insightRuns.createdAtMs,
        finishedAtMs: insightRuns.finishedAtMs,
      };
      const scope = and(
        eq(insightRuns.organizationId, input.organizationId),
        inArray(
          insightRuns.reportId,
          reports.map(r => r.id)
        )
      );
      const [latest, snapshots] = await Promise.all([
        db
          .selectDistinctOn([insightRuns.reportId], fields)
          .from(insightRuns)
          .where(scope)
          .orderBy(insightRuns.reportId, desc(insightRuns.createdAtMs)),
        db
          .selectDistinctOn([insightRuns.reportId], fields)
          .from(insightRuns)
          .where(
            and(scope, inArray(insightRuns.status, ["completed", "partial"]))
          )
          .orderBy(insightRuns.reportId, desc(insightRuns.createdAtMs)),
      ]);
      return reports.map(report => ({
        report,
        latest: latest.find(r => r.reportId === report.id) ?? null,
        snapshot: snapshots.find(r => r.reportId === report.id) ?? null,
      }));
    }),
});
