ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailState" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailAttempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailNextAttemptAtMs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailLeaseUntilMs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailFirstAttemptAtMs" bigint;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailSentAtMs" bigint;--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailProviderId" varchar(128);--> statement-breakpoint
ALTER TABLE "app_private"."website_requests" ADD COLUMN "emailLastError" varchar(80);