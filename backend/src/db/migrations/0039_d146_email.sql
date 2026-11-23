-- D-146: members and applicants also get every in-app message by email (when they have an email
-- address and email is on in their preferences), and a loan closed by its last instalment is announced.
UPDATE "notification_templates"
SET "channels" = "channels" || '["EMAIL"]'::jsonb, "updated_at" = now()
WHERE "audience" IN ('MEMBER', 'APPLICANT') AND "channels" ? 'IN_APP' AND NOT "channels" ? 'EMAIL';
--> statement-breakpoint
INSERT INTO "notification_templates" ("key", "event", "title", "body", "channels", "audience") VALUES
  ('loan.repaid', 'Loan fully repaid by its instalments (D-146)', 'Loan repaid', 'Loan {loanNo} is fully repaid and closed. Thank you.', '["IN_APP","WHATSAPP","EMAIL"]'::jsonb, 'MEMBER')
ON CONFLICT ("key") DO NOTHING;
