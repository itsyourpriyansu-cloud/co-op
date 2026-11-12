CREATE TABLE "financial_years" (
	"fy" text PRIMARY KEY NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"closing_entry_id" uuid,
	"surplus" bigint NOT NULL,
	"closed_by" text NOT NULL,
	"closed_by_name" text NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_no" text NOT NULL,
	"kind" text NOT NULL,
	"voucher_date" date NOT NULL,
	"head_code" text NOT NULL,
	"amount" bigint NOT NULL,
	"mode" text NOT NULL,
	"reference" text,
	"party" text NOT NULL,
	"narration" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "parent_code" text;--> statement-breakpoint
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_closing_entry_id_journal_entries_id_fk" FOREIGN KEY ("closing_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_vouchers" ADD CONSTRAINT "office_vouchers_head_code_ledger_accounts_code_fk" FOREIGN KEY ("head_code") REFERENCES "public"."ledger_accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_vouchers" ADD CONSTRAINT "office_vouchers_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "office_vouchers_no_uq" ON "office_vouchers" USING btree ("voucher_no");--> statement-breakpoint
CREATE INDEX "office_vouchers_date_idx" ON "office_vouchers" USING btree ("voucher_date");
--> statement-breakpoint
-- G2 (D-112): office income / expense heads, dividend payable and the surplus account (existing books keep theirs).
INSERT INTO "ledger_accounts" ("code", "name", "type", "member_level", "sort_order", "description") VALUES
('2500', 'Dividend payable', 'LIABILITY', true, 2500, 'Declared on share capital, not yet paid (G2)'),
('3300', 'Surplus / deficit', 'EQUITY', false, 3300, 'Income less expenses of each closed year (G2)'),
('4500', 'Interest received from bank', 'INCOME', false, 4500, NULL),
('4900', 'Other income', 'INCOME', false, 4900, NULL),
('5210', 'Interest on share deposit', 'EXPENSE', false, 5210, NULL),
('5300', 'Salaries and honorarium', 'EXPENSE', false, 5300, NULL),
('5400', 'Rent and office maintenance', 'EXPENSE', false, 5400, NULL),
('5500', 'Printing and stationery', 'EXPENSE', false, 5500, NULL),
('5600', 'Audit fees', 'EXPENSE', false, 5600, NULL),
('5700', 'Bank charges', 'EXPENSE', false, 5700, NULL),
('5800', 'General body and meeting expenses', 'EXPENSE', false, 5800, NULL),
('5900', 'Other office expenses', 'EXPENSE', false, 5900, NULL)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- G2 placeholders join the settings (a value already saved wins).
UPDATE "settings_versions"
SET "data" = jsonb_set('{"shareDepositRatePercent": 6, "depositInterestBasis": "YEAR_END"}'::jsonb || "data", '{placeholders}', COALESCE("data"->'placeholders', '[]'::jsonb) || '["shareDepositRatePercent", "depositInterestBasis"]'::jsonb)
WHERE NOT ("data" ? 'shareDepositRatePercent');
