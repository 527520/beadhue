SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "client_type" text DEFAULT 'web' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_type_check" CHECK ("client_type" IN ('web', 'weapp'));
--> statement-breakpoint
CREATE TABLE "wechat_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "appid" text NOT NULL,
  "openid" text NOT NULL,
  "unionid" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_identity_unique" ON "wechat_bindings" ("appid", "openid");
--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_user_app_unique" ON "wechat_bindings" ("appid", "user_id");
