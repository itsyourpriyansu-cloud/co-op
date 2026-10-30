CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"application_no" text NOT NULL,
	"loan_no" text,
	"member_id" text NOT NULL,
	"product" text NOT NULL,
	"status" text NOT NULL,
	"parent_loan_id" text,
	"channel" text,
	"applied_on" date NOT NULL,
	"applied_amount" bigint NOT NULL,
	"applied_instalments" integer NOT NULL,
	"sanctioned_amount" bigint,
	"emi" bigint,
	"outstanding_principal" bigint NOT NULL,
	"sanction_letter_no" text,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loans_application_no_idx" ON "loans" USING btree ("application_no");--> statement-breakpoint
CREATE UNIQUE INDEX "loans_loan_no_idx" ON "loans" USING btree ("loan_no");--> statement-breakpoint
CREATE INDEX "loans_member_idx" ON "loans" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loans_status_idx" ON "loans" USING btree ("status");