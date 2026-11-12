-- G1 / G2 (D-111): new permissions on databases that already have a role matrix. A fresh database gets
-- them from the seed or the production bootstrap. ON CONFLICT keeps an Admin's earlier choice.
INSERT INTO "role_permissions" ("role", "permission") VALUES ('SUPER_ADMIN', 'audit.view') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission") VALUES ('ACCOUNTANT', 'ledger.close') ON CONFLICT DO NOTHING;
