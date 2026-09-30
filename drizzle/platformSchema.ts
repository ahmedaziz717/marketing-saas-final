import {
  integer,
  bigint,
  text,
  varchar,
  json,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { appSchema, organizations, users } from "./schema";
import type { ProviderRate } from "../shared/platformAdmin";
export const platformTiers = appSchema.table("platform_tiers", {
  id: varchar("id", { length: 42 }).primaryKey(),
  name: text("name").notNull(),
  monthlyCredits: integer("monthlyCredits").notNull(),
  monthlyPriceMicros: bigint("monthlyPriceMicros", {
    mode: "number",
  }).notNull(),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
});
export const platformAccounts = appSchema.table("platform_accounts", {
  organizationId: integer("organizationId")
    .primaryKey()
    .references(() => organizations.id),
  tierId: varchar("tierId", { length: 42 }).references(() => platformTiers.id),
  enforceCredits: integer("enforceCredits").notNull().default(0),
  aiPaused: integer("aiPaused").notNull().default(0),
  ownerEmail: text("ownerEmail"),
  notes: text("notes"),
  inviteHash: text("inviteHash"),
  inviteExpiresAtMs: bigint("inviteExpiresAtMs", { mode: "number" }),
  updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
});
export const providerRates = appSchema.table(
  "provider_rates",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    kind: text("kind").notNull(),
    config: json("config").$type<ProviderRate>().notNull(),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  t => [uniqueIndex("provider_rates_unique").on(t.provider, t.model, t.kind)]
);
export const aiUsage = appSchema.table(
  "ai_usage",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: integer("organizationId").references(
      () => organizations.id
    ),
    actorUserId: integer("actorUserId").references(() => users.id),
    operation: text("operation").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    inputTokens: bigint("inputTokens", { mode: "number" }),
    outputTokens: bigint("outputTokens", { mode: "number" }),
    cachedTokens: bigint("cachedTokens", { mode: "number" }),
    usage: json("usage").$type<Record<string, unknown>>(),
    costMicros: bigint("costMicros", { mode: "number" }),
    rateSnapshot: json("rateSnapshot").$type<ProviderRate>(),
    credits: integer("credits").notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    finishedAtMs: bigint("finishedAtMs", { mode: "number" }),
  },
  t => [index("ai_usage_org_time").on(t.organizationId, t.createdAtMs)]
);
export const creditLedger = appSchema.table(
  "credit_ledger",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    organizationId: integer("organizationId")
      .notNull()
      .references(() => organizations.id),
    period: varchar("period", { length: 7 }).notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    actorUserId: integer("actorUserId").references(() => users.id),
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  },
  t => [index("credit_ledger_org_period").on(t.organizationId, t.period)]
);
export const platformFinancialEntries = appSchema.table(
  "platform_financial_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: integer("organizationId").references(
      () => organizations.id
    ),
    kind: text("kind").notNull(),
    amountMicros: bigint("amountMicros", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    occurredAtMs: bigint("occurredAtMs", { mode: "number" }).notNull(),
    actorUserId: integer("actorUserId")
      .notNull()
      .references(() => users.id),
  }
);
export const platformAudit = appSchema.table("platform_audit", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  actorUserId: integer("actorUserId")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  organizationId: integer("organizationId").references(() => organizations.id),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
});
