CREATE TABLE "app_private"."authoring_oauth_refresh_tokens" (
	"tokenHash" varchar(64) PRIMARY KEY NOT NULL,
	"connectionId" varchar(36) NOT NULL,
	"consumedAtMs" bigint
);
--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_refresh_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_grants" ADD COLUMN "refreshExpiresAtMs" bigint;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_requests" ADD COLUMN "ongoing" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_refresh_tokens" ADD CONSTRAINT "authoring_oauth_refresh_tokens_connectionId_authoring_oauth_grants_id_fk" FOREIGN KEY ("connectionId") REFERENCES "app_private"."authoring_oauth_grants"("id") ON DELETE cascade ON UPDATE no action;