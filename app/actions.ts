"use server";

import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { claimWithSession, type ClaimResult } from "@/lib/claim";
import { getEnv, isRegistrationClosed } from "@/lib/env";
import { endMemberSession, readMemberToken, startMemberSession } from "@/lib/member-session";
import { verifyMemberDni } from "@/lib/members";

export type VerifyDniResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "incorrect" | "locked" | "already_participated" | "closed" | "error" };

/** Best-effort client IP behind Vercel's proxy (first hop of x-forwarded-for). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Checks the member's DNI and, on success, starts the short-lived member session. */
export async function verifyDni(memberId: string, dni: string): Promise<VerifyDniResult> {
  try {
    if (isRegistrationClosed()) return { ok: false, reason: "closed" };
    const result = await verifyMemberDni(getDb(), {
      memberId,
      dni,
      ip: await clientIp(),
      pepper: getEnv().DNI_PEPPER,
    });
    if (!result.ok) return result;
    await startMemberSession(result.member.id);
    return { ok: true };
  } catch (err) {
    console.error("verifyDni failed", err);
    return { ok: false, reason: "error" };
  }
}

/** Claims numbers for the member in the signed session cookie; no identity comes from the client. */
export async function claimTickets(input: { numbers: number[] }): Promise<ClaimResult> {
  try {
    if (isRegistrationClosed()) return { ok: false, reason: "closed" };
    const result = await claimWithSession(getDb(), {
      token: await readMemberToken(),
      secret: getEnv().ADMIN_SESSION_SECRET,
      numbers: input?.numbers,
    });
    if (result.ok) await endMemberSession();
    return result;
  } catch (err) {
    console.error("claimTickets failed", err);
    return { ok: false, reason: "error" };
  }
}
