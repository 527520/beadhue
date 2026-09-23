SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '60s';--> statement-breakpoint
CREATE TABLE "slow_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text,
	"actor_user_id" uuid,
	"route" text,
	"method" text,
	"statement" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"row_count" integer,
	"chain" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"event" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"ip_masked" text,
	"request_id" text,
	"method" text,
	"path" text,
	"route" text,
	"status" integer,
	"duration_ms" integer,
	"error_code" text,
	"message" text,
	"stack" text,
	"context" jsonb
);
--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slow_queries_created_idx" ON "slow_queries" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "slow_queries_duration_idx" ON "slow_queries" USING btree ("duration_ms" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "slow_queries_route_created_idx" ON "slow_queries" USING btree ("route","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_logs_created_idx" ON "system_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_logs_level_created_idx" ON "system_logs" USING btree ("level","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_logs_event_created_idx" ON "system_logs" USING btree ("event","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_logs_actor_created_idx" ON "system_logs" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_logs_request_idx" ON "system_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "community_tags_merged_into_idx" ON "community_tags" USING btree ("merged_into_tag_id");
