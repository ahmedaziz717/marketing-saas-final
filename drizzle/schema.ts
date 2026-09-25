import {
  bigint,
  integer,
  json,
  pgSchema,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app_private");

export const usersRoleEnum = appSchema.enum("users_role", ["user", "admin"]);
export const organizationMembershipsRoleEnum = appSchema.enum(
  "organization_memberships_role",
  ["owner", "admin", "creator", "reviewer", "publisher"]
);
export const organizationMembershipsStatusEnum = appSchema.enum(
  "organization_memberships_status",
  ["invited", "active", "suspended"]
);
export const organizationInvitesRoleEnum = appSchema.enum(
  "organization_invites_role",
  ["admin", "creator", "reviewer", "publisher"]
);
export const organizationInvitesStatusEnum = appSchema.enum(
  "organization_invites_status",
  ["pending", "accepted", "revoked"]
);
export const brandKitsStatusEnum = appSchema.enum("brand_kits_status", [
  "draft",
  "active",
]);
export const brandAssetsTypeEnum = appSchema.enum("brand_assets_type", [
  "logo",
  "font",
  "product",
  "reference",
  "other",
]);
export const brandAssetsStatusEnum = appSchema.enum("brand_assets_status", [
  "pending",
  "approved",
  "rejected",
]);
export const websiteCrawlJobsScanModeEnum = appSchema.enum(
  "website_crawl_jobs_scanMode",
  ["brand_and_products", "products_only"]
);
export const websiteCrawlJobsStatusEnum = appSchema.enum(
  "website_crawl_jobs_status",
  [
    "queued",
    "discovering",
    "crawling",
    "analyzing",
    "review_ready",
    "completed",
    "failed",
    "cancelled",
  ]
);
export const websiteCrawlPagesPageTypeEnum = appSchema.enum(
  "website_crawl_pages_pageType",
  ["home", "product", "collection", "about", "contact", "other"]
);
export const websiteCrawlPagesStatusEnum = appSchema.enum(
  "website_crawl_pages_status",
  ["fetched", "analyzed", "failed"]
);
export const productsRecordTypeEnum = appSchema.enum("products_recordType", [
  "family",
  "standalone",
  "accessory",
  "material",
  "software",
  "service",
  "bundle",
]);
export const productsStatusEnum = appSchema.enum("products_status", [
  "pending",
  "approved",
  "rejected",
]);
export const campaignBriefsChannelEnum = appSchema.enum(
  "campaign_briefs_channel",
  ["meta", "google_display", "microsoft", "multi_channel"]
);
export const campaignBriefsStatusEnum = appSchema.enum(
  "campaign_briefs_status",
  ["draft", "in_review", "approved", "rejected"]
);
export const creativeJobsStatusEnum = appSchema.enum("creative_jobs_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const creativeVariantsChannelEnum = appSchema.enum(
  "creative_variants_channel",
  ["meta", "google_display", "microsoft"]
);
export const creativeVariantsStatusEnum = appSchema.enum(
  "creative_variants_status",
  ["pending", "approved", "rejected"]
);
export const reviewCommentsStatusEnum = appSchema.enum(
  "review_comments_status",
  ["open", "resolved"]
);
export const metaConnectionsStatusEnum = appSchema.enum(
  "meta_connections_status",
  ["disconnected", "connected", "error"]
);
export const publishRequestsActionEnum = appSchema.enum(
  "publish_requests_action",
  ["create", "update"]
);
export const publishRequestsStatusEnum = appSchema.enum(
  "publish_requests_status",
  [
    "draft",
    "awaiting_approval",
    "approved",
    "publishing",
    "published",
    "failed",
    "cancelled",
  ]
);
export const activityEventsOutcomeEnum = appSchema.enum(
  "activity_events_outcome",
  ["success", "failure"]
);

export const users = appSchema.table("users", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  authUserId: uuid("authUserId").unique(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: usersRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizations = appSchema.table(
  "organizations",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    createdByUserId: integer("createdByUserId")
      .notNull()
      .references(() => users.id),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    slugIdx: uniqueIndex("organizations_slug_unique").on(table.slug),
  })
);

export const organizationMemberships = appSchema.table(
  "organization_memberships",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    role: organizationMembershipsRoleEnum("role").notNull(),
    status: organizationMembershipsStatusEnum("status")
      .default("active")
      .notNull(),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    memberIdx: uniqueIndex("organization_member_unique").on(
      table.organizationId,
      table.userId
    ),
  })
);

