import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { schema, participants, tickets } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { claimTicketNumbers, findPgError, getTicketsSnapshot, listParticipants, releaseParticipant } from "@/lib/claim";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as AppDb;

async function applyMigrations() {
  const dir = path.resolve(__dirname, "../drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const content = readFileSync(path.join(dir, file), "utf8");
    for (const statement of content.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}

async function counts() {
  const p = await db.select().from(participants);
  const t = await db.select().from(tickets);
  return { participants: p.length, tickets: t.length };
}

beforeEach(async () => {
  await client.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await applyMigrations();
});

afterAll(async () => {
  await client.close();
});

describe("claimTicketNumbers (PGlite)", () => {
  it("stores one participant and 12 tickets", async () => {
    const result = await claimTicketNumbers(db, {
      firstName: "Ana",
      lastName: "Pérez",
      numbers: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    });
    expect(result).toEqual({
      ok: true,
      participant: { firstName: "Ana", lastName: "Pérez" },
      numbers: range(1, 12),
    });
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
  });

  it("fails entirely when ONE number overlaps and reports it", async () => {
    await claimTicketNumbers(db, { firstName: "Ana", lastName: "Pérez", numbers: range(1, 12) });
    const second = await claimTicketNumbers(db, {
      firstName: "Luis",
      lastName: "Gómez",
      numbers: [...range(101, 111), 12],
    });
    expect(second).toEqual({ ok: false, reason: "conflict", taken: [12] });
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
    const snapshot = await getTicketsSnapshot(db);
    expect(snapshot.taken).toEqual(range(1, 12));
  });

  it("rejects a duplicate name (accent and case insensitive)", async () => {
    await claimTicketNumbers(db, { firstName: "José", lastName: "Pérez", numbers: range(1, 12) });
    const dup = await claimTicketNumbers(db, {
      firstName: "jose ",
      lastName: "  PEREZ",
      numbers: range(101, 112),
    });
    expect(dup).toEqual({ ok: false, reason: "duplicate_name" });
    expect(await counts()).toEqual({ participants: 1, tickets: 12 });
  });

  it("rejects invalid input without touching the database", async () => {
    const result = await claimTicketNumbers(db, { firstName: "Ana", lastName: "Pérez", numbers: range(1, 11) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
    expect(await counts()).toEqual({ participants: 0, tickets: 0 });
  });

  it("frees numbers when a participant is released", async () => {
    await claimTicketNumbers(db, { firstName: "Ana", lastName: "Pérez", numbers: range(1, 12) });
    const [person] = await listParticipants(db);
    expect(person.numbers).toEqual(range(1, 12));
    expect(await releaseParticipant(db, person.id)).toBe(true);
    expect(await counts()).toEqual({ participants: 0, tickets: 0 });
    const again = await claimTicketNumbers(db, { firstName: "Luis", lastName: "Gómez", numbers: range(1, 12) });
    expect(again.ok).toBe(true);
  });

  it("lets exactly one of ~10 concurrent claims on the same number win", async () => {
    const attempts = range(1, 10).map((i) =>
      claimTicketNumbers(db, {
        firstName: `Persona${i}`,
        lastName: "Concurrente",
        // every claim includes number 7, the rest are disjoint
        numbers: [7, ...range(100 * i, 100 * i + 10)],
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
