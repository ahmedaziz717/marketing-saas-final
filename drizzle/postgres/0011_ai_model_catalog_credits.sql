CREATE TABLE "app_private"."ai_model_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"routeId" text,
	"availability" text,
	"checkedAtMs" bigint,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."ai_model_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."ai_pricing_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"config" json NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."ai_pricing_policy" ENABLE ROW LEVEL SECURITY;