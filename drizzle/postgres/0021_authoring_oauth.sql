CREATE TABLE "app_private"."authoring_oauth_grants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"organizationId" integer NOT NULL,
	"clientId" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"expiresAtMs" bigint NOT NULL,
	"revokedAtMs" bigint,
	CONSTRAINT "authoring_oauth_grants_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."authoring_oauth_requests" (
	"idHash" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"clientId" text NOT NULL,
	"redirectUri" text NOT NULL,
	"state" text NOT NULL,
	"challenge" varchar(43) NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"expiresAtMs" bigint NOT NULL,
	"codeHash" varchar(64),
	"organizationId" integer,
	"consumedAtMs" bigint,
	CONSTRAINT "authoring_oauth_requests_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_grants" ADD CONSTRAINT "authoring_oauth_grants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_grants" ADD CONSTRAINT "authoring_oauth_grants_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_requests" ADD CONSTRAINT "authoring_oauth_requests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."authoring_oauth_requests" ADD CONSTRAINT "authoring_oauth_requests_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;