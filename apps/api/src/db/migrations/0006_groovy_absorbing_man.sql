CREATE TYPE "public"."club_charge_status" AS ENUM('pending', 'paid', 'overdue', 'failed', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."club_payment_method" AS ENUM('pix', 'boleto', 'credit_card');--> statement-breakpoint
CREATE TYPE "public"."club_subscription_status" AS ENUM('pending_payment', 'active', 'past_due', 'suspended', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."dependent_relationship" AS ENUM('conjuge', 'filho', 'enteado', 'pai_mae', 'irmao', 'neto', 'outro');--> statement-breakpoint
CREATE TYPE "public"."payment_event_source" AS ENUM('webhook', 'automation', 'checkout', 'manual', 'simulation');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway_provider" AS ENUM('simulated', 'asaas');--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"gateway" "payment_gateway_provider",
	"enabled_methods" jsonb DEFAULT '["pix","boleto","credit_card"]'::jsonb NOT NULL,
	"generate_days_before" integer DEFAULT 10 NOT NULL,
	"reminder_days_before" integer DEFAULT 3 NOT NULL,
	"max_card_retries" integer DEFAULT 3 NOT NULL,
	"card_retry_interval_hours" integer DEFAULT 24 NOT NULL,
	"suspend_after_days" integer DEFAULT 15 NOT NULL,
	"cancel_after_days" integer DEFAULT 60 NOT NULL,
	"boleto_due_days" integer DEFAULT 3 NOT NULL,
	"fine_percent" numeric(5, 2) DEFAULT '2' NOT NULL,
	"interest_monthly_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
	"last_automation_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
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
	"last_synced_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_amount" numeric(12, 2),
	"canceled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_subscription_dependents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"cpf" text,
	"birth_date" date,
	"relationship" "dependent_relationship" NOT NULL,
	"position" integer NOT NULL,
	"card_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"club_plan_id" uuid,
	"user_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"plan_price_monthly" numeric(12, 2) NOT NULL,
	"dependent_price_monthly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" "club_payment_method" NOT NULL,
	"status" "club_subscription_status" DEFAULT 'pending_payment' NOT NULL,
	"due_day" integer NOT NULL,
	"holder_name" text NOT NULL,
	"holder_cpf" text NOT NULL,
	"holder_email" text NOT NULL,
	"holder_phone" text,
	"holder_birth_date" date,
	"card_number" text,
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
	"suspended_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"source" text DEFAULT 'checkout' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" uuid,
	"charge_id" uuid,
	"type" text NOT NULL,
	"source" "payment_event_source" NOT NULL,
	"gateway_provider" "payment_gateway_provider",
	"external_event_id" text,
	"message" text NOT NULL,
	"payload" jsonb,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "price_dependent_monthly" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "max_dependents" integer;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_charges" ADD CONSTRAINT "club_charges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_charges" ADD CONSTRAINT "club_charges_subscription_id_club_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."club_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_subscription_dependents" ADD CONSTRAINT "club_subscription_dependents_subscription_id_club_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."club_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_subscription_dependents" ADD CONSTRAINT "club_subscription_dependents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_club_plan_id_club_plans_id_fk" FOREIGN KEY ("club_plan_id") REFERENCES "public"."club_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_subscription_id_club_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."club_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_charge_id_club_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."club_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_charges_sub_period_key" ON "club_charges" USING btree ("subscription_id","period_start");--> statement-breakpoint
CREATE INDEX "club_charges_org_status_due_idx" ON "club_charges" USING btree ("organization_id","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "club_charges_gateway_key" ON "club_charges" USING btree ("gateway_provider","gateway_charge_id");--> statement-breakpoint
CREATE INDEX "club_charges_org_paid_idx" ON "club_charges" USING btree ("organization_id","paid_at");--> statement-breakpoint
CREATE INDEX "club_subscription_dependents_sub_idx" ON "club_subscription_dependents" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "club_subscription_dependents_org_card_key" ON "club_subscription_dependents" USING btree ("organization_id","card_number");--> statement-breakpoint
CREATE INDEX "club_subscriptions_org_status_idx" ON "club_subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "club_subscriptions_org_user_idx" ON "club_subscriptions" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "club_subscriptions_org_next_due_idx" ON "club_subscriptions" USING btree ("organization_id","next_due_date");--> statement-breakpoint
CREATE INDEX "club_subscriptions_org_cpf_idx" ON "club_subscriptions" USING btree ("organization_id","holder_cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "club_subscriptions_org_card_key" ON "club_subscriptions" USING btree ("organization_id","card_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_gateway_event_key" ON "payment_events" USING btree ("gateway_provider","external_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_org_created_idx" ON "payment_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_sub_created_idx" ON "payment_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_charge_idx" ON "payment_events" USING btree ("charge_id");