CREATE TABLE "original_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"cos_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "original_assets" ADD CONSTRAINT "original_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "original_assets_owner_digest" ON "original_assets" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE INDEX "original_assets_key" ON "original_assets" USING btree ("cos_key");