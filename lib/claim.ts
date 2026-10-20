import { count, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { members, participants, tickets } from "@/db/schema";
import { verifyMemberToken } from "./member-token";
import { claimSchema } from "./schemas";

export type ClaimResult =
  | { ok: true; participant: { fullName: string }; numbers: number[] }
  | { ok: false; reason: "conflict"; taken: number[] }
  | {
      ok: false;
      reason: "invalid" | "unauthorized" | "already_participated" | "closed" | "error";
      message?: string;
    };

const UNIQUE_VIOLATION = "23505";
const MEMBER_UNIQUE_CONSTRAINT = "participants_member_id_unique";

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
 * Atomically registers a member as a participant and stores their tickets in
 * ONE SQL statement. Any unique violation (member already participated, or a
 * ticket number taken) aborts the whole statement, so no orphan participant
 * and no partial set of tickets can ever be stored. The identity comes from
 * the member row; callers never supply a name.
 */
export async function claimTicketNumbers(db: AppDb, input: unknown): Promise<ClaimResult> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  }
  const { memberId } = parsed.data;
  const numbers = [...parsed.data.numbers].sort((a, b) => a - b);
  // Validated integers only, so building the array literal is injection-safe.
  const numbersLiteral = `{${numbers.join(",")}}`;

  try {
    const [member] = await db
      .select({ fullName: members.fullName })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    if (!member) return { ok: false, reason: "unauthorized" };

    await db.execute(sql`
      WITH p AS (
        INSERT INTO participants (member_id)
        VALUES (${memberId})
        RETURNING id
      )
      INSERT INTO tickets (number, participant_id)
      SELECT unnest(${numbersLiteral}::int[]), p.id FROM p
    `);
    return { ok: true, participant: { fullName: member.fullName }, numbers };
  } catch (err) {
    const pg = findPgError(err);
    if (pg?.code !== UNIQUE_VIOLATION) {
      console.error("claimTicketNumbers failed", err);
      return { ok: false, reason: "error" };
    }
    try {
      if (pg.constraint === MEMBER_UNIQUE_CONSTRAINT) {
        return { ok: false, reason: "already_participated" };
      }
      const taken = await findTaken(db, numbers);
      if (taken.length > 0) return { ok: false, reason: "conflict", taken };
      const existing = await db
        .select({ id: participants.id })
        .from(participants)
        .where(eq(participants.memberId, memberId))
        .limit(1);
      if (existing.length > 0) return { ok: false, reason: "already_participated" };
      return { ok: false, reason: "error" };
    } catch (lookupErr) {
      console.error("claimTicketNumbers conflict lookup failed", lookupErr);
      return { ok: false, reason: "error" };
    }
  }
}

/**
 * Claim gated by the signed member-session token: the member id is taken from
 * the token only, so a client can never claim on behalf of someone else.
 */
export async function claimWithSession(
  db: AppDb,
  input: { token: string | undefined; secret: string; numbers: unknown; now?: number },
): Promise<ClaimResult> {
  const memberId = verifyMemberToken(input.token, input.secret, input.now);
  if (!memberId) return { ok: false, reason: "unauthorized" };
  return claimTicketNumbers(db, { memberId, numbers: input.numbers });
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
  fullName: string;
  office: string;
  unit: string;
  numbers: number[];
  createdAt: Date;
}

export async function listParticipants(db: AppDb): Promise<ParticipantWithNumbers[]> {
  const [people, rows] = await Promise.all([
    db
      .select({
        id: participants.id,
        fullName: members.fullName,
        office: members.office,
        unit: members.unit,
        createdAt: participants.createdAt,
      })
      .from(participants)
      .innerJoin(members, eq(participants.memberId, members.id))
      .orderBy(participants.createdAt),
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
  return people.map((p) => ({ ...p, numbers: byPerson.get(p.id) ?? [] }));
}

/**
 * Deletes the participant; tickets are freed through ON DELETE CASCADE. The
 * member row stays, so the member can participate again.
 */
export async function releaseParticipant(db: AppDb, id: string): Promise<boolean> {
  const deleted = await db
    .delete(participants)
    .where(eq(participants.id, id))
    .returning({ id: participants.id });
  return deleted.length > 0;
}
