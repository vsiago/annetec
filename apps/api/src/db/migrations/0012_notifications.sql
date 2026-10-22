CREATE TABLE "notification_reads" (
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"audience" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"amount" numeric(12, 2),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_audience_check" CHECK ("notifications"."audience" in ('tenant', 'platform'))
);
--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_reads_user_idx" ON "notification_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_audience_org_created_idx" ON "notifications" USING btree ("audience","organization_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_audience_created_idx" ON "notifications" USING btree ("audience","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_audience_dedupe_key" ON "notifications" USING btree ("audience","dedupe_key");