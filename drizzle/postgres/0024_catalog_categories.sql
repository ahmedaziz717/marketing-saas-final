CREATE TABLE "app_private"."catalog_category_settings" (
  "organizationId" integer PRIMARY KEY REFERENCES "app_private"."organizations"("id"),
  "revision" integer NOT NULL,
  "settings" json NOT NULL,
  "updatedByUserId" integer NOT NULL REFERENCES "app_private"."users"("id"),
  "updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."catalog_category_settings" ENABLE ROW LEVEL SECURITY;
