-- D-148: a member is told when their date of retirement is changed (D-131, after the President approves).
INSERT INTO "notification_templates" ("key", "event", "title", "body", "channels", "audience") VALUES
  ('member.dorChanged', 'Date of retirement changed (D-131, D-148)', 'Date of retirement updated', 'Your date of retirement in the society records is now {newDor} (was {oldDor}), as approved by the Accountant, Secretary and President.', '["IN_APP","WHATSAPP","EMAIL"]'::jsonb, 'MEMBER')
ON CONFLICT ("key") DO NOTHING;
