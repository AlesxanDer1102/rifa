"use server";

import { getDb } from "@/db/client";
import { safeEqual } from "@/lib/admin-session";
import { claimTicketNumbers, type ClaimResult } from "@/lib/claim";
import { getEnv, isRegistrationClosed } from "@/lib/env";
import { claimRequestSchema } from "@/lib/schemas";

/** Early feedback for the access code. `claimTickets` re-validates it. */
export async function verifyAccessCode(code: string): Promise<{ ok: boolean; closed: boolean }> {
  try {
    const ok = typeof code === "string" && safeEqual(code, getEnv().ACCESS_CODE);
    return { ok, closed: isRegistrationClosed() };
  } catch (err) {
    console.error("verifyAccessCode failed", err);
    return { ok: false, closed: false };
  }
}

export async function claimTickets(input: {
  accessCode: string;
  firstName: string;
  lastName: string;
  numbers: number[];
}): Promise<ClaimResult> {
  try {
    const parsed = claimRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
    }
    const { accessCode, ...claim } = parsed.data;
    if (!safeEqual(accessCode, getEnv().ACCESS_CODE)) return { ok: false, reason: "bad_code" };
    if (isRegistrationClosed()) return { ok: false, reason: "closed" };
    return await claimTicketNumbers(getDb(), claim);
  } catch (err) {
    console.error("claimTickets failed", err);
    return { ok: false, reason: "error" };
  }
}
