CREATE TABLE "draw_spins" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "draw_spins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"prize_rank" integer NOT NULL,
	"spin_index" integer NOT NULL,
	"number" integer NOT NULL,
	"participant_name" text NOT NULL,
	"is_winner" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draw_spins_prize_spin_unique" UNIQUE("prize_rank","spin_index"),
	CONSTRAINT "draw_spins_prize_rank_range" CHECK ("draw_spins"."prize_rank" between 1 and 3),
	CONSTRAINT "draw_spins_spin_index_range" CHECK ("draw_spins"."spin_index" between 1 and 3),
	CONSTRAINT "draw_spins_number_range" CHECK ("draw_spins"."number" between 1 and 1068)
);
--> statement-breakpoint
ALTER TABLE "draw_spins" ENABLE ROW LEVEL SECURITY;
