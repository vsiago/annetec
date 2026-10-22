ALTER TABLE "club_plans" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "badge" text;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "sort_order" integer;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "included_dependents" integer;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "enrollment_fee" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "enrollment_fee_waived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "holder_min_age" integer;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "holder_max_age" integer;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "dependent_rules" jsonb;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "coverages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "payment_methods" jsonb;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "loyalty_months" integer;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "cancellation_policy" text;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "adjustment_policy" text;--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "terms" text;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD COLUMN "included_dependents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD COLUMN "enrollment_fee" numeric(12, 2) DEFAULT '0' NOT NULL;