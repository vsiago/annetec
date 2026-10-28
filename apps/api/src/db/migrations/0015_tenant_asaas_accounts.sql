CREATE TABLE "tenant_asaas_accounts" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'api_key' NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"env" text NOT NULL,
	"key_hint" text NOT NULL,
	"asaas_account_id" text,
	"account_name" text,
	"account_cpf_cnpj" text,
	"account_email" text,
	"account_status_json" jsonb,
	"webhook_id" text,
	"webhook_token_encrypted" text,
	"webhook_status" text DEFAULT 'pendente' NOT NULL,
	"webhook_last_error" text,
	"connected_by" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_asaas_accounts" ADD CONSTRAINT "tenant_asaas_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;