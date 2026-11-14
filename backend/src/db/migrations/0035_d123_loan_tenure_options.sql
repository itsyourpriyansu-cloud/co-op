ALTER TABLE "loan_product_versions" ADD COLUMN "instalment_options" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_product_versions" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- D-123: existing versions get a starting list of repayment periods up to their old maximum (the Admin then sets the real ones).
UPDATE "loan_product_versions" SET "instalment_options" = (
  SELECT array_agg(DISTINCT v ORDER BY v) FROM unnest(ARRAY[6, 12, 24, 36, 48, 60, 72, 84, 100, "max_instalments"]) AS v WHERE v <= "max_instalments"
) WHERE "instalment_options" = '{}'::integer[];
