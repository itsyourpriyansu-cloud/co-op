-- D-147: one demand sheet for all departments (DDO setup "One DDO for all departments"). The sheet keeps
-- department_id = 'ALL', so the foreign key goes; each of its lines records the member's department.
ALTER TABLE "demand_sheets" DROP CONSTRAINT "demand_sheets_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "demand_lines" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;