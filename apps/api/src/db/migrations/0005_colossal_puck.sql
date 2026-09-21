ALTER TABLE "partners" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "specialties" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "since" date;