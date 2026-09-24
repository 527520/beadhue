SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '60s';--> statement-breakpoint
ALTER TABLE "official_batches" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_label" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_color" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_palette" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;