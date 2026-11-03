CREATE TABLE "member_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"member_id" text NOT NULL,
	"borrower_id" text NOT NULL,
	"loan_id" text NOT NULL,
	"cycle" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_notices" ADD CONSTRAINT "member_notices_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_notices_once_idx" ON "member_notices" USING btree ("kind","member_id","loan_id","cycle");--> statement-breakpoint
CREATE INDEX "member_notices_member_idx" ON "member_notices" USING btree ("member_id");