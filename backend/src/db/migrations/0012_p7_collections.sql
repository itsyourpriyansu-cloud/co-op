CREATE TABLE "demand_lines" (
	"sheet_id" text NOT NULL,
	"member_id" text NOT NULL,
	"cycle" text NOT NULL,
	"components" jsonb NOT NULL,
	"total_demand" bigint NOT NULL,
	"recovered" bigint,
	CONSTRAINT "demand_lines_sheet_id_member_id_pk" PRIMARY KEY("sheet_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "demand_sheets" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle" text NOT NULL,
	"department_id" text NOT NULL,
	"status" text NOT NULL,
	"total_demand" bigint NOT NULL,
	"total_recovered" bigint NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"status" text NOT NULL,
	"reference" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_no" text NOT NULL,
	"member_id" text NOT NULL,
	"date" date NOT NULL,
	"source" text NOT NULL,
	"amount" bigint NOT NULL,
	"cycle" text,
	"sheet_id" text,
	"sort_at" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_accounts" (
	"member_id" text PRIMARY KEY NOT NULL,
	"number_of_shares" integer NOT NULL,
	"share_capital" bigint NOT NULL,
	"share_deposit_balance" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_sheet_id_demand_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."demand_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_sheets" ADD CONSTRAINT "demand_sheets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reports" ADD CONSTRAINT "payment_reports_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_accounts" ADD CONSTRAINT "share_accounts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demand_lines_member_idx" ON "demand_lines" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demand_sheets_cycle_dept_idx" ON "demand_sheets" USING btree ("cycle","department_id");--> statement-breakpoint
CREATE INDEX "demand_sheets_status_idx" ON "demand_sheets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_reports_member_idx" ON "payment_reports" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "payment_reports_status_idx" ON "payment_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_no_idx" ON "receipts" USING btree ("receipt_no");--> statement-breakpoint
CREATE INDEX "receipts_member_idx" ON "receipts" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "receipts_date_idx" ON "receipts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "receipts_sort_idx" ON "receipts" USING btree ("sort_at");