CREATE TABLE "club_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_monthly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" text,
	"highlight" boolean DEFAULT false NOT NULL,
	"upstream_plan_codigo" text,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_plans" ADD CONSTRAINT "club_plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_plans_org_idx" ON "club_plans" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "club_plans_org_name_key" ON "club_plans" USING btree ("organization_id","name");