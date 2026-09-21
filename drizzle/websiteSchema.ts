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
    state: varchar("state", { length: 30 }).notNull().default("received"),
    resolutionNote: text("resolutionNote"),
    updatedBy: integer("updatedBy").references(() => users.id),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  })
  .enableRLS();
