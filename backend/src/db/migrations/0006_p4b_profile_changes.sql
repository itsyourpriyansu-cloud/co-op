CREATE TABLE "profile_change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"fields" jsonb NOT NULL,
	"reason" text NOT NULL,
	"document_name" text,
	"route" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"ddo_certified" jsonb,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"remarks" text
);
--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_change_requests_member_idx" ON "profile_change_requests" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "profile_change_requests_status_idx" ON "profile_change_requests" USING btree ("status");