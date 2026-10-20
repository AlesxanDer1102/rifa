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

/** Closed roster of eligible SINATPSI members. The DNI is never stored, only its keyed hash. */
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  office: text("office").notNull(),
  unit: text("unit").notNull(),
  /** HMAC-SHA256(DNI_PEPPER, dni), hex. */
  dniHash: text("dni_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per member who claimed numbers; the UNIQUE member_id enforces "at most once". */
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("participants_member_id_unique").on(t.memberId)],
);

/** Failed/in-flight DNI verification attempts, used for brute-force limits (serverless-safe). */
export const dniAttempts = pgTable(
  "dni_attempts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** HMAC of the client IP, so raw addresses are never stored. */
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dni_attempts_member_idx").on(t.memberId, t.createdAt),
    index("dni_attempts_ip_idx").on(t.ipHash, t.createdAt),
  ],
);

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

export const schema = { members, participants, tickets, drawSpins, dniAttempts };
