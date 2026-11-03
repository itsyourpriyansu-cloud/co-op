-- P7b-3 (D-088): the society answered Q-310, every unpaid month makes a defaulter. Settings still on
-- the old placeholder (3, never confirmed) move to 1 and stop being a placeholder; a value the
-- Admin already chose is kept.
UPDATE "settings_versions"
SET "data" = jsonb_set(
  jsonb_set("data", '{defaulterCycles}', '1'::jsonb),
  '{placeholders}',
  COALESCE(("data"->'placeholders') - 'defaulterCycles', '[]'::jsonb)
)
WHERE "data"->'placeholders' ? 'defaulterCycles' AND ("data"->>'defaulterCycles')::int = 3;
--> statement-breakpoint
-- The notice to a defaulter's sureties (wording placeholder until the society confirms Q-310).
INSERT INTO "notification_templates" ("key", "event", "title", "body", "channels", "audience") VALUES (
  'defaulter.guarantorNotice',
  'Notice to the sureties of a defaulter (P7b-3, Q-310)',
  'Surety notice: {borrower}',
  '{borrower} (General No. {generalNo}), whose loan {loanNo} you stand surety for, has not repaid {overdue} for {cycles} month(s). Please ask them to clear it at the society counter. As a surety you may be asked to repay it as per the bye-laws and your agreement with the society.',
  '["IN_APP","SMS"]'::jsonb,
  'MEMBER'
) ON CONFLICT ("key") DO NOTHING;
