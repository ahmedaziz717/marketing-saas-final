ALTER TABLE "app_private"."insight_reports" ADD COLUMN "widgetOwnerUserId" integer;--> statement-breakpoint
ALTER TABLE "app_private"."insight_reports" ADD COLUMN "sourceReportId" uuid;--> statement-breakpoint
ALTER TABLE "app_private"."insight_reports" ADD CONSTRAINT "insight_reports_widgetOwnerUserId_users_id_fk" FOREIGN KEY ("widgetOwnerUserId") REFERENCES "app_private"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_reports_widget_owner" ON "app_private"."insight_reports" USING btree ("organizationId","widgetOwnerUserId");--> statement-breakpoint
-- Detach existing tiles without changing the source reports or losing their last results.
DO $$
DECLARE
  layout_row record;
  source_row record;
  snapshot_row record;
  tile jsonb;
  tiles jsonb;
  entity_id uuid;
  widget_config jsonb;
BEGIN
  FOR layout_row IN SELECT * FROM app_private.insight_dashboards FOR UPDATE LOOP
    tiles := '[]'::jsonb;
    FOR tile IN SELECT value FROM jsonb_array_elements(layout_row.widgets) LOOP
      SELECT * INTO source_row FROM app_private.insight_reports
        WHERE id = (tile->>'reportId')::uuid AND "organizationId" = layout_row."organizationId";
      IF FOUND AND source_row."widgetOwnerUserId" IS NULL THEN
        entity_id := gen_random_uuid();
        widget_config := jsonb_set(source_row.config, '{delivery}',
          '{"email":false,"recipientUserIds":[],"attachPdf":false,"notifyFailure":false}'::jsonb);
        INSERT INTO app_private.insight_reports
          (id, "organizationId", "actorUserId", config, revision, archived, "nextRunAtMs", "scheduleError",
           "createdAtMs", "updatedAtMs", "widgetOwnerUserId", "sourceReportId")
        VALUES (entity_id, layout_row."organizationId", layout_row."userId", widget_config, 1,
          source_row.archived, source_row."nextRunAtMs", source_row."scheduleError", source_row."createdAtMs",
          source_row."updatedAtMs", layout_row."userId", source_row.id);
        SELECT * INTO snapshot_row FROM app_private.insight_runs
          WHERE "reportId" = source_row.id AND status IN ('completed', 'partial')
          ORDER BY "createdAtMs" DESC LIMIT 1;
        IF FOUND THEN
          INSERT INTO app_private.insight_runs
            (id, "reportId", "organizationId", "actorUserId", revision, config, status, trigger,
             result, "createdAtMs", "finishedAtMs", "deliveryState")
          VALUES (gen_random_uuid(), entity_id, layout_row."organizationId", layout_row."userId",
            CASE WHEN snapshot_row.revision = source_row.revision THEN 1 ELSE 0 END,
            jsonb_set(snapshot_row.config, '{delivery}', widget_config->'delivery'),
            snapshot_row.status, 'manual', snapshot_row.result, snapshot_row."createdAtMs", snapshot_row."finishedAtMs", 'disabled');
        END IF;
        tile := jsonb_set(tile, '{reportId}', to_jsonb(entity_id::text));
      END IF;
      tiles := tiles || jsonb_build_array(tile);
    END LOOP;
    UPDATE app_private.insight_dashboards SET widgets = tiles, revision = revision + 1 WHERE id = layout_row.id;
  END LOOP;
END $$;
