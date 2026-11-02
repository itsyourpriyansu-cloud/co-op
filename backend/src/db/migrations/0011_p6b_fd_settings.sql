-- P6b (D-086): FD maturity job and premature withdrawal settings. Existing settings versions get the
-- defaults; values already saved win (right side of ||). Penalty 0 until the society confirms F-06.
UPDATE "settings_versions"
SET "data" = '{"fdMaturityJobEnabled": true, "fdMaturityRunHour": 1, "fdPrematureWithdrawalEnabled": true, "fdPrematurePenaltyMethod": "RATE_CUT", "fdPrematurePenaltyPercent": 0}'::jsonb || "data";
--> statement-breakpoint
-- Super Admin may withdraw an FD early (changeable on the Permissions screen).
INSERT INTO "role_permissions" ("role", "permission") VALUES ('SUPER_ADMIN', 'deposits.withdraw') ON CONFLICT DO NOTHING;
