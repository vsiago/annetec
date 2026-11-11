DO $$ BEGIN
  CREATE TYPE "public"."activity_kind" AS ENUM('page_view', 'action');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"visitor_id" text,
	"actor_user_id" text,
	"actor_name" text,
	"actor_scope" text,
	"actor_role" text,
	"tenant_id" text,
	"tenant_slug" text,
	"path" text NOT NULL,
	"action" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
