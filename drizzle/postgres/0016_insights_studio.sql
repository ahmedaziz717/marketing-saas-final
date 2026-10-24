CREATE TABLE "app_private"."insight_dashboards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"surface" text NOT NULL,
	"name" text NOT NULL,
	"widgets" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."insight_dashboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."insight_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"config" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"nextRunAtMs" bigint,
	"scheduleError" text,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."insight_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."insight_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reportId" uuid NOT NULL,
	"organizationId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"revision" integer NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text NOT NULL,
	"scheduledForMs" bigint,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"leaseId" uuid,
	"leaseUntilMs" bigint DEFAULT 0 NOT NULL,
	"deliveryState" text DEFAULT 'disabled' NOT NULL,
	"deliveryAttempts" integer DEFAULT 0 NOT NULL,
	"deliveryNextAtMs" bigint DEFAULT 0 NOT NULL,
	"deliveryFirstAtMs" bigint,
	"deliveryLeaseId" uuid,
	"deliveryLeaseUntilMs" bigint DEFAULT 0 NOT NULL,
	"deliveryError" text,
	"deliveredAtMs" bigint,
	"deliveryPayload" jsonb,
	"createdAtMs" bigint NOT NULL,
	"finishedAtMs" bigint
);
--> statement-breakpoint
ALTER TABLE "app_private"."insight_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."insight_dashboards" ADD CONSTRAINT "insight_dashboards_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."insight_dashboards" ADD CONSTRAINT "insight_dashboards_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."insight_reports" ADD CONSTRAINT "insight_reports_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."insight_reports" ADD CONSTRAINT "insight_reports_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."insight_runs" ADD CONSTRAINT "insight_runs_reportId_insight_reports_id_fk" FOREIGN KEY ("reportId") REFERENCES "app_private"."insight_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."insight_runs" ADD CONSTRAINT "insight_runs_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."insight_runs" ADD CONSTRAINT "insight_runs_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_dashboards_owner" ON "app_private"."insight_dashboards" USING btree ("organizationId","userId","surface");--> statement-breakpoint
CREATE INDEX "insight_reports_workspace" ON "app_private"."insight_reports" USING btree ("organizationId","archived","updatedAtMs");--> statement-breakpoint
CREATE INDEX "insight_reports_due" ON "app_private"."insight_reports" USING btree ("archived","nextRunAtMs");--> statement-breakpoint
CREATE INDEX "insight_runs_history" ON "app_private"."insight_runs" USING btree ("organizationId","reportId","createdAtMs");--> statement-breakpoint
CREATE INDEX "insight_runs_queue" ON "app_private"."insight_runs" USING btree ("status","leaseUntilMs");--> statement-breakpoint
CREATE INDEX "insight_runs_delivery" ON "app_private"."insight_runs" USING btree ("deliveryState","deliveryNextAtMs","deliveryLeaseUntilMs");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_runs_schedule_once" ON "app_private"."insight_runs" USING btree ("reportId","scheduledForMs");