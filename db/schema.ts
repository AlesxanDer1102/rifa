import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable(
  "tickets",
  {
    number: integer("number").primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("tickets_number_range", sql`${t.number} between 1 and 1068`),
    index("tickets_participant_id_idx").on(t.participantId),
  ],
);

/** One row per manual spin of the raffle draw (3 spins per prize; the 3rd is the winner). */
export const drawSpins = pgTable(
  "draw_spins",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    prizeRank: integer("prize_rank").notNull(),
    spinIndex: integer("spin_index").notNull(),
    number: integer("number").notNull(),
    participantName: text("participant_name").notNull(),
    isWinner: boolean("is_winner").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("draw_spins_prize_spin_unique").on(t.prizeRank, t.spinIndex),
    check("draw_spins_prize_rank_range", sql`${t.prizeRank} between 1 and 3`),
    check("draw_spins_spin_index_range", sql`${t.spinIndex} between 1 and 3`),
    check("draw_spins_number_range", sql`${t.number} between 1 and 1068`),
  ],
);

export const schema = { participants, tickets, drawSpins };
