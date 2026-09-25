CREATE TABLE "app_private"."inbound_privacy_emails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sender" text NOT NULL,
	"recipient" text NOT NULL,
	"intro" text NOT NULL,
	"state" varchar(20) DEFAULT 'pending' NOT NULL,
	"leaseUntilMs" bigint DEFAULT 0 NOT NULL,
	"firstAttemptAtMs" bigint,
	"createdAtMs" bigint NOT NULL,
	"sentAtMs" bigint,
	"providerId" varchar(128)
);
--> statement-breakpoint
ALTER TABLE "app_private"."inbound_privacy_emails" ENABLE ROW LEVEL SECURITY;