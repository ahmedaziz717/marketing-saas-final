CREATE TABLE "app_private"."provider_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"ready" integer DEFAULT 0 NOT NULL,
	"heartbeatAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."provider_workers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."video_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"setup" json NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"references" json DEFAULT '[]'::json NOT NULL,
	"endpoint" text,
	"requestBody" json,
	"requestPreparedAtMs" bigint,
	"providerRequestId" text,
	"providerStatusUrl" text,
	"providerCancelUrl" text,
	"outputUrl" text,
	"outputAssetId" integer,
	"error" text,
	"cancelRequested" integer DEFAULT 0 NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextPollAtMs" bigint DEFAULT 0 NOT NULL,
	"leaseOwner" text,
	"leaseUntilMs" bigint DEFAULT 0 NOT NULL,
	"createdAtMs" bigint NOT NULL,
	"updatedAtMs" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."video_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."video_jobs" ADD CONSTRAINT "video_jobs_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "app_private"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."video_jobs" ADD CONSTRAINT "video_jobs_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."video_jobs" ADD CONSTRAINT "video_jobs_outputAssetId_brand_assets_id_fk" FOREIGN KEY ("outputAssetId") REFERENCES "app_private"."brand_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_jobs_org_time" ON "app_private"."video_jobs" USING btree ("organizationId","createdAtMs");--> statement-breakpoint
CREATE INDEX "video_jobs_pending" ON "app_private"."video_jobs" USING btree ("status","nextPollAtMs","leaseUntilMs");
--> statement-breakpoint
INSERT INTO app_private.provider_rates (provider, model, kind, config, "updatedAtMs") VALUES ('higgsfield','seedance-2.5/480p','video','{"provider":"higgsfield","model":"seedance-2.5/480p","kind":"video","credits":21,"inputPerMillion":null,"cachedInputPerMillion":null,"outputPerMillion":21.4,"perRequestUsd":null,"perSecondUsd":null,"videoInputMultiplier":0.6,"sourceUrl":"https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground","automaticPricing":false,"pricingCheckedAt":1790985600000,"pricingVerifiedAt":1790985600000,"pricingVersion":"higgsfield-published-2026-10-03","note":"Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates."}'::json,1790985600000) ON CONFLICT (provider,model,kind) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_private.provider_rates (provider, model, kind, config, "updatedAtMs") VALUES ('higgsfield','seedance-2.5/720p','video','{"provider":"higgsfield","model":"seedance-2.5/720p","kind":"video","credits":47,"inputPerMillion":null,"cachedInputPerMillion":null,"outputPerMillion":21.4,"perRequestUsd":null,"perSecondUsd":null,"videoInputMultiplier":0.6,"sourceUrl":"https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground","automaticPricing":false,"pricingCheckedAt":1790985600000,"pricingVerifiedAt":1790985600000,"pricingVersion":"higgsfield-published-2026-10-03","note":"Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates."}'::json,1790985600000) ON CONFLICT (provider,model,kind) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_private.provider_rates (provider, model, kind, config, "updatedAtMs") VALUES ('higgsfield','seedance-2.5/1080p','video','{"provider":"higgsfield","model":"seedance-2.5/1080p","kind":"video","credits":114,"inputPerMillion":null,"cachedInputPerMillion":null,"outputPerMillion":23.4,"perRequestUsd":null,"perSecondUsd":null,"videoInputMultiplier":0.6,"sourceUrl":"https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground","automaticPricing":false,"pricingCheckedAt":1790985600000,"pricingVerifiedAt":1790985600000,"pricingVersion":"higgsfield-published-2026-10-03","note":"Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates."}'::json,1790985600000) ON CONFLICT (provider,model,kind) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_private.provider_rates (provider, model, kind, config, "updatedAtMs") VALUES ('higgsfield','genjutsu/480p','video','{"provider":"higgsfield","model":"genjutsu/480p","kind":"video","credits":32,"inputPerMillion":null,"cachedInputPerMillion":null,"outputPerMillion":null,"perRequestUsd":null,"perSecondUsd":0.318,"videoInputMultiplier":1,"sourceUrl":"https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground","automaticPricing":false,"pricingCheckedAt":1790985600000,"pricingVerifiedAt":1790985600000,"pricingVersion":"higgsfield-published-2026-10-03","note":"Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates."}'::json,1790985600000) ON CONFLICT (provider,model,kind) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_private.provider_rates (provider, model, kind, config, "updatedAtMs") VALUES ('higgsfield','genjutsu/720p','video','{"provider":"higgsfield","model":"genjutsu/720p","kind":"video","credits":69,"inputPerMillion":null,"cachedInputPerMillion":null,"outputPerMillion":null,"perRequestUsd":null,"perSecondUsd":0.681,"videoInputMultiplier":1,"sourceUrl":"https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground","automaticPricing":false,"pricingCheckedAt":1790985600000,"pricingVerifiedAt":1790985600000,"pricingVersion":"higgsfield-published-2026-10-03","note":"Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates."}'::json,1790985600000) ON CONFLICT (provider,model,kind) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_private.provider_rates (provider, model, kind, config, "updatedAtMs") VALUES ('higgsfield','genjutsu/1080p','video','{"provider":"higgsfield","model":"genjutsu/1080p","kind":"video","credits":164,"inputPerMillion":null,"cachedInputPerMillion":null,"outputPerMillion":null,"perRequestUsd":null,"perSecondUsd":1.632,"videoInputMultiplier":1,"sourceUrl":"https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground","automaticPricing":false,"pricingCheckedAt":1790985600000,"pricingVerifiedAt":1790985600000,"pricingVersion":"higgsfield-published-2026-10-03","note":"Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates."}'::json,1790985600000) ON CONFLICT (provider,model,kind) DO NOTHING;
