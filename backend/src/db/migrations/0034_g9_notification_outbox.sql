ALTER TABLE "deliveries" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "deliveries_due_idx" ON "deliveries" USING btree ("next_attempt_at") WHERE status = 'QUEUED';--> statement-breakpoint
CREATE INDEX "deliveries_message_idx" ON "deliveries" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_provider_message_uq" ON "deliveries" USING btree ("provider_message_id");--> statement-breakpoint
-- G9 (D-121): new event templates; an Admin edit of an existing key is kept.
INSERT INTO "notification_templates" ("key", "event", "title", "body", "channels", "audience") VALUES
  ('receipt.issued', 'Counter receipt issued (G9)', 'Receipt {receiptNo}', 'We received {amount} on {date}. Receipt {receiptNo}. Thank you.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('receipt.cancelled', 'Counter receipt cancelled (G9, D-119)', 'Receipt {receiptNo} cancelled', 'Receipt {receiptNo} for {amount} was cancelled by the society office: {reason}. Your dues are as they were before it. Contact the office if this is not right.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('fd.matured', 'Fixed deposit matured (G9)', 'FD matured', 'FD {fdrNo} has matured. {amount} is ready. Visit the office to renew it or have it paid to your bank account.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('fd.paid', 'Fixed deposit paid out (G9)', 'FD paid', '{amount} for FD {fdrNo} has been paid to your bank account.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('fd.renewed', 'Fixed deposit renewed (G9, D-120)', 'FD renewed', 'FD {fdrNo} was renewed as a new FD of {amount} for {tenure} months. You get the new receipt (FDR) once the Secretary and the President accept it.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('fd.minorMajor', 'The minor on an FD turns 18 (G9)', 'FD {fdrNo}: {minor} is now 18', '{minor} turned 18 on {date}. They may now hold FD {fdrNo} in their own name. Visit the office with their ID proof to update it.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('demand.memberNotice', 'Salary deduction notice when the demand goes to the DDO (G9)', 'Salary deduction for {cycle}', '{amount} will be deducted from your {cycle} salary for the society. Open Payments in the app to see the breakup.', '["IN_APP"]'::jsonb, 'MEMBER'),
  ('member.settled', 'Final settlement posted (G9, F-08)', 'Your society account is settled', 'Your account with the society was settled on {date}. {result} Collect the settlement statement from the office.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER'),
  ('account.mobileChanged', 'Sign-in mobile number changed (G9, security alert)', 'Your mobile number was changed', 'The mobile number for your society account was changed to {mobile} on {date}. If you did not do this, call the society office at once.', '["IN_APP","WHATSAPP"]'::jsonb, 'MEMBER')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- G9 (D-121): composed messages go out between 9 am and 9 pm IST unless the Admin changes it.
UPDATE "settings_versions"
SET "data" = '{"messageWindowStartHour": 9, "messageWindowEndHour": 21}'::jsonb || "data"
WHERE NOT ("data" ? 'messageWindowStartHour');