export const organizationInvites = appSchema.table(
  "organization_invites",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    email: varchar("email", { length: 320 }).notNull(),
    role: organizationInvitesRoleEnum("role").notNull(),
    token: varchar("token", { length: 96 }).notNull(),
    status: organizationInvitesStatusEnum("status")
      .default("pending")
      .notNull(),
    invitedByUserId: integer("invitedByUserId")
      .notNull()
      .references(() => users.id),
    expiresAtMs: bigint("expiresAtMs", { mode: "number" }).notNull(),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    tokenIdx: uniqueIndex("organization_invite_token_unique").on(table.token),
  })
);

export const brandKits = appSchema.table(
  "brand_kits",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 160 }).notNull(),
    voice: text("voice"),
    colors: json("colors").$type<string[]>().notNull(),
    fonts: json("fonts").$type<string[]>().notNull(),
    requiredClaims: text("requiredClaims"),
    prohibitedContent: text("prohibitedContent"),
    status: brandKitsStatusEnum("status").default("draft").notNull(),
    updatedByUserId: integer("updatedByUserId")
      .notNull()
      .references(() => users.id),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    orgIdx: uniqueIndex("brand_kit_organization_unique").on(
      table.organizationId
    ),
  })
);

export const brandAssets = appSchema.table("brand_assets", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  brandKitId: integer("brandKitId")
    .notNull()
    .references(() => brandKits.id),
  name: varchar("name", { length: 180 }).notNull(),
  type: brandAssetsTypeEnum("type").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: text("url").notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  status: brandAssetsStatusEnum("status").default("pending").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  uploadedByUserId: integer("uploadedByUserId")
    .notNull()
    .references(() => users.id),
  reviewedByUserId: integer("reviewedByUserId").references(() => users.id),
  reviewedAtMs: bigint("reviewedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const websiteCrawlJobs = appSchema.table("website_crawl_jobs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  sourceUrl: text("sourceUrl").notNull(),
  sourceOrigin: varchar("sourceOrigin", { length: 500 }).notNull(),
  scanMode: websiteCrawlJobsScanModeEnum("scanMode")
    .default("brand_and_products")
    .notNull(),
  status: websiteCrawlJobsStatusEnum("status").default("queued").notNull(),
  discoveredUrls: json("discoveredUrls").$type<string[]>().notNull(),
  cursor: integer("cursor").default(0).notNull(),
  pagesDiscovered: integer("pagesDiscovered").default(0).notNull(),
  pagesProcessed: integer("pagesProcessed").default(0).notNull(),
  maxPages: integer("maxPages").default(100).notNull(),
  background: integer("background").default(0).notNull(),
  leaseUntil: bigint("leaseUntil", { mode: "number" }),
  discovery: json("discovery").$type<{
    pending: string[];
    visited: string[];
    failures: string[];
  }>(),
  brandDraft: json("brandDraft").$type<Record<string, unknown>>(),
  errorMessage: text("errorMessage"),
  createdByUserId: integer("createdByUserId")
    .notNull()
    .references(() => users.id),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  completedAtMs: bigint("completedAtMs", { mode: "number" }),
});

export const websiteCrawlPages = appSchema.table(
  "website_crawl_pages",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    jobId: integer("jobId")
      .notNull()
      .references(() => websiteCrawlJobs.id),
    url: text("url").notNull(),
    urlHash: varchar("urlHash", { length: 64 }).notNull(),
    canonicalUrl: text("canonicalUrl"),
    title: varchar("title", { length: 500 }),
    pageType: websiteCrawlPagesPageTypeEnum("pageType")
      .default("other")
      .notNull(),
    textContent: text("textContent"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    colors: json("colors").$type<string[]>().notNull(),
    fonts: json("fonts").$type<string[]>().notNull(),
    imageUrls: json("imageUrls").$type<string[]>().notNull(),
    contentHash: varchar("contentHash", { length: 64 }),
    status: websiteCrawlPagesStatusEnum("status").default("fetched").notNull(),
    errorMessage: text("errorMessage"),
    fetchedAtMs: bigint("fetchedAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    pageIdx: uniqueIndex("website_crawl_page_unique").on(
      table.jobId,
      table.urlHash
    ),
  })
);

