CREATE TABLE "app_private"."workflow_app_versions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"workflowId" varchar(36) NOT NULL,
	"version" integer NOT NULL,
	"workflowRevision" integer NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"graph" json NOT NULL,
	"actorUserId" integer NOT NULL,
	"createdAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."workflow_app_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."creative_workflows" ADD COLUMN "family" text DEFAULT 'create' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_app_versions" ADD CONSTRAINT "workflow_app_versions_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_app_versions" ADD CONSTRAINT "workflow_app_versions_workflowId_creative_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "app_private"."creative_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."workflow_app_versions" ADD CONSTRAINT "workflow_app_versions_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_app_version_unique" ON "app_private"."workflow_app_versions" USING btree ("workflowId","version");--> statement-breakpoint
CREATE INDEX "workflow_app_org_created" ON "app_private"."workflow_app_versions" USING btree ("organizationId","createdAtMs");