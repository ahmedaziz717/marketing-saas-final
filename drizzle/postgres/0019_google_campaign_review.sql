CREATE TABLE "app_private"."google_campaign_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"connectionId" uuid NOT NULL,
	"change" jsonb NOT NULL,
	"state" varchar(24) DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reviewHash" varchar(64),
	"validatedAtMs" bigint,
	"approvedByUserId" integer,
	"result" jsonb,
	"error" text,
	"createdByUserId" integer NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."google_campaign_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."google_campaign_drafts" ADD CONSTRAINT "google_campaign_drafts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."google_campaign_drafts" ADD CONSTRAINT "google_campaign_drafts_connectionId_channel_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "app_private"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."google_campaign_drafts" ADD CONSTRAINT "google_campaign_drafts_approvedByUserId_users_id_fk" FOREIGN KEY ("approvedByUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."google_campaign_drafts" ADD CONSTRAINT "google_campaign_drafts_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_draft_workspace" ON "app_private"."google_campaign_drafts" USING btree ("organizationId","connectionId","updatedAtMs");