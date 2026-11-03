-- P7b-2 (D-088, R5): the Accountant may waive penal interest, with a reason.
INSERT INTO "role_permissions" ("role", "permission") VALUES ('ACCOUNTANT', 'collections.waivePenal') ON CONFLICT DO NOTHING;
