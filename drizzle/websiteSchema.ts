import {
  bigint,
  integer,
  jsonb,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema, users } from "./schema";
import type { WebsiteProfile } from "../shared/publicWebsite";
export const websiteProfile = appSchema
  .table("website_profile", {
    id: varchar("id", { length: 20 }).primaryKey(),
    profile: jsonb("profile").$type<WebsiteProfile>().notNull(),
    revision: integer("revision").notNull().default(1),
    updatedBy: integer("updatedBy")
      .notNull()
      .references(() => users.id),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  })
  .enableRLS();
export const websiteRequests = appSchema
  .table("website_requests", {
    id: uuid("id").primaryKey(),
    receiptHash: varchar("receiptHash", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    topic: varchar("topic", { length: 20 }).notNull(),
    workspace: varchar("workspace", { length: 200 }).notNull(),
    message: text("message").notNull(),
    emailState: varchar("emailState", { length: 24 })
      .notNull()
      .default("pending"),
    emailAttempts: integer("emailAttempts").notNull().default(0),
    emailNextAttemptAtMs: bigint("emailNextAttemptAtMs", { mode: "number" })
      .notNull()
      .default(0),
    emailLeaseUntilMs: bigint("emailLeaseUntilMs", { mode: "number" })
      .notNull()
      .default(0),
    emailFirstAttemptAtMs: bigint("emailFirstAttemptAtMs", { mode: "number" }),
    emailSentAtMs: bigint("emailSentAtMs", { mode: "number" }),
    emailProviderId: varchar("emailProviderId", { length: 128 }),
    emailLastError: varchar("emailLastError", { length: 80 }),
    state: varchar("state", { length: 30 }).notNull().default("received"),
    resolutionNote: text("resolutionNote"),
    updatedBy: integer("updatedBy").references(() => users.id),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  })
  .enableRLS();

// Private deduplication ledger. Original bodies and attachments remain in Resend.
export const inboundPrivacyEmails = appSchema
  .table("inbound_privacy_emails", {
    id: uuid("id").primaryKey(),
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    intro: text("intro").notNull(),
    state: varchar("state", { length: 20 }).notNull().default("pending"),
    leaseUntilMs: bigint("leaseUntilMs", { mode: "number" })
      .notNull()
      .default(0),
    firstAttemptAtMs: bigint("firstAttemptAtMs", { mode: "number" }),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    sentAtMs: bigint("sentAtMs", { mode: "number" }),
    providerId: varchar("providerId", { length: 128 }),
  })
  .enableRLS();
