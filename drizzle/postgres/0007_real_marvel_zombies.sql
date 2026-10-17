CREATE TABLE "app_private"."ai_usage" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"actorUserId" integer,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"inputTokens" bigint,
	"outputTokens" bigint,
	"cachedTokens" bigint,
	"usage" json,
	"costMicros" bigint,
	"rateSnapshot" json,
	"credits" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"finishedAtMs" bigint
);
--> statement-breakpoint
CREATE TABLE "app_private"."credit_ledger" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"actorUserId" integer,
	"createdAtMs" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_private"."platform_accounts" (
	"organizationId" integer PRIMARY KEY NOT NULL,
	"tierId" varchar(42),
	"enforceCredits" integer DEFAULT 0 NOT NULL,
	"aiPaused" integer DEFAULT 0 NOT NULL,
	"ownerEmail" text,
	"notes" text,
	"inviteHash" text,
	"inviteExpiresAtMs" bigint,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_private"."platform_audit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_private"."platform_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actorUserId" integer NOT NULL,
	"action" text NOT NULL,
	"organizationId" integer,
	"payload" json NOT NULL,
	"createdAtMs" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_private"."platform_financial_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"kind" text NOT NULL,
	"amountMicros" bigint NOT NULL,
	"description" text NOT NULL,
	"occurredAtMs" bigint NOT NULL,
	"actorUserId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_private"."platform_tiers" (
	"id" varchar(42) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthlyCredits" integer NOT NULL,
	"monthlyPriceMicros" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_private"."provider_rates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_private"."provider_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"config" json NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."ai_usage" ADD CONSTRAINT "ai_usage_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."ai_usage" ADD CONSTRAINT "ai_usage_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."credit_ledger" ADD CONSTRAINT "credit_ledger_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."credit_ledger" ADD CONSTRAINT "credit_ledger_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."platform_accounts" ADD CONSTRAINT "platform_accounts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."platform_accounts" ADD CONSTRAINT "platform_accounts_tierId_platform_tiers_id_fk" FOREIGN KEY ("tierId") REFERENCES "app_private"."platform_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."platform_audit" ADD CONSTRAINT "platform_audit_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."platform_audit" ADD CONSTRAINT "platform_audit_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."platform_financial_entries" ADD CONSTRAINT "platform_financial_entries_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."platform_financial_entries" ADD CONSTRAINT "platform_financial_entries_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_org_time" ON "app_private"."ai_usage" USING btree ("organizationId","createdAtMs");--> statement-breakpoint
CREATE INDEX "credit_ledger_org_period" ON "app_private"."credit_ledger" USING btree ("organizationId","period");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_rates_unique" ON "app_private"."provider_rates" USING btree ("provider","model","kind");
--> statement-breakpoint
ALTER TABLE "app_private"."platform_tiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_private"."platform_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_private"."provider_rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_private"."ai_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_private"."credit_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_private"."platform_financial_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_private"."platform_audit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO "app_private"."platform_tiers" ("id","name","monthlyCredits","monthlyPriceMicros","updatedAtMs") VALUES ('trial','Trial',100,0,1790726400000),('starter','Starter',500,0,1790726400000),('growth','Growth',2000,0,1790726400000),('scale','Scale',10000,0,1790726400000);

--> statement-breakpoint
INSERT INTO "app_private"."provider_rates" ("provider","model","kind","config","updatedAtMs") VALUES ('openai','gpt-5.5','text','{"provider": "openai", "model": "gpt-5.5", "kind": "text", "credits": 1, "inputPerMillion": 5, "cachedInputPerMillion": 0.5, "outputPerMillion": 30, "perRequestUsd": null, "longContextThreshold": 272000, "longContextInputMultiplier": 2, "longContextOutputMultiplier": 1.5, "note": "Standard global API list pricing verified 2026-09-30: https://developers.openai.com/api/docs/models/gpt-5.5 . Estimates exclude contract discounts and nonstandard processing tiers; edit to match your agreement."}'::json,1790726400000);

--> statement-breakpoint
INSERT INTO "app_private"."provider_rates" ("provider","model","kind","config","updatedAtMs") VALUES ('openai','gpt-image-2.5-sunburst','image','{"provider": "openai", "model": "gpt-image-2.5-sunburst", "kind": "image", "credits": 10, "inputPerMillion": null, "cachedInputPerMillion": null, "outputPerMillion": null, "perRequestUsd": null, "note": "Enter an agreed per-image cost estimate. No verified public price has been substituted for this model."}'::json,1790726400000);
