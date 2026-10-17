import { count, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { participants, tickets } from "@/db/schema";
import { cleanName, makeNameKey } from "./name";
import { claimSchema } from "./schemas";

export type ClaimResult =
  | { ok: true; participant: { firstName: string; lastName: string }; numbers: number[] }
  | { ok: false; reason: "conflict"; taken: number[] }
  | {
      ok: false;
      reason: "invalid" | "bad_code" | "duplicate_name" | "closed" | "error";
      message?: string;
    };

const UNIQUE_VIOLATION = "23505";
const NAME_KEY_CONSTRAINT = "participants_name_key_unique";

/** Drizzle may wrap driver errors (`cause`); walk the chain looking for a pg error. */
export function findPgError(err: unknown): { code?: string; constraint?: string } | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const e = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown; // postgres.js PostgresError
      cause?: unknown;
    };
    if (typeof e.code === "string") {
      const constraint =
        typeof e.constraint === "string"
          ? e.constraint
          : typeof e.constraint_name === "string"
            ? e.constraint_name
            : undefined;
      return { code: e.code, constraint };
    }
    current = e.cause;
  }
  return undefined;
}

/**
 * Atomically registers a participant and their tickets in ONE SQL statement.
 * Any unique violation (name or ticket number) aborts the whole statement, so
 * no orphan participant and no partial set of tickets can ever be stored.
 */
export async function claimTicketNumbers(db: AppDb, input: unknown): Promise<ClaimResult> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  }
  const firstName = cleanName(parsed.data.firstName);
  const lastName = cleanName(parsed.data.lastName);
  const numbers = [...parsed.data.numbers].sort((a, b) => a - b);
  const nameKey = makeNameKey(firstName, lastName);
  // Validated integers only, so building the array literal is injection-safe.
  const numbersLiteral = `{${numbers.join(",")}}`;

  try {
    await db.execute(sql`
      WITH p AS (
        INSERT INTO participants (first_name, last_name, name_key)
        VALUES (${firstName}, ${lastName}, ${nameKey})
        RETURNING id
      )
      INSERT INTO tickets (number, participant_id)
      SELECT unnest(${numbersLiteral}::int[]), p.id FROM p
    `);
    return { ok: true, participant: { firstName, lastName }, numbers };
  } catch (err) {
    const pg = findPgError(err);
    if (pg?.code !== UNIQUE_VIOLATION) {
      console.error("claimTicketNumbers failed", err);
      return { ok: false, reason: "error" };
    }
    try {
      if (pg.constraint === NAME_KEY_CONSTRAINT) {
        return { ok: false, reason: "duplicate_name" };
      }
      const taken = await findTaken(db, numbers);
      if (taken.length > 0) return { ok: false, reason: "conflict", taken };
      const existing = await db
        .select({ id: participants.id })
        .from(participants)
        .where(eq(participants.nameKey, nameKey))
        .limit(1);
      if (existing.length > 0) return { ok: false, reason: "duplicate_name" };
      return { ok: false, reason: "error" };
    } catch (lookupErr) {
      console.error("claimTicketNumbers conflict lookup failed", lookupErr);
      return { ok: false, reason: "error" };
    }
  }
}

async function findTaken(db: AppDb, numbers: number[]): Promise<number[]> {
  const rows = await db
    .select({ number: tickets.number })
    .from(tickets)
    .where(inArray(tickets.number, numbers))
    .orderBy(tickets.number);
  return rows.map((r) => r.number);
}

export interface TicketsSnapshot {
  taken: number[];
  participants: number;
}

export async function getTicketsSnapshot(db: AppDb): Promise<TicketsSnapshot> {
  const [rows, [counted]] = await Promise.all([
    db.select({ number: tickets.number }).from(tickets).orderBy(tickets.number),
    db.select({ value: count() }).from(participants),
  ]);
  return { taken: rows.map((r) => r.number), participants: Number(counted?.value ?? 0) };
}

export interface ParticipantWithNumbers {
  id: string;
  firstName: string;
  lastName: string;
  numbers: number[];
  createdAt: Date;
}

export async function listParticipants(db: AppDb): Promise<ParticipantWithNumbers[]> {
  const [people, rows] = await Promise.all([
    db.select().from(participants).orderBy(participants.createdAt),
    db
      .select({ number: tickets.number, participantId: tickets.participantId })
      .from(tickets)
      .orderBy(tickets.number),
  ]);
  const byPerson = new Map<string, number[]>();
  for (const r of rows) {
    const list = byPerson.get(r.participantId);
    if (list) list.push(r.number);
    else byPerson.set(r.participantId, [r.number]);
  }
  return people.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    numbers: byPerson.get(p.id) ?? [],
    createdAt: p.createdAt,
  }));
}

/** Deletes the participant; tickets are freed through ON DELETE CASCADE. */
export async function releaseParticipant(db: AppDb, id: string): Promise<boolean> {
  const deleted = await db
    .delete(participants)
    .where(eq(participants.id, id))
    .returning({ id: participants.id });
  return deleted.length > 0;
}
