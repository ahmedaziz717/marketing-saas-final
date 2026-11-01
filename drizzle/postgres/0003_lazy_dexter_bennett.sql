CREATE TABLE "app_private"."website_profile" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updatedBy" integer NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."website_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."website_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receiptHash" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"topic" varchar(20) NOT NULL,
	"workspace" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"state" varchar(30) DEFAULT 'received' NOT NULL,
	"resolutionNote" text,
	"updatedBy" integer,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL,
	CONSTRAINT "website_requests_receiptHash_unique" UNIQUE("receiptHash")
);
--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."website_profile" ADD CONSTRAINT "website_profile_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD CONSTRAINT "website_requests_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;