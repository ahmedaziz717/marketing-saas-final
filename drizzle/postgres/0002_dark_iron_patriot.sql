CREATE TABLE "app_private"."channel_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"channel" varchar(40) NOT NULL,
	"accountId" varchar(100) NOT NULL,
	"name" varchar(250) NOT NULL,
	"status" varchar(24) NOT NULL,
	"credentials" jsonb,
	"details" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"connectedByUserId" integer NOT NULL,
	"verifiedAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."channel_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."channel_oauth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"stateHash" varchar(64),
	"credentials" jsonb,
	"expiresAtMs" bigint NOT NULL,
	"createdAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."channel_oauth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."channel_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"channel" varchar(40) NOT NULL,
	"postsPerWeek" integer DEFAULT 2 NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"slots" jsonb NOT NULL,
	"updatedByUserId" integer NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."channel_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"channel" varchar(40) NOT NULL,
	"connectionId" uuid,
	"assetKey" varchar(100),
	"content" jsonb NOT NULL,
	"state" varchar(30) DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"approvalHash" varchar(64),
	"approvedByUserId" integer,
	"approvedAtMs" bigint,
	"scheduledAtMs" bigint,
	"timezone" varchar(100) NOT NULL,
	"externalId" varchar(200),
	"result" jsonb,
	"error" text,
	"leaseUntilMs" bigint,
	"claimId" uuid,
	"createdByUserId" integer NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."channel_connections" ADD CONSTRAINT "channel_connections_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."channel_connections" ADD CONSTRAINT "channel_connections_connectedByUserId_users_id_fk" FOREIGN KEY ("connectedByUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."channel_oauth_sessions" ADD CONSTRAINT "channel_oauth_sessions_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."channel_oauth_sessions" ADD CONSTRAINT "channel_oauth_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."channel_plans" ADD CONSTRAINT "channel_plans_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."channel_plans" ADD CONSTRAINT "channel_plans_updatedByUserId_users_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."publications" ADD CONSTRAINT "publications_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."publications" ADD CONSTRAINT "publications_connectionId_channel_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "app_private"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."publications" ADD CONSTRAINT "publications_approvedByUserId_users_id_fk" FOREIGN KEY ("approvedByUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."publications" ADD CONSTRAINT "publications_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connection_account" ON "app_private"."channel_connections" USING btree ("organizationId","channel","accountId");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_oauth_state" ON "app_private"."channel_oauth_sessions" USING btree ("stateHash");--> statement-breakpoint
CREATE INDEX "channel_oauth_expiry" ON "app_private"."channel_oauth_sessions" USING btree ("expiresAtMs");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_plan_workspace" ON "app_private"."channel_plans" USING btree ("organizationId","channel");--> statement-breakpoint
CREATE INDEX "publication_workspace" ON "app_private"."publications" USING btree ("organizationId","createdAtMs");--> statement-breakpoint
CREATE INDEX "publication_due" ON "app_private"."publications" USING btree ("state","scheduledAtMs");--> statement-breakpoint
CREATE INDEX "publication_lease" ON "app_private"."publications" USING btree ("state","leaseUntilMs");