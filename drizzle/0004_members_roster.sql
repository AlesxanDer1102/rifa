CREATE TABLE "dni_attempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dni_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" uuid NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"office" text NOT NULL,
	"unit" text NOT NULL,
	"dni_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_dni_hash_unique" UNIQUE("dni_hash")
);
--> statement-breakpoint
-- NOTE: fails if `participants` still has rows (legacy name-based registrations); release them first.
ALTER TABLE "participants" ADD COLUMN "member_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "dni_attempts" ADD CONSTRAINT "dni_attempts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dni_attempts_member_idx" ON "dni_attempts" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "dni_attempts_ip_idx" ON "dni_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_member_id_unique" UNIQUE("member_id");