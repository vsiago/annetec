CREATE TYPE "public"."appointment_channel" AS ENUM('telefone', 'whatsapp', 'email', 'app', 'presencial');--> statement-breakpoint
CREATE TYPE "public"."appointment_message_kind" AS ENUM('entrada', 'saida', 'nota');--> statement-breakpoint
CREATE TYPE "public"."appointment_priority" AS ENUM('alta', 'normal', 'baixa');--> statement-breakpoint
ALTER TYPE "public"."appointment_status" ADD VALUE 'aguardando_usuario' BEFORE 'concluido';--> statement-breakpoint
ALTER TYPE "public"."appointment_status" ADD VALUE 'aguardando_terceiro' BEFORE 'concluido';--> statement-breakpoint
ALTER TYPE "public"."appointment_status" ADD VALUE 'resolvido' BEFORE 'concluido';--> statement-breakpoint
ALTER TYPE "public"."appointment_status" ADD VALUE 'encerrado' BEFORE 'concluido';--> statement-breakpoint
CREATE TABLE "appointment_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"kind" "appointment_message_kind" DEFAULT 'saida' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"author_user_id" text,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "subject" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "channel" "appointment_channel" DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "priority" "appointment_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "assigned_user_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "last_interaction_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment_messages" ADD CONSTRAINT "appointment_messages_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_messages" ADD CONSTRAINT "appointment_messages_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_messages_appointment_idx" ON "appointment_messages" USING btree ("appointment_id","created_at");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_org_last_idx" ON "appointments" USING btree ("organization_id","last_interaction_at");