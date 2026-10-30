CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"ddo_name" text NOT NULL,
	"ddo_designation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_product_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"name" text NOT NULL,
	"rate_percent" numeric(7, 3) NOT NULL,
	"min_amount" bigint NOT NULL,
	"max_amount" bigint NOT NULL,
	"max_instalments" integer NOT NULL,
	"max_concurrent" integer NOT NULL,
	"deposit_margin_percent" numeric(7, 3) NOT NULL,
	"penal_rate_percent" numeric(7, 3) NOT NULL,
	"sureties_required" integer NOT NULL,
	"ddo_certification_required" boolean NOT NULL,
	"share_deposit_percent" numeric(7, 3) NOT NULL,
	"topup_allowed" boolean NOT NULL,
	"emi_method" text NOT NULL,
	"placeholder" boolean NOT NULL,
	"summary" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"channels" jsonb NOT NULL,
	"audience" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "society_profile" (
	"id" text PRIMARY KEY DEFAULT 'profile' NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"registration_no" text NOT NULL,
	"address" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_uq" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_product_versions_code_version_uq" ON "loan_product_versions" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_product_versions_one_active_uq" ON "loan_product_versions" USING btree ("code") WHERE "loan_product_versions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "settings_versions_version_uq" ON "settings_versions" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_versions_one_active_uq" ON "settings_versions" USING btree ("status") WHERE "settings_versions"."status" = 'ACTIVE';