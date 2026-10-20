ALTER TABLE "participants" DROP CONSTRAINT "participants_name_key_unique";--> statement-breakpoint
ALTER TABLE "participants" DROP COLUMN "first_name";--> statement-breakpoint
ALTER TABLE "participants" DROP COLUMN "last_name";--> statement-breakpoint
ALTER TABLE "participants" DROP COLUMN "name_key";