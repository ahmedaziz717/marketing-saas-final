import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { organizationMemberships, users } from "../../drizzle/schema";
import { channelConnections } from "../../drizzle/channelSchema";
import {
  insightReports,
  insightRuns,
  type InsightReportRow,
} from "../../drizzle/insightsSchema";
import {
  insightConfigSchema,
  insightMetrics,
  nextInsightRun,
  type InsightConfig,
} from "../../shared/insights";
import { getDb } from "../db";
import { requireOrganizationRole } from "./access";
import { withOrganizationTransaction } from "./activity";
import { buildInsightResult } from "./insightsData";

export type InsightsDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const reportEditors = [
  "owner",
  "admin",
  "creator",
  "publisher",
] as const;
export async function reportById(
  db: InsightsDatabase,
  organizationId: number,
  id: string,
  viewerUserId?: number
) {
  const [row] = await db
    .select()
    .from(insightReports)
    .where(
      and(
        eq(insightReports.organizationId, organizationId),
        eq(insightReports.id, id),
        eq(insightReports.archived, 0)
      )
    )
    .limit(1);
  if (
    !row ||
    (row.widgetOwnerUserId !== null && row.widgetOwnerUserId !== viewerUserId)
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Report not found in this workspace.",
    });
  return row;
}
export async function insightRecipients(
  db: InsightsDatabase,
  organizationId: number
) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
        isNotNull(users.email)
      )
    )
    .orderBy(users.name);
}
export async function validateInsightConfig(
  db: InsightsDatabase,
  organizationId: number,
  config: InsightConfig,
  allowUnusedSources = false
) {
  const accounts = await db
    .select({ id: channelConnections.id, channel: channelConnections.channel })
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.organizationId, organizationId),
        eq(channelConnections.status, "connected"),
        inArray(channelConnections.channel, ["facebook", "meta_ads"]),
        inArray(channelConnections.id, config.connectionIds)
      )
    );
  if (accounts.length !== config.connectionIds.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose connected accounts belonging to this workspace.",
    });
  for (const a of accounts)
    if (
      !allowUnusedSources &&
      !config.metrics.some(m => insightMetrics[m].channel === a.channel)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Select at least one metric for every selected channel.",
      });
  if (config.delivery.email) {
    const recipients = await insightRecipients(db, organizationId);
    if (
      config.delivery.recipientUserIds.some(
        id => !recipients.some(r => r.userId === id)
      )
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Recipients must be active workspace members with an email address.",
      });
  }
  if (config.schedule.enabled && !nextInsightRun(config))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This schedule has no future runs. Check its dates.",
    });
}
export function insightRunValues(
  report: InsightReportRow,
  now: number,
  trigger: "manual" | "scheduled",
  notify: boolean,
  actorUserId = report.actorUserId
) {
  return {
    id: randomUUID(),
    reportId: report.id,
    organizationId: report.organizationId,
    actorUserId,
    revision: report.revision,
    config: report.config,
    trigger,
    scheduledForMs: trigger === "scheduled" ? report.nextRunAtMs : null,
    status: "queued" as const,
    createdAtMs: now,
    deliveryState:
      notify && report.config.delivery.email
        ? ("waiting" as const)
        : ("disabled" as const),
  };
}
export async function enqueueInsight(
  db: InsightsDatabase,
  organizationId: number,
  id: string,
  actor: number,
  revision: number,
  notify = false
) {
  return withOrganizationTransaction(db, organizationId, async tx => {
    const report = await reportById(
      tx as unknown as InsightsDatabase,
      organizationId,
      id,
      actor
    );
    await tx
      .select({ id: insightReports.id })
      .from(insightReports)
      .where(eq(insightReports.id, id))
      .for("update");
    if (report.revision !== revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "The report changed. Reload it before running.",
      });
    const [active] = await tx
      .select()
      .from(insightRuns)
      .where(
        and(
          eq(insightRuns.reportId, id),
          inArray(insightRuns.status, ["queued", "running"]),
          eq(insightRuns.revision, report.revision)
        )
      )
      .limit(1);
    if (active) return { id: active.id, alreadyRunning: true };
    const [recent] = await tx
      .select({ createdAtMs: insightRuns.createdAtMs })
      .from(insightRuns)
      .where(eq(insightRuns.reportId, id))
      .orderBy(desc(insightRuns.createdAtMs))
      .limit(1);
    if (recent && Date.now() - recent.createdAtMs < 30000)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Please wait 30 seconds before refreshing this report again.",
      });
    const values = insightRunValues(
      report,
      Date.now(),
      "manual",
      report.widgetOwnerUserId === null && notify,
      actor
    );
    await tx.insert(insightRuns).values(values);
    return { id: values.id, alreadyRunning: false };
  });
}
/** Row locks and a unique schedule slot make each due run durable and idempotent. */
export async function scheduleInsights(db: InsightsDatabase, now = Date.now()) {
  await db.transaction(async tx => {
    const due = await tx
      .select()
      .from(insightReports)
      .where(
        and(
          eq(insightReports.archived, 0),
          lte(insightReports.nextRunAtMs, now)
        )
      )
      .orderBy(asc(insightReports.nextRunAtMs))
      .limit(10)
      .for("update", { skipLocked: true });
    for (const report of due) {
      try {
        insightConfigSchema.parse(report.config);
        if (report.config.schedule.enabled) {
          const [active] = await tx
            .select({ id: insightRuns.id })
            .from(insightRuns)
            .where(
              and(
                eq(insightRuns.reportId, report.id),
                inArray(insightRuns.status, ["queued", "running"])
              )
            )
            .limit(1);
          if (!active)
            await tx
              .insert(insightRuns)
              .values(insightRunValues(report, now, "scheduled", true))
              .onConflictDoNothing();
        }
        await tx
          .update(insightReports)
          .set({
            nextRunAtMs: nextInsightRun(report.config, now),
            scheduleError: null,
          })
          .where(eq(insightReports.id, report.id));
      } catch {
        await tx
          .update(insightReports)
          .set({
            nextRunAtMs: null,
            scheduleError:
              "The schedule could not be resolved. Review and save its settings.",
          })
          .where(eq(insightReports.id, report.id));
      }
    }
  });
}
export async function processNextInsight(
  db: InsightsDatabase,
  now = Date.now()
) {
  const leaseId = randomUUID();
  const run = await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(insightRuns)
      .where(
        and(
          inArray(insightRuns.status, ["queued", "running"]),
          lte(insightRuns.leaseUntilMs, now)
        )
      )
      .orderBy(asc(insightRuns.createdAtMs))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const [claimed] = await tx
      .update(insightRuns)
      .set({
        status: "running",
        attempts: sql`${insightRuns.attempts} + 1`,
        leaseId,
        leaseUntilMs: now + 60000,
      })
      .where(eq(insightRuns.id, row.id))
      .returning();
    return claimed;
  });
  if (!run) return false;
  const owned = and(
    eq(insightRuns.id, run.id),
    eq(insightRuns.leaseId, leaseId)
  );
  const heartbeat = setInterval(() => {
    void db
      .update(insightRuns)
      .set({ leaseUntilMs: Date.now() + 60000 })
      .where(owned)
      .catch(() => {});
  }, 20000);
  heartbeat.unref();
  try {
    if (run.attempts > 3) throw new Error("interrupted");
    const currentReport = await reportById(
      db,
      run.organizationId,
      run.reportId,
      run.actorUserId
    );
    await requireOrganizationRole(
      run.actorUserId,
      run.organizationId,
      currentReport.widgetOwnerUserId === null ? [...reportEditors] : undefined
    );
    if (run.trigger === "scheduled" && !currentReport.config.schedule.enabled) {
      await db
        .update(insightRuns)
        .set({
          status: "cancelled",
          error: "This queued run was skipped because its schedule was paused.",
          finishedAtMs: Date.now(),
          leaseUntilMs: 0,
          leaseId: null,
          deliveryState: "disabled",
        })
        .where(owned);
      return true;
    }
    insightConfigSchema.parse(run.config);
    const result = await buildInsightResult(
      db,
      run.organizationId,
      run.config,
      run.createdAtMs
    );
    const ready = result.accounts.filter(a => a.status === "ready").length;
    const missing = result.accounts.some(
      a =>
        a.status === "unavailable" ||
        a.metrics.some(m => m.value === null) ||
        a.warnings.some(w =>
          /partial|could not be loaded|truncated|unavailable/i.test(w)
        )
    );
    const status = !ready ? "failed" : missing ? "partial" : "completed";
    await db
      .update(insightRuns)
      .set({
        result,
        status,
        error: ready
          ? null
          : "No selected sources could be loaded. Check connections and retry.",
        finishedAtMs: Date.now(),
        leaseUntilMs: 0,
        leaseId: null,
        deliveryState:
          run.deliveryState === "waiting" &&
          (status !== "failed" || run.config.delivery.notifyFailure)
            ? "pending"
            : "disabled",
      })
      .where(owned);
  } catch (error) {
    if (
      error instanceof TRPCError &&
      error.code === "FORBIDDEN" &&
      run.trigger === "scheduled"
    ) {
      await db
        .update(insightReports)
        .set({
          nextRunAtMs: null,
          scheduleError:
            "Schedule paused because the saved editor no longer has access. An editor must review and save this report.",
        })
        .where(
          and(
            eq(insightReports.id, run.reportId),
            eq(insightReports.actorUserId, run.actorUserId)
          )
        );
    }
    const message =
      error instanceof TRPCError
        ? "This report can no longer run with its saved workspace access. An editor must review and save it."
        : error instanceof Error && error.message.includes("completed days")
          ? error.message
          : "The report could not finish. Review the configuration and connections, then run again.";
    await db
      .update(insightRuns)
      .set({
        status: "failed",
        error: message,
        finishedAtMs: Date.now(),
        leaseUntilMs: 0,
        leaseId: null,
        deliveryState:
          run.deliveryState === "waiting" && run.config.delivery.notifyFailure
            ? "pending"
            : "disabled",
      })
      .where(owned);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
