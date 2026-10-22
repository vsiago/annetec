-- Vínculo com o clube ganha estado explícito (active | removed | blocked).
-- Ordem manual (o drizzle-kit gerou o DROP de "active" antes do backfill):
-- 1) cria access_status; 2) preenche a partir de "active" (true → active,
-- false → removed); 3) troca "active" pela coluna gerada a partir dele.
ALTER TABLE "member" ADD COLUMN "access_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "member" SET "access_status" = CASE WHEN "active" THEN 'active' ELSE 'removed' END;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "access_changed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "member" SET "access_changed_at" = now() WHERE "access_status" <> 'active';--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "onboarding_round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "onboarding_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_access_status_check" CHECK ("member"."access_status" in ('active', 'removed', 'blocked'));--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "active" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "active" boolean GENERATED ALWAYS AS (access_status = 'active') STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "club_onboarding_emails" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
DROP INDEX "club_onboarding_emails_org_user_step_key";--> statement-breakpoint
CREATE UNIQUE INDEX "club_onboarding_emails_org_user_round_step_key" ON "club_onboarding_emails" USING btree ("organization_id","user_id","round","step");
