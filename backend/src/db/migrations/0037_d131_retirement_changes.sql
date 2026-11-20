CREATE TABLE "retirement_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"current_dor" date NOT NULL,
	"new_dor" date NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"proposed" jsonb NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retirement_changes" ADD CONSTRAINT "retirement_changes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retirement_changes_member_idx" ON "retirement_changes" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "retirement_changes_status_idx" ON "retirement_changes" USING btree ("status");--> statement-breakpoint
-- D-131 [S]: probation period, 6 months by default (a value already saved wins).
UPDATE "settings_versions" SET "data" = '{"probationMonths": 6}'::jsonb || "data";
