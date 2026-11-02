CREATE TABLE "deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"account_no" text NOT NULL,
	"fdr_no" text,
	"member_id" text NOT NULL,
	"scheme" text NOT NULL,
	"status" text NOT NULL,
	"opened_on" date NOT NULL,
	"maturity_date" date,
	"principal" bigint,
	"balance" bigint NOT NULL,
	"pledged_to_loan_id" text,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_account_no_idx" ON "deposits" USING btree ("account_no");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_fdr_no_idx" ON "deposits" USING btree ("fdr_no");--> statement-breakpoint
CREATE INDEX "deposits_member_idx" ON "deposits" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "deposits_scheme_status_idx" ON "deposits" USING btree ("scheme","status");