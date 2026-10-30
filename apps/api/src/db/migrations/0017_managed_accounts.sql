CREATE TABLE "managed_account_debits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"charge_id" uuid,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"balance" numeric(12, 2),
	"destination_wallet_id" text,
	"external_reference" text NOT NULL,
	"transfer_id" text,
	"transfer_status" text,
	"transfer_requested_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"gateway_settled_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"failure_code" text,
	"failure_reason" text,
	"refund_required" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_account_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"data" jsonb NOT NULL,
	"terms_version" text NOT NULL,
	"terms_text" text NOT NULL,
	"accepted_by_user_id" text NOT NULL,
	"accepted_by_name" text,
	"accepted_at" timestamp with time zone NOT NULL,
	"accepted_ip" text,
	"accepted_user_agent" text,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"refuse_reason" text,
	"asaas_account_id" text,
	"wallet_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_asaas_accounts" ADD COLUMN "wallet_id" text;--> statement-breakpoint
ALTER TABLE "tenant_asaas_accounts" ADD COLUMN "auto_debit_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_asaas_accounts" ADD COLUMN "documents_json" jsonb;--> statement-breakpoint
ALTER TABLE "tenant_asaas_accounts" ADD COLUMN "documents_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_asaas_accounts" ADD COLUMN "managed_request_id" uuid;--> statement-breakpoint
ALTER TABLE "managed_account_debits" ADD CONSTRAINT "managed_account_debits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_account_debits" ADD CONSTRAINT "managed_account_debits_charge_id_platform_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."platform_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_account_requests" ADD CONSTRAINT "managed_account_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "managed_account_debits_charge_running_key" ON "managed_account_debits" USING btree ("charge_id") WHERE status = 'em_andamento';--> statement-breakpoint
CREATE UNIQUE INDEX "managed_account_debits_charge_done_key" ON "managed_account_debits" USING btree ("charge_id") WHERE status = 'concluida';--> statement-breakpoint
CREATE UNIQUE INDEX "managed_account_debits_transfer_key" ON "managed_account_debits" USING btree ("transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_account_debits_reference_key" ON "managed_account_debits" USING btree ("external_reference");--> statement-breakpoint
CREATE INDEX "managed_account_debits_org_created_idx" ON "managed_account_debits" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "managed_account_debits_status_idx" ON "managed_account_debits" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_account_requests_open_key" ON "managed_account_requests" USING btree ("organization_id") WHERE status in ('pendente', 'aprovando', 'falhou');--> statement-breakpoint
CREATE INDEX "managed_account_requests_org_created_idx" ON "managed_account_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "managed_account_requests_status_idx" ON "managed_account_requests" USING btree ("status");