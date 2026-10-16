import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray } from "drizzle-orm";
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
  independentWidgetConfig,
  insightConfigSchema,
  insightMetrics,
  nextInsightRun,
  type DashboardWidget,
} from "../../shared/insights";
import { withOrganizationTransaction } from "./activity";
import {
  insightRunValues,
  reportById,
  validateInsightConfig,
  type InsightsDatabase,
} from "./insights";

export const widgetEditSchema = z.object({
  widgetId: z.string().uuid(),
  revision: z.number().int().positive().optional(),
  config: insightConfigSchema,
});
const conflict = () =>
  new TRPCError({
    code: "CONFLICT",
    message: "This dashboard changed in another tab. Reload before saving.",
  });

/** Layout, private reporting entities and initial runs are committed together. */
export async function saveInsightDashboard(
  db: InsightsDatabase,
  userId: number,
  input: {
    organizationId: number;
    id?: string;
    revision?: number;
    layout: z.infer<typeof dashboardLayoutSchema>;
    widgetEdits: z.infer<typeof widgetEditSchema>[];
  }
) {
  return withOrganizationTransaction(db, input.organizationId, async tx => {
    const database = tx as unknown as InsightsDatabase;
    const now = Date.now();
    const [existing] = input.id
      ? await tx
          .select()
          .from(insightDashboards)
          .where(
            and(
              eq(insightDashboards.id, input.id),
              eq(insightDashboards.organizationId, input.organizationId),
              eq(insightDashboards.userId, userId),
              eq(insightDashboards.surface, input.layout.surface)
            )
          )
      : [];
    if (input.id && (!existing || existing.revision !== input.revision))
      throw conflict();
    if (!existing) {
      const layouts = await tx
        .select({ id: insightDashboards.id })
        .from(insightDashboards)
        .where(
          and(
            eq(insightDashboards.organizationId, input.organizationId),
            eq(insightDashboards.userId, userId),
            eq(insightDashboards.surface, input.layout.surface)
          )
        );
      if (layouts.length >= 20)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can save up to 20 layouts per dashboard.",
        });
    }
    if (
      input.widgetEdits.some(
        e => !input.layout.widgets.some(w => w.id === e.widgetId)
      ) ||
      new Set(input.widgetEdits.map(e => e.widgetId)).size !==
        input.widgetEdits.length
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose an existing widget to edit.",
      });
    const connections = await tx
      .select({
        id: channelConnections.id,
        channel: channelConnections.channel,
      })
      .from(channelConnections)
      .where(eq(channelConnections.organizationId, input.organizationId));
    const widgets: DashboardWidget[] = [];
    for (const widget of input.layout.widgets) {
      const previous = existing?.widgets.find(w => w.id === widget.id);
      if (previous && previous.reportId !== widget.reportId) throw conflict();
      const source = await reportById(
        database,
        input.organizationId,
        widget.reportId,
        userId
      );
      const edit = input.widgetEdits.find(e => e.widgetId === widget.id);
      const config = independentWidgetConfig(edit?.config ?? source.config);
      const account = connections.find(c => c.id === widget.connectionId);
      if (
        widget.kind !== "report" &&
        (!account ||
          !config.connectionIds.includes(account.id) ||
          !config.metrics.includes(widget.metric) ||
          insightMetrics[widget.metric].channel !== account.channel)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This widget no longer matches its accounts and metrics. Review its content.",
        });
      const isOwned = !!previous && source.widgetOwnerUserId === userId;
      const changed = !isDeepStrictEqual(config, source.config);
      if (changed || !isOwned)
        await validateInsightConfig(
          database,
          input.organizationId,
          config,
          true
        );
      let entity = source;
      if (isOwned) {
        if (edit && edit.revision !== source.revision) throw conflict();
        if (changed) {
          [entity] = await tx
            .update(insightReports)
            .set({
              config,
              revision: source.revision + 1,
              actorUserId: userId,
              updatedAtMs: now,
              nextRunAtMs: nextInsightRun(config, now),
              scheduleError: null,
            })
            .where(eq(insightReports.id, source.id))
            .returning();
          await tx
            .insert(insightRuns)
            .values(insightRunValues(entity, now, "manual", false, userId));
        }
      } else {
        // New tiles always receive their own entity, even when copied from another layout.
        [entity] = await tx
          .insert(insightReports)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            actorUserId: userId,
            widgetOwnerUserId: userId,
            sourceReportId: source.sourceReportId ?? source.id,
            config,
            nextRunAtMs: nextInsightRun(config, now),
            createdAtMs: now,
            updatedAtMs: now,
          })
          .returning();
        const [snapshot] = await tx
          .select()
          .from(insightRuns)
          .where(
            and(
              eq(insightRuns.reportId, source.id),
              eq(insightRuns.revision, source.revision),
              inArray(insightRuns.status, ["completed", "partial"])
            )
          )
          .orderBy(desc(insightRuns.createdAtMs))
          .limit(1);
        if (
          snapshot &&
          isDeepStrictEqual(independentWidgetConfig(source.config), config)
        ) {
          await tx.insert(insightRuns).values({
            ...insightRunValues(
              entity,
              snapshot.createdAtMs,
              "manual",
              false,
              userId
            ),
            status: snapshot.status,
            result: snapshot.result,
            finishedAtMs: snapshot.finishedAtMs,
          });
        } else {
          await tx
            .insert(insightRuns)
            .values(insightRunValues(entity, now, "manual", false, userId));
        }
      }
      widgets.push({ ...widget, reportId: entity.id });
    }
    // Removing a tile also stops its independent schedule and pending work.
    const removed =
      existing?.widgets
        .filter(w => !widgets.some(next => next.id === w.id))
        .map(w => w.reportId) ?? [];
    if (removed.length)
      await tx
        .update(insightReports)
        .set({ archived: 1, nextRunAtMs: null, updatedAtMs: now })
        .where(
          and(
            inArray(insightReports.id, removed),
            eq(insightReports.widgetOwnerUserId, userId)
          )
        );
    const values = { ...input.layout, widgets, updatedAtMs: now };
    const [row] = existing
      ? await tx
          .update(insightDashboards)
          .set({ ...values, revision: existing.revision + 1 })
          .where(eq(insightDashboards.id, existing.id))
          .returning()
      : await tx
          .insert(insightDashboards)
          .values({
            ...values,
            id: randomUUID(),
            organizationId: input.organizationId,
            userId,
            createdAtMs: now,
          })
          .returning();
    return row;
  });
}
