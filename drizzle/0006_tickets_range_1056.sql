ALTER TABLE "draw_spins" DROP CONSTRAINT "draw_spins_number_range";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_number_range";--> statement-breakpoint
ALTER TABLE "draw_spins" ADD CONSTRAINT "draw_spins_number_range" CHECK ("draw_spins"."number" between 1 and 1056);--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_number_range" CHECK ("tickets"."number" between 1 and 1056);