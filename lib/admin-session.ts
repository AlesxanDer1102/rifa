import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "./env";

export const ADMIN_COOKIE = "admin_session";
const SESSION_SECONDS = 12 * 60 * 60;

function sign(payload: string): string {
  return createHmac("sha256", getEnv().ADMIN_SESSION_SECRET).update(payload).digest("base64url");
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function createSessionToken(nowMs: number = Date.now()): string {
  const expires = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const payload = `v1.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, nowMs: number = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expires, signature] = parts;
  if (version !== "v1" || !/^\d+$/.test(expires)) return false;
  if (!safeEqual(signature, sign(`${version}.${expires}`))) return false;
  return Number(expires) > Math.floor(nowMs / 1000);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}

export async function startAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
