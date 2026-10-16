import {
  bigint,
  index,
  integer,
  jsonb,
  text,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appSchema, organizations, users } from "./schema";
import type {
  DashboardWidget,
  InsightConfig,
  InsightResult,
} from "../shared/insights";

export const insightReports = appSchema
  .table(
    "insight_reports",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      actorUserId: integer("actorUserId")
        .notNull()
        .references(() => users.id),
      config: jsonb("config").$type<InsightConfig>().notNull(),
      revision: integer("revision").notNull().default(1),
      archived: integer("archived").notNull().default(0),
      nextRunAtMs: bigint("nextRunAtMs", { mode: "number" }),
      scheduleError: text("scheduleError"),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => [
      index("insight_reports_workspace").on(
        t.organizationId,
        t.archived,
        t.updatedAtMs
      ),
      index("insight_reports_due").on(t.archived, t.nextRunAtMs),
    ]
  )
  .enableRLS();

export const insightRuns = appSchema
  .table(
    "insight_runs",
    {
      id: uuid("id").primaryKey(),
      reportId: uuid("reportId")
        .notNull()
        .references(() => insightReports.id),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      actorUserId: integer("actorUserId")
        .notNull()
        .references(() => users.id),
      revision: integer("revision").notNull(),
      config: jsonb("config").$type<InsightConfig>().notNull(),
      status: text("status")
        .$type<
          | "queued"
          | "running"
          | "completed"
          | "partial"
          | "failed"
          | "cancelled"
        >()
        .notNull()
        .default("queued"),
      trigger: text("trigger").$type<"manual" | "scheduled">().notNull(),
      scheduledForMs: bigint("scheduledForMs", { mode: "number" }),
      result: jsonb("result").$type<InsightResult>(),
      error: text("error"),
      attempts: integer("attempts").notNull().default(0),
      leaseId: uuid("leaseId"),
      leaseUntilMs: bigint("leaseUntilMs", { mode: "number" })
        .notNull()
        .default(0),
      deliveryState: text("deliveryState")
        .$type<
          "disabled" | "waiting" | "pending" | "sending" | "sent" | "failed"
        >()
        .notNull()
        .default("disabled"),
      deliveryAttempts: integer("deliveryAttempts").notNull().default(0),
      deliveryNextAtMs: bigint("deliveryNextAtMs", { mode: "number" })
        .notNull()
        .default(0),
      deliveryFirstAtMs: bigint("deliveryFirstAtMs", { mode: "number" }),
      deliveryLeaseId: uuid("deliveryLeaseId"),
      deliveryLeaseUntilMs: bigint("deliveryLeaseUntilMs", { mode: "number" })
        .notNull()
        .default(0),
      deliveryError: text("deliveryError"),
      deliveredAtMs: bigint("deliveredAtMs", { mode: "number" }),
      deliveryPayload: jsonb("deliveryPayload").$type<{
        recipients: Array<{ userId: number; email: string }>;
        from: string;
      }>(),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      finishedAtMs: bigint("finishedAtMs", { mode: "number" }),
    },
    t => [
      index("insight_runs_history").on(
        t.organizationId,
        t.reportId,
        t.createdAtMs
      ),
      index("insight_runs_queue").on(t.status, t.leaseUntilMs),
      index("insight_runs_delivery").on(
        t.deliveryState,
        t.deliveryNextAtMs,
        t.deliveryLeaseUntilMs
      ),
      uniqueIndex("insight_runs_schedule_once").on(
        t.reportId,
        t.scheduledForMs
      ),
    ]
  )
  .enableRLS();

export const insightDashboards = appSchema
  .table(
    "insight_dashboards",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      userId: integer("userId")
        .notNull()
        .references(() => users.id),
      surface: text("surface").$type<"main" | "measure">().notNull(),
      name: text("name").notNull(),
      widgets: jsonb("widgets").$type<DashboardWidget[]>().notNull(),
      revision: integer("revision").notNull().default(1),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => [
      index("insight_dashboards_owner").on(
        t.organizationId,
        t.userId,
        t.surface
      ),
    ]
  )
  .enableRLS();

export type InsightReportRow = typeof insightReports.$inferSelect;
export type InsightRunRow = typeof insightRuns.$inferSelect;
