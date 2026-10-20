import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { claimTicketNumbers } from "@/lib/claim";
import { getDrawState, listWinners, resetDraw, spin } from "@/lib/draw";
import { insertMember, range, resetDb } from "./helpers";

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as AppDb;

/** Deterministic picker: always the first eligible number. */
const first = () => 0;

/** Registers one participant owning the given numbers (12 required by claim validation). */
async function seed(name: string, from: number, dni: string) {
  const memberId = await insertMember(db, `${name} PRUEBA`, dni);
  const result = await claimTicketNumbers(db, { memberId, numbers: range(from, from + 11) });
  expect(result.ok).toBe(true);
}

async function spinOk(randomInt = first) {
  const res = await spin(db, randomInt);
  if (!res.ok) throw new Error(`spin failed: ${res.reason}`);
  return res;
}

beforeEach(async () => {
  await resetDb(client);
  await seed("Ana", 1, "10000001"); // 1..12
  await seed("Luis", 13, "10000002"); // 13..24
});

afterAll(async () => {
  await client.close();
});

describe("draw (PGlite)", () => {
  it("starts at the 3rd prize, spin 1, with every sold number eligible", async () => {
    const state = await getDrawState(db);
    expect(state).toMatchObject({ currentPrize: 3, nextSpinIndex: 1, eligibleCount: 24 });
    expect(state.spins).toEqual([]);
  });

  it("draws prizes in order 3 -> 2 -> 1 with the 3rd spin as winner", async () => {
    const seen: [number, number, boolean][] = [];
    for (let i = 0; i < 9; i++) {
      const { spin: s } = await spinOk();
      seen.push([s.prizeRank, s.spinIndex, s.isWinner]);
    }
    expect(seen).toEqual([
      [3, 1, false],
      [3, 2, false],
      [3, 3, true],
      [2, 1, false],
      [2, 2, false],
      [2, 3, true],
      [1, 1, false],
      [1, 2, false],
      [1, 3, true],
    ]);
  });

  it("stores the participant name snapshot and returns the eligible list before the spin", async () => {
    const res = await spinOk();
    expect(res.spin.number).toBe(1);
    expect(res.spin.participantName).toBe("Ana PRUEBA");
    expect(res.eligibleBefore).toEqual(range(1, 24));
  });

  it("never repeats a number within a round", async () => {
    const drawn: number[] = [];
    for (let i = 0; i < 3; i++) drawn.push((await spinOk()).spin.number);
    expect(new Set(drawn).size).toBe(3);
  });

  it("excludes winners from later rounds", async () => {
    const winners: number[] = [];
    for (let i = 0; i < 9; i++) {
      const { spin: s, eligibleBefore } = await spinOk();
      for (const w of winners) expect(eligibleBefore).not.toContain(w);
      if (s.isWinner) winners.push(s.number);
    }
    expect(new Set(winners).size).toBe(3);
  });

  it("makes non-winning numbers of a round eligible again in the next round", async () => {
    const r3 = [await spinOk(), await spinOk(), await spinOk()];
    expect(r3.map((r) => r.spin.number)).toEqual([1, 2, 3]);
    const next = await spinOk();
    // 1 and 2 were discarded in round 3 only; 3 won and stays out.
    expect(next.eligibleBefore).toContain(1);
    expect(next.eligibleBefore).toContain(2);
    expect(next.eligibleBefore).not.toContain(3);
    expect(next.eligibleBefore).toHaveLength(23);
  });

  it("tracks the eligible count through a round and reports finished state", async () => {
    await spinOk();
    expect((await getDrawState(db)).eligibleCount).toBe(23);
    await spinOk();
    await spinOk(); // winner -> next round pool = 24 - 1
    expect(await getDrawState(db)).toMatchObject({ currentPrize: 2, nextSpinIndex: 1, eligibleCount: 23 });
    for (let i = 0; i < 6; i++) await spinOk();
    expect(await getDrawState(db)).toMatchObject({ currentPrize: null, nextSpinIndex: null, eligibleCount: 0 });
    expect(await spin(db, first)).toEqual({ ok: false, reason: "finished" });
  });

  it("returns empty_pool when no sold number is eligible", async () => {
    await client.exec("DELETE FROM participants");
    expect(await spin(db, first)).toEqual({ ok: false, reason: "empty_pool" });
  });

  it("maps a unique violation raised during the spin to a typed conflict", async () => {
    // A rival spin committing between our read and insert surfaces as pg 23505 (wrapped by drizzle).
    const racing = {
      transaction: async () => {
        throw new Error("Failed query", { cause: Object.assign(new Error("dup"), { code: "23505" }) });
      },
    } as unknown as AppDb;
    expect(await spin(racing, first)).toEqual({ ok: false, reason: "conflict" });
  });

  it("enforces uniqueness of (prize_rank, spin_index) at the database level", async () => {
    await spinOk();
    const dup = client.exec(
      "INSERT INTO draw_spins (prize_rank, spin_index, number, participant_name, is_winner) VALUES (3, 1, 5, 'X', false)",
    );
    await expect(dup).rejects.toMatchObject({ code: "23505" });
  });

  it("resets the draw", async () => {
    await spinOk();
    await spinOk();
    await resetDraw(db);
    expect(await getDrawState(db)).toMatchObject({ currentPrize: 3, nextSpinIndex: 1, eligibleCount: 24 });
  });

  it("listWinners returns only winning spins, ordered by prize rank", async () => {
    expect(await listWinners(db)).toEqual([]);
    for (let i = 0; i < 4; i++) await spinOk(); // 3rd prize complete + 2nd prize spin 1
    const winners = await listWinners(db);
    expect(winners).toHaveLength(1);
    const state = await getDrawState(db);
    expect(state.spins).toHaveLength(4);
    const winnerSpin = state.spins.find((s) => s.isWinner)!;
    expect(winners[0]).toMatchObject({
      prizeRank: 3,
      number: winnerSpin.number,
      participantName: winnerSpin.participantName,
    });
    for (let i = 0; i < 5; i++) await spinOk();
    expect((await listWinners(db)).map((w) => w.prizeRank)).toEqual([1, 2, 3]);
  });
});