export const products = appSchema.table(
  "products",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    crawlJobId: integer("crawlJobId").references(() => websiteCrawlJobs.id),
    sourcePageId: integer("sourcePageId").references(
      () => websiteCrawlPages.id
    ),
    name: varchar("name", { length: 300 }).notNull(),
    dedupeKey: varchar("dedupeKey", { length: 64 }).notNull(),
    sku: varchar("sku", { length: 180 }),
    category: varchar("category", { length: 240 }),
    recordType: productsRecordTypeEnum("recordType")
      .default("standalone")
      .notNull(),
    variantCount: integer("variantCount").default(0).notNull(),
    serviceDetails: json("serviceDetails").$type<{
      pricing: string;
      duration: string;
      area: string;
      delivery: string;
      packages: string;
      cta: string;
    }>(),
    sourceId: integer("sourceId"),
    externalId: varchar("externalId", { length: 300 }),
    description: text("description"),
    productUrl: text("productUrl").notNull(),
    price: varchar("price", { length: 80 }),
    currency: varchar("currency", { length: 16 }),
    specifications: json("specifications")
      .$type<Record<string, string>>()
      .notNull(),
    provenance: json("provenance").$type<Record<string, string>>().notNull(),
    status: productsStatusEnum("status").default("pending").notNull(),
    reviewedByUserId: integer("reviewedByUserId").references(() => users.id),
    reviewedAtMs: bigint("reviewedAtMs", { mode: "number" }),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    productIdx: uniqueIndex("product_organization_dedupe_unique").on(
      table.organizationId,
      table.dedupeKey
    ),
  })
);

export const productVariants = appSchema.table(
  "product_variants",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    productId: integer("productId")
      .notNull()
      .references(() => products.id),
    sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    sku: varchar("sku", { length: 180 }),
    price: varchar("price", { length: 80 }),
    currency: varchar("currency", { length: 16 }),
    availability: varchar("availability", { length: 120 }),
    imageSourceUrl: text("imageSourceUrl"),
    productUrl: text("productUrl"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    variantIdx: uniqueIndex("product_variant_source_unique").on(
      table.organizationId,
      table.productId,
      table.sourceKey
    ),
  })
);

export const productImages = appSchema.table("product_images", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  productId: integer("productId")
    .notNull()
    .references(() => products.id),
  sourceUrl: text("sourceUrl").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: text("url").notNull(),
  altText: varchar("altText", { length: 500 }),
  isPrimary: integer("isPrimary").default(0).notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const campaignBriefs = appSchema.table("campaign_briefs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 200 }).notNull(),
  audience: text("audience").notNull(),
  offer: text("offer").notNull(),
  channel: campaignBriefsChannelEnum("channel").default("meta").notNull(),
  creativeSetup:
    json("creativeSetup").$type<
      import("../shared/creativeBuilder").CreativeSetup
    >(),
  placements: json("placements").$type<string[]>().notNull(),
  formats: json("formats").$type<string[]>().notNull(),
  creativeDirection: text("creativeDirection").notNull(),
  destinationUrl: text("destinationUrl"),
  requiredClaims: text("requiredClaims"),
  assetIds: json("assetIds").$type<number[]>().notNull(),
  productIds: json("productIds").$type<number[]>(),
  status: campaignBriefsStatusEnum("status").default("draft").notNull(),
  createdByUserId: integer("createdByUserId")
    .notNull()
    .references(() => users.id),
  approvedByUserId: integer("approvedByUserId").references(() => users.id),
  approvedAtMs: bigint("approvedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
});

export const creativeJobs = appSchema.table("creative_jobs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  briefId: integer("briefId")
    .notNull()
    .references(() => campaignBriefs.id),
  status: creativeJobsStatusEnum("status").default("queued").notNull(),
  inputHash: varchar("inputHash", { length: 64 }).notNull(),
  briefSnapshot: json("briefSnapshot")
    .$type<Record<string, unknown>>()
    .notNull(),
  assetSnapshot: json("assetSnapshot")
    .$type<Record<string, unknown>[]>()
    .notNull(),
  requestedByUserId: integer("requestedByUserId")
    .notNull()
    .references(() => users.id),
  errorMessage: text("errorMessage"),
  leaseExpiresAtMs: bigint("leaseExpiresAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  completedAtMs: bigint("completedAtMs", { mode: "number" }),
});

export const creativeVariants = appSchema.table("creative_variants", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  jobId: integer("jobId")
    .notNull()
    .references(() => creativeJobs.id),
  briefId: integer("briefId")
    .notNull()
    .references(() => campaignBriefs.id),
  name: varchar("name", { length: 180 }).notNull(),
  concept: text("concept").notNull(),
  primaryText: text("primaryText").notNull(),
  headline: varchar("headline", { length: 255 }).notNull(),
  description: text("description"),
  callToAction: varchar("callToAction", { length: 64 }).notNull(),
  format: varchar("format", { length: 64 }).notNull(),
  channel: creativeVariantsChannelEnum("channel").default("meta").notNull(),
  imageUrl: text("imageUrl").notNull(),
  imageStorageKey: varchar("imageStorageKey", { length: 500 }),
  renderMetadata: json("renderMetadata").$type<{
    productIds: number[];
    copy: import("../shared/creativeBuilder").CreativeCopy;
    mood?: import("../shared/creativeBuilder").CreativeMood;
    artStyle?: import("../shared/creativeBuilder").CreativeArtStyle;
    shot?: import("../shared/creativeBuilder").CreativeSetup["shot"];
    width: number;
    height: number;
  }>(),
  status: creativeVariantsStatusEnum("status").default("pending").notNull(),
  reviewedByUserId: integer("reviewedByUserId").references(() => users.id),
  reviewedAtMs: bigint("reviewedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const reviewComments = appSchema.table("review_comments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  briefId: integer("briefId").references(() => campaignBriefs.id),
  variantId: integer("variantId").references(() => creativeVariants.id),
  body: text("body").notNull(),
  status: reviewCommentsStatusEnum("status").default("open").notNull(),
  authorUserId: integer("authorUserId")
    .notNull()
    .references(() => users.id),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});

export const metaConnections = appSchema.table(
  "meta_connections",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    adAccountId: varchar("adAccountId", { length: 100 }).notNull(),
    pageId: varchar("pageId", { length: 100 }),
    instagramActorId: varchar("instagramActorId", { length: 100 }),
    accessTokenCiphertext: text("accessTokenCiphertext"),
    tokenIv: varchar("tokenIv", { length: 64 }),
    tokenTag: varchar("tokenTag", { length: 64 }),
    status: metaConnectionsStatusEnum("status")
      .default("disconnected")
      .notNull(),
    connectedByUserId: integer("connectedByUserId")
      .notNull()
      .references(() => users.id),
    connectedAtMs: bigint("connectedAtMs", { mode: "number" }),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    orgIdx: uniqueIndex("meta_connection_organization_unique").on(
      table.organizationId
    ),
  })
);

