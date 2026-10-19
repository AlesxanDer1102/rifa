"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { endAdminSession, isAdmin, safeEqual, startAdminSession } from "@/lib/admin-session";
import { releaseParticipant } from "@/lib/claim";
import { resetDraw, spin, type DrawSpin } from "@/lib/draw";
import { getEnv } from "@/lib/env";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password === "") {
    return { error: "Ingresa la contraseña." };
  }
  if (!safeEqual(password, getEnv().ADMIN_PASSWORD)) {
    return { error: "Contraseña incorrecta." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin");
}

export async function releaseAction(participantId: string): Promise<{ ok: boolean }> {
  if (!(await isAdmin())) return { ok: false };
  if (!/^[0-9a-f-]{36}$/i.test(participantId)) return { ok: false };
  const ok = await releaseParticipant(getDb(), participantId);
  revalidatePath("/admin");
  return { ok };
}

export type SpinActionResult =
  | {
      ok: true;
      number: number;
      participantName: string;
      prizeRank: 1 | 2 | 3;
      spinIndex: 1 | 2 | 3;
      isWinner: boolean;
      /** Eligible numbers before the spin, so the client can animate through real numbers. */
      eligibleBefore: number[];
    }
  | { ok: false; reason: "unauthorized" | "conflict" | "finished" | "empty_pool" | "error" };

export async function spinAction(): Promise<SpinActionResult> {
  if (!(await isAdmin())) return { ok: false, reason: "unauthorized" };
  const result = await spin(getDb());
  revalidatePath("/admin/sorteo");
  if (!result.ok) return { ok: false, reason: result.reason };
  const s: DrawSpin = result.spin;
  return {
    ok: true,
    number: s.number,
    participantName: s.participantName,
    prizeRank: s.prizeRank,
    spinIndex: s.spinIndex,
    isWinner: s.isWinner,
    eligibleBefore: result.eligibleBefore,
  };
}

export async function resetDrawAction(): Promise<{ ok: boolean }> {
  if (!(await isAdmin())) return { ok: false };
  await resetDraw(getDb());
  revalidatePath("/admin/sorteo");
  return { ok: true };
}
