CREATE TYPE "public"."contact_platform" AS ENUM('line', 'discord', 'telegram', 'facebook', 'instagram', 'x', 'email', 'phone', 'other');--> statement-breakpoint
CREATE TABLE "contact_links" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "contact_platform" NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_links" ADD CONSTRAINT "contact_links_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_links_enabled_sort_idx" ON "contact_links" USING btree ("enabled","sort_order");