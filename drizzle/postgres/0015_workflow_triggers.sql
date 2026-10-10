CREATE TABLE "app_private"."workflow_trigger_receipts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"triggerId" varchar(36) NOT NULL,
	"runId" varchar(36) NOT NULL,
	"eventKey" text NOT NULL,
	"createdAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."workflow_trigger_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."workflow_triggers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"appVersionId" varchar(36) NOT NULL,
	"enabled" integer DEFAULT 0 NOT NULL,
	"config" json NOT NULL,
	"nextAtMs" bigint DEFAULT 0 NOT NULL,
	"lastEventAtMs" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."workflow_triggers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflow_runs" ADD COLUMN "triggerId" varchar(36);--> statement-breakpoint
ALTER TABLE "app_private"."workflow_trigger_receipts" ADD CONSTRAINT "workflow_trigger_receipts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_trigger_receipts" ADD CONSTRAINT "workflow_trigger_receipts_triggerId_workflow_triggers_id_fk" FOREIGN KEY ("triggerId") REFERENCES "app_private"."workflow_triggers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_trigger_receipts" ADD CONSTRAINT "workflow_trigger_receipts_runId_creative_workflow_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "app_private"."creative_workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_triggers" ADD CONSTRAINT "workflow_triggers_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_triggers" ADD CONSTRAINT "workflow_triggers_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_triggers" ADD CONSTRAINT "workflow_triggers_appVersionId_workflow_app_versions_id_fk" FOREIGN KEY ("appVersionId") REFERENCES "app_private"."workflow_app_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_trigger_receipts_org" ON "app_private"."workflow_trigger_receipts" USING btree ("organizationId","triggerId");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_trigger_version" ON "app_private"."workflow_triggers" USING btree ("organizationId","appVersionId");--> statement-breakpoint
CREATE INDEX "workflow_trigger_due" ON "app_private"."workflow_triggers" USING btree ("enabled","nextAtMs");