export const publishRequests = appSchema.table("publish_requests", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  organizationId: integer("organizationId")
    .notNull()
    .references(() => organizations.id),
  variantId: integer("variantId")
    .notNull()
    .references(() => creativeVariants.id),
  connectionId: integer("connectionId")
    .notNull()
    .references(() => metaConnections.id),
  action: publishRequestsActionEnum("action").notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  approvedHash: varchar("approvedHash", { length: 64 }),
  status: publishRequestsStatusEnum("status").default("draft").notNull(),
  createdByUserId: integer("createdByUserId")
    .notNull()
    .references(() => users.id),
  approvedByUserId: integer("approvedByUserId").references(() => users.id),
  publishedByUserId: integer("publishedByUserId").references(() => users.id),
  metaObjectId: varchar("metaObjectId", { length: 150 }),
  result: json("result").$type<Record<string, unknown>>(),
  approvedAtMs: bigint("approvedAtMs", { mode: "number" }),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
});

export const activityEvents = appSchema.table(
  "activity_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    actorUserId: integer("actorUserId")
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 120 }).notNull(),
    outcome: activityEventsOutcomeEnum("outcome").default("success").notNull(),
    payload: json("payload").$type<Record<string, unknown>>(),
    correlationId: varchar("correlationId", { length: 96 }).notNull(),
    previousHash: varchar("previousHash", { length: 64 }),
    eventHash: varchar("eventHash", { length: 64 }).notNull(),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    eventHashIdx: uniqueIndex("activity_event_hash_unique").on(table.eventHash),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type OrganizationRole = typeof organizationMemberships.$inferSelect.role;

export const catalogSources = appSchema.table(
  "catalog_sources",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    provider: varchar("provider", { length: 30 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    storeUrl: text("storeUrl").notNull(),
    credentials: json("credentials").$type<{
      ciphertext: string;
      iv: string;
      tag: string;
    }>(),
    status: varchar("status", { length: 30 }).default("connected").notNull(),
    cursor: text("cursor"),
    processed: integer("processed").default(0).notNull(),
    total: integer("total"),
    error: text("error"),
    leaseUntil: bigint("leaseUntil", { mode: "number" }),
    autoSync: integer("autoSync").default(1).notNull(),
    lastSyncAt: bigint("lastSyncAt", { mode: "number" }),
    nextSyncAt: bigint("nextSyncAt", { mode: "number" }),
    createdByUserId: integer("createdByUserId")
      .notNull()
      .references(() => users.id),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  table => ({
    sourceIdx: uniqueIndex("catalog_source_unique").on(
      table.organizationId,
      table.provider,
      table.storeUrl
    ),
  })
);
