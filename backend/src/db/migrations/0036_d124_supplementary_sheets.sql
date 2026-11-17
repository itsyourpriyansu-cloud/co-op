DROP INDEX "demand_sheets_cycle_dept_idx";--> statement-breakpoint
ALTER TABLE "demand_sheets" ADD COLUMN "supplement_no" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "demand_sheets_cycle_dept_idx" ON "demand_sheets" USING btree ("cycle","department_id","supplement_no");--> statement-breakpoint
-- D-124: the two new switches join the settings (a value already saved wins).
UPDATE "settings_versions"
SET "data" = jsonb_set('{"earlyInterestEnabled": true, "lateJoinerOwesMissedMonth": false}'::jsonb || "data", '{placeholders}', COALESCE("data"->'placeholders', '[]'::jsonb) || '["earlyInterestEnabled", "lateJoinerOwesMissedMonth"]'::jsonb);
