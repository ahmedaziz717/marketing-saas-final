CREATE TABLE "app_private"."creative_workflow_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"workflowId" varchar(36) NOT NULL,
	"organizationId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"graph" json NOT NULL,
	"steps" json NOT NULL,
	"references" json DEFAULT '[]'::json NOT NULL,
	"creditsByNode" json NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stopRequested" integer DEFAULT 0 NOT NULL,
	"error" text,
	"leaseOwner" text,
	"leaseUntilMs" bigint DEFAULT 0 NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflow_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."creative_workflows" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"name" text NOT NULL,
	"graph" json NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflow_runs" ADD CONSTRAINT "creative_workflow_runs_workflowId_creative_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "app_private"."creative_workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflow_runs" ADD CONSTRAINT "creative_workflow_runs_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflow_runs" ADD CONSTRAINT "creative_workflow_runs_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflows" ADD CONSTRAINT "creative_workflows_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflows" ADD CONSTRAINT "creative_workflows_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_workflow_runs_org_time" ON "app_private"."creative_workflow_runs" USING btree ("organizationId","createdAtMs");--> statement-breakpoint
CREATE INDEX "creative_workflow_runs_queue" ON "app_private"."creative_workflow_runs" USING btree ("status","leaseUntilMs");--> statement-breakpoint
CREATE INDEX "creative_workflows_org_updated" ON "app_private"."creative_workflows" USING btree ("organizationId","updatedAtMs");