CREATE TABLE "surety_recoveries" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"surety_id" text NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "surety_recoveries" ADD CONSTRAINT "surety_recoveries_surety_id_members_id_fk" FOREIGN KEY ("surety_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "surety_recoveries_loan_idx" ON "surety_recoveries" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "surety_recoveries_surety_idx" ON "surety_recoveries" USING btree ("surety_id","status");--> statement-breakpoint
-- F-13 (D-097): the threshold joins the settings (a value already saved wins); the Accountant recovers from sureties.
UPDATE "settings_versions"
SET "data" = '{"suretyRecoveryAfterCycles": 3}'::jsonb || "data";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role", "permission") VALUES ('ACCOUNTANT', 'collections.recoverFromSureties') ON CONFLICT DO NOTHING;
