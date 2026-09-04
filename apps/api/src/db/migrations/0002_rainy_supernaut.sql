ALTER TABLE "tenant_integrations" ADD COLUMN "default_produto_codigo" text;--> statement-breakpoint
ALTER TABLE "tenant_integrations" ADD COLUMN "default_grupo_produtor_codigo" text;--> statement-breakpoint
ALTER TABLE "tenant_integrations" ADD COLUMN "capabilities" jsonb;--> statement-breakpoint
ALTER TABLE "tenant_integrations" ADD COLUMN "capabilities_checked_at" timestamp with time zone;