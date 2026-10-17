"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { endAdminSession, isAdmin, safeEqual, startAdminSession } from "@/lib/admin-session";
import { releaseParticipant } from "@/lib/claim";
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
