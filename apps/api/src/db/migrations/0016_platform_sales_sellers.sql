CREATE TABLE "platform_discount_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"prospect_id" uuid,
	"seller_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"setup_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"monthly_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"monthly_months" integer,
	"justification" text NOT NULL,
	"approved_setup_fee_percent" numeric(5, 2),
	"approved_monthly_percent" numeric(5, 2),
	"approved_monthly_months" integer,
	"decision_note" text,
	"rejection_reason" text,
	"decided_by_user_id" text,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_prospect_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_user_id" text,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" text NOT NULL,
	"name" text NOT NULL,
	"cnpj" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"city" text,
	"state" text,
	"estimated_lives" integer,
	"interest_plan_id" text,
	"estimated_value" numeric(12, 2),
	"origin" text DEFAULT 'prospeccao_ativa' NOT NULL,
	"stage" text DEFAULT 'novo' NOT NULL,
	"lost_reason" text,
	"next_action" text,
	"next_action_at" date,
	"proposal_id" uuid,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_sales_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" text NOT NULL,
	"proposal_id" uuid,
	"organization_id" text,
	"charge_id" uuid NOT NULL,
	"charge_kind" text NOT NULL,
	"kind" text NOT NULL,
	"installment" integer,
	"base_amount" numeric(12, 2) NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'a_pagar' NOT NULL,
	"reference_month" text NOT NULL,
	"charge_paid_at" timestamp with time zone,
	"payout_date" date,
	"payout_note" text,
	"paid_out_by_user_id" text,
	"paid_out_by_name" text,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_sales_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"monthly_schedule" jsonb DEFAULT '[50,20,10]'::jsonb NOT NULL,
	"setup_fee_percent" numeric(5, 2) DEFAULT '50' NOT NULL,
	"updated_by_user_id" text,
	"updated_by_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_sellers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"referral_code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"monthly_goal" integer,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_audience_check";--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD COLUMN "seller_user_id" text;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD COLUMN "discount" jsonb;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD COLUMN "invite_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "monthly_discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD COLUMN "monthly_discount_until" date;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "recipient_user_id" text;--> statement-breakpoint
ALTER TABLE "platform_discount_requests" ADD CONSTRAINT "platform_discount_requests_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_discount_requests" ADD CONSTRAINT "platform_discount_requests_prospect_id_platform_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."platform_prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_prospect_interactions" ADD CONSTRAINT "platform_prospect_interactions_prospect_id_platform_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."platform_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_prospects" ADD CONSTRAINT "platform_prospects_interest_plan_id_tenant_plans_id_fk" FOREIGN KEY ("interest_plan_id") REFERENCES "public"."tenant_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_prospects" ADD CONSTRAINT "platform_prospects_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_sales_commissions" ADD CONSTRAINT "platform_sales_commissions_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_sellers" ADD CONSTRAINT "platform_sellers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_discount_requests_status_idx" ON "platform_discount_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "platform_discount_requests_proposal_idx" ON "platform_discount_requests" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_discount_requests_pending_key" ON "platform_discount_requests" USING btree ("proposal_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "platform_prospect_interactions_prospect_idx" ON "platform_prospect_interactions" USING btree ("prospect_id","occurred_at");--> statement-breakpoint
CREATE INDEX "platform_prospects_seller_stage_idx" ON "platform_prospects" USING btree ("seller_user_id","stage");--> statement-breakpoint
CREATE INDEX "platform_prospects_proposal_idx" ON "platform_prospects" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "platform_prospects_next_action_idx" ON "platform_prospects" USING btree ("seller_user_id","next_action_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_sales_commissions_charge_kind_key" ON "platform_sales_commissions" USING btree ("charge_id","kind");--> statement-breakpoint
CREATE INDEX "platform_sales_commissions_seller_month_idx" ON "platform_sales_commissions" USING btree ("seller_user_id","reference_month");--> statement-breakpoint
CREATE INDEX "platform_sales_commissions_status_idx" ON "platform_sales_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_sales_commissions_proposal_idx" ON "platform_sales_commissions" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_sellers_referral_code_key" ON "platform_sellers" USING btree ("referral_code");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_onboarding_seller_idx" ON "platform_onboarding_proposals" USING btree ("seller_user_id","status");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audience_check" CHECK ("notifications"."audience" in ('tenant', 'platform', 'seller'));