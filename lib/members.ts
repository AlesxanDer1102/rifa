import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { dniAttempts, members, participants } from "@/db/schema";
import {
  DNI_ATTEMPT_WINDOW_MS,
  DNI_MAX_ATTEMPTS_PER_IP,
  DNI_MAX_ATTEMPTS_PER_MEMBER,
} from "./constants";
import { hashIp, verifyDni } from "./dni";
import { dniLoginSchema } from "./schemas";

/** Public-safe view of the roster: never includes the DNI or its hash. */
export interface MemberListItem {
  id: string;
  fullName: string;
  participated: boolean;
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

export async function listMembers(db: AppDb): Promise<MemberListItem[]> {
  const rows = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      participantId: participants.id,
    })
    .from(members)
    .leftJoin(participants, eq(participants.memberId, members.id));
  return rows
    .map((r) => ({ id: r.id, fullName: r.fullName, participated: r.participantId !== null }))
    .sort((a, b) => collator.compare(a.fullName, b.fullName));
}

export type DniLoginResult =
  | { ok: true; member: { id: string; fullName: string } }
  | { ok: false; reason: "invalid" | "incorrect" | "locked" | "already_participated" };

interface DniLoginInput {
  memberId: unknown;
  dni: unknown;
  /** Client IP as seen by the server ("unknown" when unavailable). */
  ip: string;
  pepper: string;
  now?: Date;
}

/**
 * Verifies a member's DNI with persisted brute-force limits.
 *
 * Failed attempts are persisted; a member can fail DNI_MAX_ATTEMPTS_PER_MEMBER
 * times (and a client IP DNI_MAX_ATTEMPTS_PER_IP times) per window, after which
 * even a correct DNI is refused until old failures expire. Checks run under a
 * per-member advisory lock so parallel guesses cannot slip past the counter.
 * Locked requests are not recorded, so hammering does not extend the lock.
 */
export async function verifyMemberDni(db: AppDb, input: DniLoginInput): Promise<DniLoginResult> {
  const parsed = dniLoginSchema.safeParse({ memberId: input.memberId, dni: input.dni });
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { memberId, dni } = parsed.data;
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - DNI_ATTEMPT_WINDOW_MS);
  const ipHash = hashIp(input.ip, input.pepper);

  return db.transaction(async (tx): Promise<DniLoginResult> => {
    // Serializes concurrent guesses for the same member (released at commit).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`);

    const [member] = await tx
      .select({
        id: members.id,
        fullName: members.fullName,
        dniHash: members.dniHash,
        participantId: participants.id,
      })
      .from(members)
      .leftJoin(participants, eq(participants.memberId, members.id))
      .where(eq(members.id, memberId))
      .limit(1);
    // Same answer as a wrong DNI: callers learn nothing beyond the public list.
    if (!member) return { ok: false, reason: "incorrect" };
    if (member.participantId) return { ok: false, reason: "already_participated" };

    // Housekeeping: expired attempts no longer count toward anything.
    await tx.delete(dniAttempts).where(lt(dniAttempts.createdAt, since));

    const [byMember] = await tx
      .select({ value: count() })
      .from(dniAttempts)
      .where(and(eq(dniAttempts.memberId, memberId), gt(dniAttempts.createdAt, since)));
    const [byIp] = await tx
      .select({ value: count() })
      .from(dniAttempts)
      .where(and(eq(dniAttempts.ipHash, ipHash), gt(dniAttempts.createdAt, since)));
    if (
      Number(byMember?.value ?? 0) >= DNI_MAX_ATTEMPTS_PER_MEMBER ||
      Number(byIp?.value ?? 0) >= DNI_MAX_ATTEMPTS_PER_IP
    ) {
      return { ok: false, reason: "locked" };
    }

    if (verifyDni(dni, member.dniHash, input.pepper)) {
      return { ok: true, member: { id: member.id, fullName: member.fullName } };
    }
    await tx.insert(dniAttempts).values({ memberId, ipHash, createdAt: now });
    return { ok: false, reason: "incorrect" };
  });
}
