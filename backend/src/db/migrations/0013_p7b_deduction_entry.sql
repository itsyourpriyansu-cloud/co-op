-- P7b (D-088): send-by days and minimum take-home pay join the settings (values already saved win);
-- DDOs and the Accountant enter deductions, the Accountant approves and posts.
UPDATE "settings_versions"
SET "data" = '{"demandSendByDays": 4, "minTakeHomePay": 0}'::jsonb || "data";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission") VALUES
  ('ACCOUNTANT', 'collections.enterDeduction'),
  ('ACCOUNTANT', 'collections.postRecovery'),
  ('DDO', 'collections.enterDeduction')
ON CONFLICT DO NOTHING;
