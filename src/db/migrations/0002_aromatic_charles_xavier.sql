CREATE TYPE "public"."promo_type" AS ENUM('percent', 'amount');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'refunded';--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "promo_type" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"min_total" numeric(12, 2),
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"notify_email" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notified_at" timestamp,
	CONSTRAINT "wishlists_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_codes_active_idx" ON "promo_codes" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX "wishlists_product_idx" ON "wishlists" USING btree ("product_id");