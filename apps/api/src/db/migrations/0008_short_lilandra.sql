CREATE TYPE "public"."platform_onboarding_status" AS ENUM('draft', 'submitted', 'in_review', 'pending_info', 'approved', 'awaiting_payment', 'provisioning', 'active', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."platform_subscription_status" AS ENUM('active', 'past_due', 'restricted', 'suspended', 'canceled');--> statement-breakpoint
CREATE TABLE "platform_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"organization_id" text,
	"proposal_id" uuid,
	"related_type" text,
	"related_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver" text NOT NULL,
	"bucket" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"purpose" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"organization_id" text,
	"uploaded_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_onboarding_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"person_id" uuid,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"review_note" text,
	"reviewed_by_user_id" text,
	"reviewed_by_name" text,
	"reviewed_at" timestamp with time zone,
	"replaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"type" text NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"actor_user_id" text,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_onboarding_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"birth_date" date,
	"email" text,
	"phone" text,
	"position" text NOT NULL,
	"position_other" text,
	"is_legal_representative" boolean DEFAULT false NOT NULL,
	"is_partner" boolean DEFAULT false NOT NULL,
	"is_beneficial_owner" boolean DEFAULT false NOT NULL,
	"ownership_percent" numeric(5, 2),
	"acts_by_power_of_attorney" boolean DEFAULT false NOT NULL,
	"is_pep" boolean DEFAULT false NOT NULL,
	"pep_role" text,
	"pep_relationship" text,
	"qsa_match" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_onboarding_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" "platform_onboarding_status" DEFAULT 'draft' NOT NULL,
	"contractor_type" text NOT NULL,
	"legal_form" text NOT NULL,
	"cnpj" text NOT NULL,
	"legal_name" text,
	"trade_name" text,
	"plan_id" text,
	"expected_lives" integer DEFAULT 0 NOT NULL,
	"payment_method" "club_payment_method",
	"applicant" jsonb NOT NULL,
	"company" jsonb,
	"receita_snapshot" jsonb,
	"receita_checked_at" timestamp with time zone,
	"brand" jsonb,
	"slug" text,
	"contract_acceptance" jsonb,
	"accepted_at" timestamp with time zone,
	"prechecks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"precheck_summary" text,
	"precheck_ran_at" timestamp with time zone,
	"has_pep" boolean DEFAULT false NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pending_request" jsonb,
	"assigned_to_user_id" text,
	"assigned_to_name" text,
	"assigned_at" timestamp with time zone,
	"decision_note" text,
	"override_reason" text,
	"rejection_reason" text,
	"decided_by_user_id" text,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"organization_id" text,
	"provisioned_at" timestamp with time zone,
	"provisioning_attempts" integer DEFAULT 0 NOT NULL,
	"provisioning_error" text,
	"activation_waived" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"first_submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'site' NOT NULL,
	"applicant_ip" text,
	"applicant_user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"gateway" "payment_gateway_provider",
	"enabled_methods" jsonb DEFAULT '["pix","boleto","credit_card"]'::jsonb NOT NULL,
	"generate_days_before" integer DEFAULT 10 NOT NULL,
	"reminder_days_before" integer DEFAULT 3 NOT NULL,
	"restrict_after_days" integer DEFAULT 10 NOT NULL,
	"suspend_after_days" integer DEFAULT 30 NOT NULL,
	"cancel_after_days" integer DEFAULT 90 NOT NULL,
	"boleto_due_days" integer DEFAULT 5 NOT NULL,
	"fine_percent" numeric(5, 2) DEFAULT '2' NOT NULL,
	"interest_monthly_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
	"max_card_retries" integer DEFAULT 3 NOT NULL,
	"card_retry_interval_hours" integer DEFAULT 24 NOT NULL,
	"activation_expiry_days" integer DEFAULT 15 NOT NULL,
	"draft_expiry_days" integer DEFAULT 30 NOT NULL,
	"last_automation_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"subscription_id" uuid,
	"charge_id" uuid,
	"proposal_id" uuid,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"gateway_provider" "payment_gateway_provider",
	"external_event_id" text,
	"message" text NOT NULL,
	"payload" jsonb,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"subscription_id" uuid,
	"proposal_id" uuid,
	"kind" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lives_count" integer,
	"method" "club_payment_method" NOT NULL,
	"status" "club_charge_status" DEFAULT 'pending' NOT NULL,
	"description" text NOT NULL,
	"gateway_provider" "payment_gateway_provider" NOT NULL,
	"gateway_charge_id" text,
	"invoice_url" text,
	"pix_payload" text,
	"pix_qr_code" text,
	"pix_expires_at" timestamp with time zone,
	"boleto_identification_field" text,
	"boleto_bar_code" text,
	"boleto_url" text,
	"card_brand" text,
	"card_last4" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"failure_reason" text,
	"reminder_sent_at" timestamp with time zone,
	"overdue_notified_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_amount" numeric(12, 2),
	"canceled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"proposal_id" uuid,
	"plan_id" text,
	"plan_name" text NOT NULL,
	"plan_price_monthly" numeric(12, 2) NOT NULL,
	"member_limit" integer NOT NULL,
	"price_per_extra_life" numeric(12, 2) DEFAULT '0' NOT NULL,
	"setup_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"revenue_share_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" "platform_subscription_status" DEFAULT 'active' NOT NULL,
	"access_override" text,
	"access_override_reason" text,
	"access_override_until" timestamp with time zone,
	"access_override_by_user_id" text,
	"access_override_at" timestamp with time zone,
	"payment_method" "club_payment_method" NOT NULL,
	"due_day" integer NOT NULL,
	"started_at" timestamp with time zone,
	"current_period_start" date,
	"current_period_end" date,
	"next_due_date" date,
	"gateway_provider" "payment_gateway_provider" NOT NULL,
	"gateway_customer_id" text,
	"card_token" text,
	"card_brand" text,
	"card_last4" text,
	"card_expiry" text,
	"billing_name" text NOT NULL,
	"billing_document" text NOT NULL,
	"billing_email" text NOT NULL,
	"scheduled_plan_id" text,
	"pending_adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"past_due_at" timestamp with time zone,
	"restricted_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"reactivated_at" timestamp with time zone,
	"source" text DEFAULT 'onboarding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_plan_prices" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"setup_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"price_per_extra_life" numeric(12, 2) DEFAULT '0' NOT NULL,
	"revenue_share_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"public_visible" boolean DEFAULT true NOT NULL,
	"highlight" boolean DEFAULT false NOT NULL,
	"sort_order" integer,
	"tagline" text,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_email_outbox" ADD CONSTRAINT "platform_email_outbox_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_files" ADD CONSTRAINT "platform_files_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_documents" ADD CONSTRAINT "platform_onboarding_documents_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_documents" ADD CONSTRAINT "platform_onboarding_documents_person_id_platform_onboarding_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."platform_onboarding_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_documents" ADD CONSTRAINT "platform_onboarding_documents_file_id_platform_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."platform_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_events" ADD CONSTRAINT "platform_onboarding_events_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_people" ADD CONSTRAINT "platform_onboarding_people_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD CONSTRAINT "platform_onboarding_proposals_plan_id_tenant_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tenant_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD CONSTRAINT "platform_onboarding_proposals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_billing_events" ADD CONSTRAINT "platform_billing_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_billing_events" ADD CONSTRAINT "platform_billing_events_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_billing_events" ADD CONSTRAINT "platform_billing_events_charge_id_platform_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."platform_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_billing_events" ADD CONSTRAINT "platform_billing_events_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_subscription_id_platform_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_proposal_id_platform_onboarding_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."platform_onboarding_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_plan_id_tenant_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tenant_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_scheduled_plan_id_tenant_plans_id_fk" FOREIGN KEY ("scheduled_plan_id") REFERENCES "public"."tenant_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_plan_prices" ADD CONSTRAINT "tenant_plan_prices_plan_id_tenant_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tenant_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_email_outbox_created_idx" ON "platform_email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_email_outbox_proposal_idx" ON "platform_email_outbox" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "platform_email_outbox_org_idx" ON "platform_email_outbox" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_files_owner_idx" ON "platform_files" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "platform_files_org_idx" ON "platform_files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "platform_onboarding_documents_proposal_idx" ON "platform_onboarding_documents" USING btree ("proposal_id","kind");--> statement-breakpoint
CREATE INDEX "platform_onboarding_events_proposal_idx" ON "platform_onboarding_events" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_onboarding_people_proposal_idx" ON "platform_onboarding_people" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_onboarding_people_proposal_cpf_key" ON "platform_onboarding_people" USING btree ("proposal_id","cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_onboarding_code_key" ON "platform_onboarding_proposals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "platform_onboarding_status_idx" ON "platform_onboarding_proposals" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "platform_onboarding_cnpj_idx" ON "platform_onboarding_proposals" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "platform_onboarding_org_idx" ON "platform_onboarding_proposals" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_onboarding_open_cnpj_key" ON "platform_onboarding_proposals" USING btree ("cnpj") WHERE status not in ('active', 'rejected', 'canceled');--> statement-breakpoint
CREATE UNIQUE INDEX "platform_onboarding_open_slug_key" ON "platform_onboarding_proposals" USING btree ("slug") WHERE slug is not null and status not in ('active', 'rejected', 'canceled');--> statement-breakpoint
CREATE UNIQUE INDEX "platform_billing_events_gateway_event_key" ON "platform_billing_events" USING btree ("gateway_provider","external_event_id");--> statement-breakpoint
CREATE INDEX "platform_billing_events_org_created_idx" ON "platform_billing_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_billing_events_sub_created_idx" ON "platform_billing_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_billing_events_charge_idx" ON "platform_billing_events" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_charges_sub_period_key" ON "platform_charges" USING btree ("subscription_id","period_start") WHERE kind = 'monthly';--> statement-breakpoint
CREATE UNIQUE INDEX "platform_charges_gateway_key" ON "platform_charges" USING btree ("gateway_provider","gateway_charge_id");--> statement-breakpoint
CREATE INDEX "platform_charges_org_status_due_idx" ON "platform_charges" USING btree ("organization_id","status","due_date");--> statement-breakpoint
CREATE INDEX "platform_charges_status_due_idx" ON "platform_charges" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "platform_charges_proposal_idx" ON "platform_charges" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "platform_charges_paid_idx" ON "platform_charges" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_org_key" ON "platform_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "platform_subscriptions_status_idx" ON "platform_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_subscriptions_next_due_idx" ON "platform_subscriptions" USING btree ("next_due_date");