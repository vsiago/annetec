CREATE TABLE "club_onboarding_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"access_status" text,
	"email_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_onboarding_emails" ADD CONSTRAINT "club_onboarding_emails_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_onboarding_emails" ADD CONSTRAINT "club_onboarding_emails_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_onboarding_emails_org_user_step_key" ON "club_onboarding_emails" USING btree ("organization_id","user_id","step");--> statement-breakpoint
CREATE INDEX "club_onboarding_emails_org_created_idx" ON "club_onboarding_emails" USING btree ("organization_id","created_at");