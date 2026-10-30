CREATE TABLE "membership_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"application_no" text NOT NULL,
	"applicant_id" text NOT NULL,
	"status" text NOT NULL,
	"department_id" text,
	"allotted_general_no" text,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "membership_applications_no_idx" ON "membership_applications" USING btree ("application_no");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_applications_applicant_idx" ON "membership_applications" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "membership_applications_status_idx" ON "membership_applications" USING btree ("status");