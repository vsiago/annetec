DROP INDEX "club_charges_sub_period_key";--> statement-breakpoint
ALTER TABLE "club_charges" ADD COLUMN "kind" text DEFAULT 'cycle' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_charges" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "club_charges_sub_idempotency_key" ON "club_charges" USING btree ("subscription_id","idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "club_charges_sub_period_key" ON "club_charges" USING btree ("subscription_id","period_start") WHERE kind = 'cycle';