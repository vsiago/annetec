-- `activity_kind`/`activity_events` ficam de fora deste arquivo: já existem no
-- banco (aplicados por um `drizzle-kit push` anterior, sem migração
-- registrada) — só o snapshot do drizzle-kit os viu como novos. Migração
-- atual cobre só a mudança desta feature: `tenant_profiles.kind`.
CREATE TYPE "public"."tenant_kind" AS ENUM('operator', 'platform');--> statement-breakpoint
ALTER TABLE "tenant_profiles" ADD COLUMN "kind" "tenant_kind" DEFAULT 'operator' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_profiles_single_platform" ON "tenant_profiles" USING btree ("kind") WHERE "tenant_profiles"."kind" = 'platform';