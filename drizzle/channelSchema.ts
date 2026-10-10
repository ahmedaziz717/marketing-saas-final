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
import type {
  Channel,
  ConnectionDetails,
  Secret,
  ContentPlan,
  PublicationContent,
  PublicationState,
} from "../shared/channels";

export const channelConnections = appSchema
  .table(
    "channel_connections",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      channel: varchar("channel", { length: 40 }).$type<Channel>().notNull(),
      accountId: varchar("accountId", { length: 100 }).notNull(),
      name: varchar("name", { length: 250 }).notNull(),
      status: varchar("status", { length: 24 })
        .$type<"connected" | "disconnected" | "error">()
        .notNull(),
      credentials: jsonb("credentials").$type<Secret>(),
      details: jsonb("details").$type<ConnectionDetails>().notNull(),
      version: integer("version").default(1).notNull(),
      connectedByUserId: integer("connectedByUserId")
        .notNull()
        .references(() => users.id),
      verifiedAtMs: bigint("verifiedAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    table => ({
      account: uniqueIndex("channel_connection_account").on(
        table.organizationId,
        table.channel,
        table.accountId
      ),
    })
  )
  .enableRLS();
export const channelOAuthSessions = appSchema
  .table(
    "channel_oauth_sessions",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      userId: integer("userId")
        .notNull()
        .references(() => users.id),
      purpose: varchar("purpose", { length: 40 }).$type<Channel>().notNull(),
      stateHash: varchar("stateHash", { length: 64 }),
      credentials: jsonb("credentials").$type<Secret>(),
      expiresAtMs: bigint("expiresAtMs", { mode: "number" }).notNull(),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    },
    t => ({
      state: uniqueIndex("channel_oauth_state").on(t.stateHash),
      expiry: index("channel_oauth_expiry").on(t.expiresAtMs),
    })
  )
  .enableRLS();
export const publications = appSchema
  .table(
    "publications",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      channel: varchar("channel", { length: 40 }).$type<Channel>().notNull(),
      connectionId: uuid("connectionId").references(
        () => channelConnections.id
      ),
      assetKey: varchar("assetKey", { length: 100 }),
      content: jsonb("content").$type<PublicationContent>().notNull(),
      state: varchar("state", { length: 30 })
        .$type<PublicationState>()
        .notNull()
        .default("draft"),
      revision: integer("revision").default(1).notNull(),
      approvalHash: varchar("approvalHash", { length: 64 }),
      approvedByUserId: integer("approvedByUserId").references(() => users.id),
      approvedAtMs: bigint("approvedAtMs", { mode: "number" }),
      scheduledAtMs: bigint("scheduledAtMs", { mode: "number" }),
      timezone: varchar("timezone", { length: 100 }).notNull(),
      externalId: varchar("externalId", { length: 200 }),
      result: jsonb("result").$type<Record<string, unknown>>(),
      error: text("error"),
      leaseUntilMs: bigint("leaseUntilMs", { mode: "number" }),
      claimId: uuid("claimId"),
      createdByUserId: integer("createdByUserId")
        .notNull()
        .references(() => users.id),
      createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => ({
      workspace: index("publication_workspace").on(
        t.organizationId,
        t.createdAtMs
      ),
      due: index("publication_due").on(t.state, t.scheduledAtMs),
      lease: index("publication_lease").on(t.state, t.leaseUntilMs),
    })
  )
  .enableRLS();
export const channelPlans = appSchema
  .table(
    "channel_plans",
    {
      id: uuid("id").primaryKey(),
      organizationId: integer("organizationId")
        .notNull()
        .references(() => organizations.id),
      channel: varchar("channel", { length: 40 }).$type<Channel>().notNull(),
      postsPerWeek: integer("postsPerWeek").notNull().default(2),
      timezone: varchar("timezone", { length: 100 }).notNull(),
      slots: jsonb("slots").$type<ContentPlan["slots"]>().notNull(),
      updatedByUserId: integer("updatedByUserId")
        .notNull()
        .references(() => users.id),
      updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
    },
    t => ({
      workspace: uniqueIndex("channel_plan_workspace").on(
        t.organizationId,
        t.channel
      ),
    })
  )
  .enableRLS();
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type Publication = typeof publications.$inferSelect;
