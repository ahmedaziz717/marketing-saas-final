import {
  bigint,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
}, table => ({ slugIdx: uniqueIndex("organizations_slug_unique").on(table.slug) }));

export const organizationMemberships = mysqlTable("organization_memberships", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", ["owner", "admin", "creator", "reviewer", "publisher"]).notNull(),
  status: mysqlEnum("status", ["invited", "active", "suspended"]).default("active").notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
}, table => ({ memberIdx: uniqueIndex("organization_member_unique").on(table.organizationId, table.userId) }));

export const organizationInvites = mysqlTable("organization_invites", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["admin", "creator", "reviewer", "publisher"]).notNull(),
  token: varchar("token", { length: 96 }).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "revoked"]).default("pending").notNull(),
  invitedByUserId: int("invitedByUserId").notNull().references(() => users.id),
  expiresAtMs: bigint("expiresAtMs", { mode: "number" }).notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
}, table => ({ tokenIdx: uniqueIndex("organization_invite_token_unique").on(table.token) }));

export const brandKits = mysqlTable("brand_kits", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  name: varchar("name", { length: 160 }).notNull(),
  voice: text("voice"),
  colors: json("colors").$type<string[]>().notNull(),
  fonts: json("fonts").$type<string[]>().notNull(),
  requiredClaims: text("requiredClaims"),
  prohibitedContent: text("prohibitedContent"),
  status: mysqlEnum("status", ["draft", "active"]).default("draft").notNull(),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
}, table => ({ orgIdx: uniqueIndex("brand_kit_organization_unique").on(table.organizationId) }));

export const brandAssets = mysqlTable("brand_assets", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  brandKitId: int("brandKitId").notNull().references(() => brandKits.id),
  name: varchar("name", { length: 180 }).notNull(),
  type: mysqlEnum("type", ["logo", "font", "product", "reference", "other"]).notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: text("url").notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id),
  reviewedAtMs: bigint("reviewedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const campaignBriefs = mysqlTable("campaign_briefs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  name: varchar("name", { length: 200 }).notNull(),
  audience: text("audience").notNull(),
  offer: text("offer").notNull(),
  channel: mysqlEnum("channel", ["meta"]).default("meta").notNull(),
  placements: json("placements").$type<string[]>().notNull(),
  formats: json("formats").$type<string[]>().notNull(),
  creativeDirection: text("creativeDirection").notNull(),
  destinationUrl: text("destinationUrl"),
  requiredClaims: text("requiredClaims"),
  assetIds: json("assetIds").$type<number[]>().notNull(),
  status: mysqlEnum("status", ["draft", "in_review", "approved", "rejected"]).default("draft").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  approvedByUserId: int("approvedByUserId").references(() => users.id),
  approvedAtMs: bigint("approvedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
});

export const creativeJobs = mysqlTable("creative_jobs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  briefId: int("briefId").notNull().references(() => campaignBriefs.id),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed"]).default("queued").notNull(),
  inputHash: varchar("inputHash", { length: 64 }).notNull(),
  briefSnapshot: json("briefSnapshot").$type<Record<string, unknown>>().notNull(),
  assetSnapshot: json("assetSnapshot").$type<Record<string, unknown>[]>().notNull(),
  requestedByUserId: int("requestedByUserId").notNull().references(() => users.id),
  errorMessage: text("errorMessage"),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  completedAtMs: bigint("completedAtMs", { mode: "number" }),
});

export const creativeVariants = mysqlTable("creative_variants", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  jobId: int("jobId").notNull().references(() => creativeJobs.id),
  briefId: int("briefId").notNull().references(() => campaignBriefs.id),
  name: varchar("name", { length: 180 }).notNull(),
  concept: text("concept").notNull(),
  primaryText: text("primaryText").notNull(),
  headline: varchar("headline", { length: 255 }).notNull(),
  description: text("description"),
  callToAction: varchar("callToAction", { length: 64 }).notNull(),
  format: varchar("format", { length: 64 }).notNull(),
  imageUrl: text("imageUrl").notNull(),
  imageStorageKey: varchar("imageStorageKey", { length: 500 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id),
  reviewedAtMs: bigint("reviewedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const reviewComments = mysqlTable("review_comments", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  briefId: int("briefId").references(() => campaignBriefs.id),
  variantId: int("variantId").references(() => creativeVariants.id),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
  authorUserId: int("authorUserId").notNull().references(() => users.id),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const metaConnections = mysqlTable("meta_connections", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  adAccountId: varchar("adAccountId", { length: 100 }).notNull(),
  pageId: varchar("pageId", { length: 100 }),
  instagramActorId: varchar("instagramActorId", { length: 100 }),
  accessTokenCiphertext: text("accessTokenCiphertext"),
  tokenIv: varchar("tokenIv", { length: 64 }),
  tokenTag: varchar("tokenTag", { length: 64 }),
  status: mysqlEnum("status", ["disconnected", "connected", "error"]).default("disconnected").notNull(),
  connectedByUserId: int("connectedByUserId").notNull().references(() => users.id),
  connectedAtMs: bigint("connectedAtMs", { mode: "number" }),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
}, table => ({ orgIdx: uniqueIndex("meta_connection_organization_unique").on(table.organizationId) }));

export const publishRequests = mysqlTable("publish_requests", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  variantId: int("variantId").notNull().references(() => creativeVariants.id),
  connectionId: int("connectionId").notNull().references(() => metaConnections.id),
  action: mysqlEnum("action", ["create", "update"]).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  approvedHash: varchar("approvedHash", { length: 64 }),
  status: mysqlEnum("status", ["draft", "awaiting_approval", "approved", "publishing", "published", "failed", "cancelled"]).default("draft").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  approvedByUserId: int("approvedByUserId").references(() => users.id),
  publishedByUserId: int("publishedByUserId").references(() => users.id),
  metaObjectId: varchar("metaObjectId", { length: 150 }),
  result: json("result").$type<Record<string, unknown>>(),
  approvedAtMs: bigint("approvedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
});

export const activityEvents = mysqlTable("activity_events", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id),
  actorUserId: int("actorUserId").notNull().references(() => users.id),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 120 }).notNull(),
  outcome: mysqlEnum("outcome", ["success", "failure"]).default("success").notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  correlationId: varchar("correlationId", { length: 96 }).notNull(),
  previousHash: varchar("previousHash", { length: 64 }),
  eventHash: varchar("eventHash", { length: 64 }).notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
}, table => ({ eventHashIdx: uniqueIndex("activity_event_hash_unique").on(table.eventHash) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type OrganizationRole = typeof organizationMemberships.$inferSelect.role;
