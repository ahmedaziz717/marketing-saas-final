import { withOrganizationTransaction } from "./activity";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, gte, asc, sql } from "drizzle-orm";
import {
  optimizationRecords,
  optimizationSyncs,
} from "../../drizzle/optimizationSchema";
import {
  historyRangeSchema,
  type SyncTask,
  type SyncCheckpoint,
  type Provenance,
} from "../../shared/optimization";
import { moveDate } from "../../shared/channels";
import { libraryDatabase, type LibraryDatabase } from "./assetLibrary";
import { getConnection, connectionToken } from "./channelConnections";
import {
  ChannelGraphError,
  GRAPH_VERSION,
  graphRequest,
  remoteId,
} from "./channelGraph";
import { stableHash } from "./policy";
import { requireOrganizationRole } from "./access";
import { optimizationEnabled, requireOptimization } from "./optimizationFlags";

const metricFields =
  "ad_id,ad_name,adset_id,campaign_id,date_start,date_stop,spend,impressions,clicks,inline_link_clicks,actions,action_values";
export function historyTasks(range: {
  since: string;
  until: string;
}): SyncTask[] {
  historyRangeSchema.parse(range);
  const tasks: SyncTask[] = [
    {
      kind: "account",
      edge: "",
      fields: "id,name,currency,timezone_name,account_status",
    },
    {
      kind: "campaign",
      edge: "campaigns",
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,updated_time",
    },
    {
      kind: "adset",
      edge: "adsets",
      fields:
        "id,name,campaign_id,status,effective_status,targeting,daily_budget,lifetime_budget,bid_strategy,bid_amount,optimization_goal,attribution_spec,start_time,end_time,updated_time",
    },
    {
      kind: "ad",
      edge: "ads",
      fields:
        "id,name,campaign_id,adset_id,status,effective_status,creative{id},created_time,updated_time",
    },
    {
      kind: "creative",
      edge: "adcreatives",
      fields:
        "id,name,title,body,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec,call_to_action_type",
      optional: true,
    },
  ];
  // Small report slices avoid synchronous requests spanning the entire history.
  for (
    let since = range.since;
    since <= range.until;
    since = moveDate(since, 7)
  ) {
    const until =
      moveDate(since, 6) < range.until ? moveDate(since, 6) : range.until;
    for (const grain of ["daily", "placement", "hourly"] as const)
      tasks.push({
        kind: "insight",
        edge: "insights",
        fields:
          grain === "hourly"
            ? "ad_id,ad_name,adset_id,campaign_id,date_start,date_stop,spend,impressions,clicks,inline_link_clicks"
            : metricFields,
        range: { since, until },
        grain,
        optional: grain !== "daily",
      });
  }
  return tasks;
}
export function usageDelay(headers: Headers) {
  let delay = 1000;
  for (const key of [
    "x-app-usage",
    "x-ad-account-usage",
    "x-business-use-case-usage",
  ]) {
    try {
      const walk = (v: any): void => {
        if (!v || typeof v !== "object") return;
        for (const [k, n] of Object.entries(v)) {
          if (
            [
              "call_count",
              "total_cputime",
              "total_time",
              "acc_id_util_pct",
            ].includes(k) &&
            typeof n === "number" &&
            n >= 80
          )
            delay = Math.max(delay, 60000);
          if (k === "estimated_time_to_regain_access" && typeof n === "number")
            delay = Math.max(delay, n * 60000);
          if (typeof n === "object") walk(n);
        }
      };
      walk(JSON.parse(headers.get(key) ?? "null"));
    } catch {
      /* Headers are advisory. Server errors still trigger bounded backoff. */
    }
  }
  return Math.min(delay, 86400000);
}
export function retryDelay(error: unknown, attempts: number) {
  if (attempts >= 8) return null;
  if (
    error instanceof ChannelGraphError &&
    (error.retryAfterMs ||
      !error.definitive ||
      [1, 2, 4, 17, 32, 613, 80000, 80004].includes(error.code ?? 0))
  )
    return Math.min(
      86400000,
      Math.max(error.retryAfterMs ?? 0, Math.pow(2, attempts) * 5000)
    );
  return null;
}
export async function queueHistory(
  db: LibraryDatabase,
  organizationId: number,
  actorUserId: number,
  connectionId: string,
  incremental = false
) {
  requireOptimization(organizationId);
  await requireOrganizationRole(actorUserId, organizationId, [
    "owner",
    "admin",
    "creator",
    "publisher",
  ]);
  const c = await getConnection(db, organizationId, connectionId, "meta_ads");
  if (c.status !== "connected")
    throw new Error("Reconnect this Meta ad account before syncing.");
  return withOrganizationTransaction(db, organizationId, async tx => {
    const [existing] = await tx
      .select()
      .from(optimizationSyncs)
      .where(
        and(
          eq(optimizationSyncs.organizationId, organizationId),
          eq(optimizationSyncs.connectionId, connectionId)
        )
      )
      .for("update");
    if (existing && ["queued", "running"].includes(existing.status))
      return existing;
    const until = new Date().toISOString().slice(0, 10);
    // Re-fetch attribution lag, including empty slices; never append overlapping totals.
    const since =
      incremental && existing?.status === "completed"
        ? ["2026-01-01", moveDate(existing.until, -28)].sort().at(-1)!
        : "2026-01-01";
    const values = {
      organizationId,
      connectionId,
      actorUserId,
      status: "queued" as const,
      since,
      until,
      tasks: historyTasks({ since, until }),
      checkpoint: {
        task: 0,
        cursors: [],
        pages: 0,
        rows: 0,
        warnings: incremental ? (existing?.checkpoint.warnings ?? []) : [],
        coverage: existing?.checkpoint.coverage,
        completedTasks: 0,
        startedAtMs: Date.now(),
      } as SyncCheckpoint,
      attempts: 0,
      nextAtMs: 0,
      leaseOwner: null,
      leaseUntilMs: 0,
      error: null,
      updatedAtMs: Date.now(),
    };
    if (existing) {
      const [r] = await tx
        .update(optimizationSyncs)
        .set(values)
        .where(eq(optimizationSyncs.id, existing.id))
        .returning();
      return r;
    }
    const [r] = await tx
      .insert(optimizationSyncs)
      .values({ id: randomUUID(), ...values })
      .returning();
    return r;
  });
}
export async function processHistoryPage(
  db: LibraryDatabase,
  selectedId?: string
) {
  if (process.env.OPTIMIZATION_WORKER_ENABLED !== "true") return false;
  const now = Date.now(),
    leaseOwner = randomUUID();
  const allowed = (process.env.OPTIMIZATION_TENANT_IDS ?? "")
    .split(",")
    .map(Number)
    .filter(n => Number.isSafeInteger(n) && n > 0 && optimizationEnabled(n));
  if (!allowed.length) return false;
  const job = await db.transaction(async tx => {
    const [j] = await tx
      .select()
      .from(optimizationSyncs)
      .where(
        and(
          inArray(optimizationSyncs.organizationId, allowed),
          inArray(optimizationSyncs.status, ["queued", "running"]),
          lte(optimizationSyncs.nextAtMs, now),
          lte(optimizationSyncs.leaseUntilMs, now),
          selectedId ? eq(optimizationSyncs.id, selectedId) : undefined
        )
      )
      .orderBy(asc(optimizationSyncs.nextAtMs))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!j) return null;
    const [r] = await tx
      .update(optimizationSyncs)
      .set({
        status: "running",
        leaseOwner,
        leaseUntilMs: now + 120000,
        updatedAtMs: now,
      })
      .where(eq(optimizationSyncs.id, j.id))
      .returning();
    return r;
  });
  if (!job) {
    const [due] = await db
      .select()
      .from(optimizationSyncs)
      .where(
        and(
          inArray(optimizationSyncs.organizationId, allowed),
          eq(optimizationSyncs.status, "completed"),
          lte(optimizationSyncs.updatedAtMs, now - 86400000)
        )
      )
      .orderBy(optimizationSyncs.updatedAtMs)
      .limit(1);
    if (due)
      await queueHistory(
        db,
        due.organizationId,
        due.actorUserId,
        due.connectionId,
        true
      );
    return false;
  }
  const fence = and(
    eq(optimizationSyncs.id, job.id),
    eq(optimizationSyncs.leaseOwner, leaseOwner)
  );
  const task = job.tasks[job.checkpoint.task];
  try {
    await requireOrganizationRole(job.actorUserId, job.organizationId, [
      "owner",
      "admin",
      "creator",
      "publisher",
    ]);
    const c = await getConnection(
      db,
      job.organizationId,
      job.connectionId,
      "meta_ads"
    );
    if (c.status !== "connected")
      throw new Error("Meta connection is no longer active.");
    if (!task) {
      await db
        .update(optimizationSyncs)
        .set({
          status: "completed",
          updatedAtMs: now,
          checkpoint: {
            ...job.checkpoint,
            coverage: {
              since: [
                job.checkpoint.coverage?.since ?? job.since,
                job.since,
              ].sort()[0],
              until: job.until,
            },
          },
          leaseUntilMs: 0,
          leaseOwner: null,
        })
        .where(fence);
      return true;
    }
    const path =
      `act_${remoteId(c.accountId)}` + (task.edge ? `/${task.edge}` : "");
    const params: Record<string, string> = {
      fields: task.fields,
      ...(task.edge ? { limit: "100" } : {}),
    };
    if (job.checkpoint.after) params.after = job.checkpoint.after;
    if (task.range)
      Object.assign(params, {
        time_range: JSON.stringify(task.range),
        level: "ad",
        time_increment: "1",
        use_account_attribution_setting: "true",
        action_report_time: "conversion",
      });
    if (task.grain === "placement")
      params.breakdowns = "publisher_platform,platform_position";
    if (task.grain === "hourly")
      params.breakdowns = "hourly_stats_aggregated_by_advertiser_time_zone";
    let delay = 1000;
    const response = await graphRequest<Record<string, any>>(
      path,
      connectionToken(c),
      params,
      undefined,
      false,
      h => {
        delay = usageDelay(h);
      }
    );
    const rows = task.kind === "account" ? [response] : response.data;
    if (!Array.isArray(rows))
      throw new ChannelGraphError(
        "Meta returned an invalid history page.",
        true
      );
    const after = response.paging?.next
      ? response.paging?.cursors?.after
      : undefined;
    if (
      response.paging?.next &&
      (!after ||
        typeof after !== "string" ||
        job.checkpoint.cursors.includes(after))
    )
      throw new ChannelGraphError(
        "Meta pagination did not advance. Resume after checking the provider.",
        true
      );
    const fetchedAtMs = Date.now();
    await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(optimizationSyncs)
        .where(fence)
        .for("update");
      if (!current) return; // A replaced lease cannot commit rows or advance a cursor.
      // Clear a slice only at its first page, in the same transaction as its checkpoint.
      if (task.kind === "insight" && !job.checkpoint.after)
        await tx
          .delete(optimizationRecords)
          .where(
            and(
              eq(optimizationRecords.organizationId, job.organizationId),
              eq(optimizationRecords.connectionId, job.connectionId),
              eq(optimizationRecords.kind, "insight"),
              eq(optimizationRecords.grain, task.grain!),
              gte(optimizationRecords.date, task.range!.since),
              lte(optimizationRecords.date, task.range!.until)
            )
          );
      const records = new Map<
        string,
        typeof optimizationRecords.$inferInsert
      >();
      for (const data of rows) {
        const id = String(task.kind === "insight" ? data.ad_id : data.id);
        if (!/^\d+$/.test(id.replace(/^act_/, "")))
          throw new ChannelGraphError(
            "Meta history contained an invalid object ID.",
            true
          );
        const date = task.kind === "insight" ? String(data.date_start) : "";
        if (
          task.kind === "insight" &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            date < task.range!.since ||
            date > task.range!.until)
        )
          throw new Error(
            "Meta history returned a date outside the requested slice."
          );
        const fields = task.fields.split(",").map(f => f.replace(/\{.*$/, ""));
        const provenance: Provenance = {
          apiVersion: GRAPH_VERSION,
          path,
          fetchedAtMs,
          requestedFields: fields,
          missingFields: fields.filter(f => data[f] === undefined),
          fields: Object.fromEntries(
            fields.map(f => [
              f,
              {
                source: `meta:${path}:${f}`,
                observedAtMs: fetchedAtMs,
                status: data[f] === undefined ? "unavailable" : "returned",
              },
            ])
          ),
          attribution: "account setting; action_report_time=conversion",
          timezone: c.details.timezone ?? null,
          currency: c.details.currency ?? null,
          granularity: task.grain ?? "current_snapshot",
          snapshotOnly: task.kind !== "insight",
        };
        const key = stableHash({
          organizationId: job.organizationId,
          connectionId: job.connectionId,
          kind: task.kind,
          id,
          date,
          grain: task.grain ?? "snapshot",
          platform: data.publisher_platform,
          placement: data.platform_position,
          hour: data.hourly_stats_aggregated_by_advertiser_time_zone,
        });
        records.set(key, {
          id: key,
          organizationId: job.organizationId,
          connectionId: job.connectionId,
          kind: task.kind,
          remoteId: id,
          date,
          grain: task.grain ?? "snapshot",
          data,
          provenance,
          updatedAtMs: fetchedAtMs,
        });
      }
      if (records.size)
        await tx
          .insert(optimizationRecords)
          .values(Array.from(records.values()))
          .onConflictDoUpdate({
            target: optimizationRecords.id,
            set: {
              data: sql`excluded.data`,
              provenance: sql`excluded.provenance`,
              updatedAtMs: fetchedAtMs,
            },
          });
      const checkpoint: SyncCheckpoint = {
        ...job.checkpoint,
        task: job.checkpoint.task + (after ? 0 : 1),
        after,
        cursors: after ? [...job.checkpoint.cursors, after] : [],
        pages: job.checkpoint.pages + 1,
        rows: job.checkpoint.rows + rows.length,
        completedTasks: job.checkpoint.completedTasks + (after ? 0 : 1),
        coverage:
          !after && job.checkpoint.task + 1 >= job.tasks.length
            ? {
                since: [
                  job.checkpoint.coverage?.since ?? job.since,
                  job.since,
                ].sort()[0],
                until: job.until,
              }
            : job.checkpoint.coverage,
      };
      await tx
        .update(optimizationSyncs)
        .set({
          checkpoint,
          status: checkpoint.task >= job.tasks.length ? "completed" : "queued",
          attempts: 0,
          error: null,
          nextAtMs: fetchedAtMs + delay,
          leaseUntilMs: 0,
          leaseOwner: null,
          updatedAtMs: fetchedAtMs,
        })
        .where(fence);
    });
  } catch (error) {
    const delay = retryDelay(error, job.attempts);
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "History synchronization failed.";
    // Unsupported optional breakdowns are declared unavailable, not converted to zeros.
    const skip =
      delay === null &&
      task?.optional &&
      error instanceof ChannelGraphError &&
      [10, 100, 200].includes(error.code ?? 0);
    const checkpoint = skip
      ? {
          ...job.checkpoint,
          task: job.checkpoint.task + 1,
          after: undefined,
          cursors: [],
          completedTasks: job.checkpoint.completedTasks + 1,
          warnings: [
            ...job.checkpoint.warnings,
            `${task.grain ?? task.kind} ${task.range?.since ?? ""}: ${message}`,
          ].slice(-100),
        }
      : job.checkpoint;
    await db
      .update(optimizationSyncs)
      .set({
        checkpoint,
        status: skip || delay !== null ? "queued" : "failed",
        attempts: skip ? 0 : job.attempts + 1,
        nextAtMs: Date.now() + (delay ?? 1000),
        error: skip ? null : message,
        leaseOwner: null,
        leaseUntilMs: 0,
        updatedAtMs: Date.now(),
      })
      .where(fence);
  }
  return true;
}
