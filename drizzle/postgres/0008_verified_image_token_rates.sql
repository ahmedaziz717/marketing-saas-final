-- Verified 2026-09-30 against the exact model's official pricing and Images API
-- guide. Preserve configured overrides. Amounts are USD per million tokens.
UPDATE app_private.provider_rates SET config = (config::jsonb || jsonb_build_object(
  'inputPerMillion',5, 'cachedInputPerMillion',1.25, 'outputPerMillion',0,
  'imageInputPerMillion',8, 'imageOutputPerMillion',30,
  'sourceUrl','https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst',
  'pricingVersion','openai-sunburst-2026-09-30',
  'note','Official standard rates verified 2026-09-30. Direct Images API: text input $5/M, image input $8/M, image output $30/M; no cached-input discount. Costs are estimates before account-specific discounts or adjustments.'
))::json, "updatedAtMs" = (extract(epoch from now())*1000)::bigint
WHERE provider='openai' AND model='gpt-image-2.5-sunburst' AND kind='image'
AND config->>'perRequestUsd' IS NULL AND config->>'inputPerMillion' IS NULL
AND config->>'outputPerMillion' IS NULL AND config->>'imageInputPerMillion' IS NULL
AND config->>'imageOutputPerMillion' IS NULL;
--> statement-breakpoint
-- Only recover successful requests whose recorded category counts reconcile.
-- These legacy records all came from the direct Images API (the sole image
-- integration before this migration). Never overwrite previously priced rows.
WITH eligible AS (
 SELECT u.*, p.config AS verified_rate,
   (u.usage->'input_tokens_details'->>'text_tokens')::numeric * 5
   + (u.usage->'input_tokens_details'->>'image_tokens')::numeric * 8
   + (u.usage->>'output_tokens')::numeric * 30 AS calculated_micros
 FROM app_private.ai_usage u
 JOIN app_private.provider_rates p ON p.provider=u.provider AND p.model=u.model AND p.kind=u.kind
 WHERE u.provider='openai' AND u.model='gpt-image-2.5-sunburst' AND u.kind='image'
 AND u.status='succeeded' AND u."costMicros" IS NULL
 AND u."createdAtMs" >= (extract(epoch from timestamp with time zone '2026-09-08 00:00:00+00')*1000)::bigint
 AND p.config->>'pricingVersion'='openai-sunburst-2026-09-30'
 AND p.config->>'inputPerMillion'='5' AND p.config->>'imageInputPerMillion'='8' AND p.config->>'imageOutputPerMillion'='30'
 AND p.config->>'perRequestUsd' IS NULL
 AND coalesce(u.usage->>'_evokeloop_api','images')='images'
 AND (u.usage->'input_tokens_details'->>'text_tokens') ~ '^[0-9]+$'
 AND (u.usage->'input_tokens_details'->>'image_tokens') ~ '^[0-9]+$'
 AND (u.usage->>'input_tokens') ~ '^[0-9]+$'
 AND (u.usage->>'output_tokens') ~ '^[0-9]+$'
 AND CASE WHEN (u.usage->'input_tokens_details'->>'text_tokens') ~ '^[0-9]+$'
           AND (u.usage->'input_tokens_details'->>'image_tokens') ~ '^[0-9]+$'
           AND (u.usage->>'input_tokens') ~ '^[0-9]+$'
   THEN (u.usage->'input_tokens_details'->>'text_tokens')::numeric
      + (u.usage->'input_tokens_details'->>'image_tokens')::numeric = (u.usage->>'input_tokens')::numeric
   ELSE false END
 AND (u.usage->'output_tokens_details' IS NULL OR (
   u.usage->'output_tokens_details'->>'text_tokens'='0'
   AND u.usage->'output_tokens_details'->>'image_tokens'=u.usage->>'output_tokens'))
), updated AS (
 UPDATE app_private.ai_usage u SET
  "costMicros"=round(e.calculated_micros)::bigint,
  "rateSnapshot"=e.verified_rate,
  usage=(u.usage::jsonb || jsonb_build_object('_evokeloop_api','images',
    '_evokeloop_pricing_backfill',jsonb_build_object('version','openai-sunburst-2026-09-30',
    'previousRateSnapshot',u."rateSnapshot",'at',now())))::json
 FROM eligible e WHERE u.id=e.id AND u."costMicros" IS NULL AND e.calculated_micros BETWEEN 0 AND 9007199254740991
 RETURNING u.id, u."organizationId", u."actorUserId", u."costMicros"
)
INSERT INTO app_private.platform_audit ("actorUserId",action,"organizationId",payload,"createdAtMs")
SELECT "actorUserId",'usage.cost_backfilled',"organizationId",
 json_build_object('requestId',id,'costMicros',"costMicros",'migration','0008_verified_image_token_rates','basis','Recorded category tokens × official standard rates'),
 (extract(epoch from now())*1000)::bigint
FROM updated WHERE "actorUserId" IS NOT NULL;
