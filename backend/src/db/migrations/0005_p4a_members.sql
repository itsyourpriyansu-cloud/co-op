CREATE TABLE "member_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"from_department_id" text NOT NULL,
	"to_department_id" text NOT NULL,
	"effective_cycle" text NOT NULL,
	"effective_date" date,
	"order_ref" text NOT NULL,
	"remarks" text,
	"recorded_at" timestamp with time zone,
	"recorded_by_name" text
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"general_no" text NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"father_name" text NOT NULL,
	"gender" text NOT NULL,
	"dob" date NOT NULL,
	"mobile" text NOT NULL,
	"email" text,
	"present_address" jsonb NOT NULL,
	"permanent_address" jsonb NOT NULL,
	"designation" text NOT NULL,
	"department_id" text NOT NULL,
	"doj" date NOT NULL,
	"dor" date NOT NULL,
	"employment_type" text NOT NULL,
	"number_of_shares" integer NOT NULL,
	"nominee" jsonb NOT NULL,
	"pay_profile" jsonb NOT NULL,
	"anniversary_date" date,
	"status" text NOT NULL,
	"portal_activated" boolean DEFAULT false NOT NULL,
	"joined_society_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"department_id" text NOT NULL,
	"status" text NOT NULL,
	"signed_on" date NOT NULL,
	"agreed_on" date,
	"agreed_by_name" text
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"type" text NOT NULL,
	"date" date NOT NULL,
	"summary" text NOT NULL,
	"effective_cycle" text,
	"by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_transfers" ADD CONSTRAINT "member_transfers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_mandates" ADD CONSTRAINT "recovery_mandates_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_mandates" ADD CONSTRAINT "recovery_mandates_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_transfers_member_idx" ON "member_transfers" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_general_no_uq" ON "members" USING btree ("general_no");--> statement-breakpoint
CREATE UNIQUE INDEX "members_employee_id_uq" ON "members" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "members_department_idx" ON "members" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "members_name_idx" ON "members" USING btree ("name");--> statement-breakpoint
CREATE INDEX "recovery_mandates_member_idx" ON "recovery_mandates" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "recovery_mandates_department_idx" ON "recovery_mandates" USING btree ("department_id","status");--> statement-breakpoint
CREATE INDEX "service_events_member_idx" ON "service_events" USING btree ("member_id","date");