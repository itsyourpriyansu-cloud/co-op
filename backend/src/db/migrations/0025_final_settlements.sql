CREATE TABLE "final_settlements" (
	"member_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "final_settlements" ADD CONSTRAINT "final_settlements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;