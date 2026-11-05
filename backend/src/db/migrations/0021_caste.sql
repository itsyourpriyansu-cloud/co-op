ALTER TABLE "members" ADD COLUMN "caste" text;--> statement-breakpoint
-- F-07 (D-095): the caste categories join the settings (a list already saved wins).
UPDATE "settings_versions"
SET "data" = '{"casteCategories": ["OC", "BC-A", "BC-B", "BC-C", "BC-D", "BC-E", "SC", "ST"]}'::jsonb || "data";
