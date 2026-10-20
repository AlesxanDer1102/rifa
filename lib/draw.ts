import { randomInt as cryptoRandomInt } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { drawSpins, members, participants, tickets } from "@/db/schema";
import { findPgError } from "./claim";

export type PrizeRank = 1 | 2 | 3;
export type SpinIndex = 1 | 2 | 3;

/** Prizes are drawn from the last place to the first. */
export const DRAW_ORDER: readonly PrizeRank[] = [3, 2, 1];
export const SPINS_PER_PRIZE = 3;

export interface DrawSpin {
  id: number;
  prizeRank: PrizeRank;
  spinIndex: SpinIndex;
  number: number;
  participantName: string;
  isWinner: boolean;
  createdAt: Date;
}

export interface DrawState {
  spins: DrawSpin[];
  /** Prize currently being drawn (3 -> 2 -> 1), or null when the draw is finished. */
  currentPrize: PrizeRank | null;
  /** Spin number (1..3) that comes next in the current round, or null when finished. */
  nextSpinIndex: SpinIndex | null;
  /** Sold numbers that can be drawn in the next spin. */
  eligibleCount: number;
}

export type SpinResult =
  | {
      ok: true;
      spin: DrawSpin;
      /** Eligible numbers right before this spin (lets the UI animate through real numbers). */
      eligibleBefore: number[];
    }
  | { ok: false; reason: "conflict" | "finished" | "empty_pool" | "error" };

type Randomizer = (minInclusive: number, maxExclusive: number) => number;

const UNIQUE_VIOLATION = "23505";

async function loadSpins(db: AppDb): Promise<DrawSpin[]> {
  // Chronological order is the natural reading order (3rd prize first).
  const rows = await db.select().from(drawSpins).orderBy(asc(drawSpins.id));
  return rows.map((r) => ({
    id: r.id,
    prizeRank: r.prizeRank as PrizeRank,
    spinIndex: r.spinIndex as SpinIndex,
    number: r.number,
    participantName: r.participantName,
    isWinner: r.isWinner,
    createdAt: r.createdAt,
  }));
}

function deriveRound(spins: DrawSpin[]): { prize: PrizeRank | null; nextSpin: SpinIndex | null } {
  for (const prize of DRAW_ORDER) {
    const done = spins.filter((s) => s.prizeRank === prize).length;
    if (done < SPINS_PER_PRIZE) return { prize, nextSpin: (done + 1) as SpinIndex };
  }
  return { prize: null, nextSpin: null };
}

/** Sold numbers minus past winners minus numbers already drawn in the current round. */
async function loadEligible(
  db: AppDb,
  spins: DrawSpin[],
  prize: PrizeRank,
): Promise<{ number: number; name: string }[]> {
  const excluded = new Set<number>();
  for (const s of spins) if (s.isWinner || s.prizeRank === prize) excluded.add(s.number);
  const rows = await db
    .select({
      number: tickets.number,
      fullName: members.fullName,
    })
    .from(tickets)
    .innerJoin(participants, eq(tickets.participantId, participants.id))
    .innerJoin(members, eq(participants.memberId, members.id))
    .orderBy(asc(tickets.number));
  return rows
    .filter((r) => !excluded.has(r.number))
    .map((r) => ({ number: r.number, name: r.fullName }));
}

export async function getDrawState(db: AppDb): Promise<DrawState> {
  const spins = await loadSpins(db);
  const { prize, nextSpin } = deriveRound(spins);
  const eligibleCount = prize === null ? 0 : (await loadEligible(db, spins, prize)).length;
  return { spins, currentPrize: prize, nextSpinIndex: nextSpin, eligibleCount };
}

export interface Winner {
  prizeRank: PrizeRank;
  number: number;
  participantName: string;
  createdAt: Date;
}

/** Public-safe view: only winning spins (the 3rd of each round), never the intermediate draws. */
export async function listWinners(db: AppDb): Promise<Winner[]> {
  const rows = await db
    .select({
      prizeRank: drawSpins.prizeRank,
      number: drawSpins.number,
      participantName: drawSpins.participantName,
      createdAt: drawSpins.createdAt,
    })
    .from(drawSpins)
    .where(eq(drawSpins.isWinner, true))
    .orderBy(asc(drawSpins.prizeRank));
  return rows.map((r) => ({ ...r, prizeRank: r.prizeRank as PrizeRank }));
}

/**
 * Performs ONE server-side spin. Randomness is injected for tests; the default
 * is a CSPRNG. The (prize_rank, spin_index) unique constraint turns concurrent
 * or double-clicked spins into a typed "conflict" instead of a duplicate spin.
 */
export async function spin(db: AppDb, randomInt: Randomizer = cryptoRandomInt): Promise<SpinResult> {
  try {
    return await db.transaction(async (tx): Promise<SpinResult> => {
      const txDb = tx as unknown as AppDb;
      const spins = await loadSpins(txDb);
      const { prize, nextSpin } = deriveRound(spins);
      if (prize === null || nextSpin === null) return { ok: false, reason: "finished" };

      const pool = await loadEligible(txDb, spins, prize);
      if (pool.length === 0) return { ok: false, reason: "empty_pool" };

      const picked = pool[randomInt(0, pool.length)];
      const [row] = await tx
        .insert(drawSpins)
        .values({
          prizeRank: prize,
          spinIndex: nextSpin,
          number: picked.number,
          participantName: picked.name,
          isWinner: nextSpin === SPINS_PER_PRIZE,
        })
        .returning();

      return {
        ok: true,
        spin: {
          id: row.id,
          prizeRank: prize,
          spinIndex: nextSpin,
          number: row.number,
          participantName: row.participantName,
          isWinner: row.isWinner,
          createdAt: row.createdAt,
        },
        eligibleBefore: pool.map((p) => p.number),
      };
    });
  } catch (err) {
    if (findPgError(err)?.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
    console.error("spin failed", err);
    return { ok: false, reason: "error" };
  }
}

/** Deletes every spin so the draw can be rehearsed again. */
export async function resetDraw(db: AppDb): Promise<void> {
  await db.delete(drawSpins);
}
