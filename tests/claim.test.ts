import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { schema, participants, tickets } from "@/db/schema";
import type { AppDb } from "@/db/types";
import {
  claimTicketNumbers,
  claimWithSession,
  findPgError,
  getTicketsSnapshot,
  listParticipants,
  releaseParticipant,
} from "@/lib/claim";
import { createMemberToken } from "@/lib/member-token";
import { insertMember, range, resetDb } from "./helpers";

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as AppDb;

const UNKNOWN_ID = "6f1c1f0e-8f0e-4c53-9d8e-0c4f4f0d2a11";

async function counts() {
  const p = await db.select().from(participants);
  const t = await db.select().from(tickets);
  return { participants: p.length, tickets: t.length };
}

beforeEach(async () => {
  await resetDb(client);
});

afterAll(async () => {
  await client.close();
});

describe("claimTicketNumbers (PGlite)", () => {
  it("stores one participant and 12 tickets, named after the member", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    const result = await claimTicketNumbers(db, {
      memberId: ana,
      numbers: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    });
    expect(result).toEqual({
      ok: true,
      participant: { fullName: "PEREZ ANA" },
      numbers: range(1, 12),
    });
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
  });

  it("fails entirely when ONE number overlaps and reports it", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    const luis = await insertMember(db, "GOMEZ LUIS", "10000002");
    await claimTicketNumbers(db, { memberId: ana, numbers: range(1, 12) });
    const second = await claimTicketNumbers(db, { memberId: luis, numbers: [...range(101, 111), 12] });
    expect(second).toEqual({ ok: false, reason: "conflict", taken: [12] });
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
    const snapshot = await getTicketsSnapshot(db);
    expect(snapshot.taken).toEqual(range(1, 12));
  });

  it("rejects a second participation by the same member and keeps the first intact", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    await claimTicketNumbers(db, { memberId: ana, numbers: range(1, 12) });
    const again = await claimTicketNumbers(db, { memberId: ana, numbers: range(101, 112) });
    expect(again).toEqual({ ok: false, reason: "already_participated" });
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
  });

  it("lets a member participate at most once under parallel claims", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    const results = await Promise.all(
      range(1, 8).map((i) => claimTicketNumbers(db, { memberId: ana, numbers: range(100 * i, 100 * i + 11) })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results) if (!r.ok) expect(r.reason).toBe("already_participated");
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
  });

  it("rejects an unknown member and invalid input without touching the database", async () => {
    const unknown = await claimTicketNumbers(db, { memberId: UNKNOWN_ID, numbers: range(1, 12) });
    expect(unknown).toEqual({ ok: false, reason: "unauthorized" });
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    const result = await claimTicketNumbers(db, { memberId: ana, numbers: range(1, 11) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
    expect(await counts()).toEqual({ participants: 0, tickets: 0 });
  });

  it("frees numbers on release and lets the member participate again", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    await claimTicketNumbers(db, { memberId: ana, numbers: range(1, 12) });
    const [person] = await listParticipants(db);
    expect(person).toMatchObject({ fullName: "PEREZ ANA", numbers: range(1, 12) });
    expect(await releaseParticipant(db, person.id)).toBe(true);
    expect(await counts()).toEqual({ participants: 0, tickets: 0 });
    const again = await claimTicketNumbers(db, { memberId: ana, numbers: range(1, 12) });
    expect(again.ok).toBe(true);
  });

  it("lets exactly one of ~10 concurrent claims on the same number win", async () => {
    const ids = await Promise.all(range(1, 10).map((i) => insertMember(db, `PERSONA ${i}`, `3000000${i}`.slice(-8))));
    const attempts = ids.map((memberId, idx) =>
      claimTicketNumbers(db, {
        memberId,
        // every claim includes number 7, the rest are disjoint
        numbers: [7, ...range(100 * (idx + 1), 100 * (idx + 1) + 10)],
      }),
    );
    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    for (const r of results) {
      if (!r.ok) {
        expect(r.reason).toBe("conflict");
        if (r.reason === "conflict") expect(r.taken).toEqual([7]);
      }
    }
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
  });
});

describe("claimWithSession (PGlite)", () => {
  const secret = "s".repeat(40);

  it("claims for the member inside a valid session token", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    const token = createMemberToken(ana, secret);
    const result = await claimWithSession(db, { token, secret, numbers: range(1, 12) });
    expect(result).toMatchObject({ ok: true, participant: { fullName: "PEREZ ANA" } });
  });

  it("rejects missing, forged, foreign-secret and expired sessions", async () => {
    const ana = await insertMember(db, "PEREZ ANA", "10000001");
    const good = createMemberToken(ana, secret);
    const expired = createMemberToken(ana, secret, Date.now() - 60 * 60 * 1000);
    const foreign = createMemberToken(ana, "x".repeat(40));
    const tampered = good.replace(ana, UNKNOWN_ID);
    for (const token of [undefined, "", "garbage", expired, foreign, tampered]) {
      const result = await claimWithSession(db, { token, secret, numbers: range(1, 12) });
      expect(result).toEqual({ ok: false, reason: "unauthorized" });
    }
    expect(await counts()).toEqual({ participants: 0, tickets: 0 });
  });
});

describe("findPgError", () => {
  it("reads `constraint` (pg / PGlite)", () => {
    expect(findPgError({ code: "23505", constraint: "c1" })).toEqual({ code: "23505", constraint: "c1" });
  });

  it("reads `constraint_name` (postgres.js), also through `cause`", () => {
    expect(findPgError({ cause: { code: "23505", constraint_name: "c2" } })).toEqual({
      code: "23505",
      constraint: "c2",
    });
  });

  it("returns undefined without a code", () => {
    expect(findPgError(new Error("x"))).toBeUndefined();
  });
});
