import {
  bigint,
  index,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema, organizations, users } from "./schema";
import { channelConnections } from "./channelSchema";
import type {
  Classification,
  Provenance,
  SyncCheckpoint,
  SyncTask,
} from "../shared/optimization";
export const optimizationSyncs = appSchema
  .table(
    "optimization_syncs",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      connectionId: uuid("connectionId")
        .notNull()
        .references(() => channelConnections.id),
      actorUserId: integer("actorUserId")
        .notNull()
        .references(() => users.id),
      status: varchar("status", { length: 30 })
        .$type<"queued" | "running" | "completed" | "failed" | "paused">()
        .notNull(),
      tasks: jsonb("tasks").$type<SyncTask[]>().notNull(),
      checkpoint: jsonb("checkpoint").$type<SyncCheckpoint>().notNull(),
      since: varchar("since", { length: 10 }).notNull(),
      until: varchar("until", { length: 10 }).notNull(),
      attempts: integer("attempts").notNull().default(0),
      nextAtMs: bigint("nextAtMs", { mode: "number" }).notNull().default(0),
      leaseOwner: uuid("leaseOwner"),
      leaseUntilMs: bigint("leaseUntilMs", { mode: "number" })
        .notNull()
        .default(0),
      error: text("error"),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => ({
      connection: uniqueIndex("optimization_sync_connection").on(
        t.organizationId,
        t.connectionId
      ),
      queue: index("optimization_sync_queue").on(t.status, t.nextAtMs),
    })
  )
  .enableRLS();
export const optimizationRecords = appSchema
  .table(
    "optimization_records",
    {
      id: varchar("id", { length: 64 }).primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      connectionId: uuid("connectionId")
        .notNull()
        .references(() => channelConnections.id),
      kind: varchar("kind", { length: 20 }).notNull(),
      remoteId: varchar("remoteId", { length: 100 }).notNull(),
      date: varchar("date", { length: 10 }).notNull().default(""),
      grain: varchar("grain", { length: 20 }).notNull().default("snapshot"),
      data: jsonb("data").$type<Record<string, any>>().notNull(),
      provenance: jsonb("provenance").$type<Provenance>().notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => ({
      lookup: index("optimization_record_lookup").on(
        t.organizationId,
        t.connectionId,
        t.kind,
        t.grain,
        t.date
      ),
    })
  )
  .enableRLS();
export const optimizationClassifications = appSchema
  .table(
    "optimization_classifications",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      connectionId: uuid("connectionId")
        .notNull()
        .references(() => channelConnections.id),
      adId: varchar("adId", { length: 100 }).notNull(),
      dimension: varchar("dimension", { length: 40 }).notNull(),
      assertion: jsonb("assertion").$type<Classification>().notNull(),
      revision: integer("revision").notNull(),
      source: varchar("source", { length: 20 }).notNull(),
      fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    },
    t => ({
      revisions: uniqueIndex("optimization_classification_revision").on(
        t.organizationId,
        t.connectionId,
        t.adId,
        t.dimension,
        t.source,
        t.revision
      ),
      lookup: index("optimization_classification_lookup").on(
        t.organizationId,
        t.connectionId,
        t.adId
      ),
    })
  )
  .enableRLS();
