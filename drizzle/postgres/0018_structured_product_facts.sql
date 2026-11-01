ALTER TABLE "app_private"."products" ADD COLUMN "features" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "app_private"."products" ADD COLUMN "availability" varchar(120);