CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"purpose" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"sealed" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id","purpose","created_at");