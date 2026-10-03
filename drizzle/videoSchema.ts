import {
  bigint,
  index,
  integer,
  json,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema, organizations, users, brandAssets } from "./schema";
import type {
  VideoReference,
  VideoSetup,
  VideoStatus,
} from "../shared/videoCreation";

export const videoJobs = appSchema
  .table(
    "video_jobs",
    {
      id: varchar("id", { length: 36 }).primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      actorUserId: integer("actorUserId")
        .notNull()
        .references(() => users.id),
      setup: json("setup").$type<VideoSetup>().notNull(),
      revision: integer("revision").notNull().default(1),
      status: text("status").$type<VideoStatus>().notNull().default("draft"),
      references: json("references")
        .$type<VideoReference[]>()
        .notNull()
        .default([]),
      endpoint: text("endpoint"),
      requestBody: json("requestBody").$type<Record<string, unknown>>(),
      requestPreparedAtMs: bigint("requestPreparedAtMs", { mode: "number" }),
      providerRequestId: text("providerRequestId"),
      providerStatusUrl: text("providerStatusUrl"),
      providerCancelUrl: text("providerCancelUrl"),
      outputUrl: text("outputUrl"),
      outputAssetId: integer("outputAssetId").references(() => brandAssets.id),
      error: text("error"),
      cancelRequested: integer("cancelRequested").notNull().default(0),
      credits: integer("credits").notNull().default(0),
      attempts: integer("attempts").notNull().default(0),
      nextPollAtMs: bigint("nextPollAtMs", { mode: "number" })
        .notNull()
        .default(0),
      leaseOwner: text("leaseOwner"),
      leaseUntilMs: bigint("leaseUntilMs", { mode: "number" })
        .notNull()
        .default(0),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => [
      index("video_jobs_org_time").on(t.organizationId, t.createdAtMs),
      index("video_jobs_pending").on(t.status, t.nextPollAtMs, t.leaseUntilMs),
    ]
  )
  .enableRLS();

export const providerWorkers = appSchema
  .table("provider_workers", {
    id: text("id").primaryKey(),
    ready: integer("ready").notNull().default(0),
    heartbeatAtMs: bigint("heartbeatAtMs", { mode: "number" }).notNull(),
  })
  .enableRLS();
