ALTER TABLE "tenant_asaas_accounts" ADD COLUMN IF NOT EXISTS "status_events_synced_at" timestamp with time zone;
