CREATE TABLE "app_private"."optimization_classifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"connectionId" uuid NOT NULL,
	"adId" varchar(100) NOT NULL,
	"dimension" varchar(40) NOT NULL,
	"assertion" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"source" varchar(20) NOT NULL,
	"fingerprint" varchar(64) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."optimization_classifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."optimization_records" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"connectionId" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"remoteId" varchar(100) NOT NULL,
	"date" varchar(10) DEFAULT '' NOT NULL,
	"grain" varchar(20) DEFAULT 'snapshot' NOT NULL,
	"data" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."optimization_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."optimization_syncs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"connectionId" uuid NOT NULL,
	"actorUserId" integer NOT NULL,
	"status" varchar(30) NOT NULL,
	"tasks" jsonb NOT NULL,
	"checkpoint" jsonb NOT NULL,
	"since" varchar(10) NOT NULL,
	"until" varchar(10) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAtMs" bigint DEFAULT 0 NOT NULL,
	"leaseOwner" uuid,
	"leaseUntilMs" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."optimization_syncs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_classifications" ADD CONSTRAINT "optimization_classifications_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_classifications" ADD CONSTRAINT "optimization_classifications_connectionId_channel_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "app_private"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_records" ADD CONSTRAINT "optimization_records_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_records" ADD CONSTRAINT "optimization_records_connectionId_channel_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "app_private"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_syncs" ADD CONSTRAINT "optimization_syncs_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_syncs" ADD CONSTRAINT "optimization_syncs_connectionId_channel_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "app_private"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."optimization_syncs" ADD CONSTRAINT "optimization_syncs_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_classification_revision" ON "app_private"."optimization_classifications" USING btree ("organizationId","connectionId","adId","dimension","source","revision");--> statement-breakpoint
CREATE INDEX "optimization_classification_lookup" ON "app_private"."optimization_classifications" USING btree ("organizationId","connectionId","adId");--> statement-breakpoint
CREATE INDEX "optimization_record_lookup" ON "app_private"."optimization_records" USING btree ("organizationId","connectionId","kind","grain","date");--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_sync_connection" ON "app_private"."optimization_syncs" USING btree ("organizationId","connectionId");--> statement-breakpoint
CREATE INDEX "optimization_sync_queue" ON "app_private"."optimization_syncs" USING btree ("status","nextAtMs");