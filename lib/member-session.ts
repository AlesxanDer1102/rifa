import "server-only";
import { cookies } from "next/headers";
import { MEMBER_SESSION_SECONDS } from "./constants";
import { getEnv } from "./env";
import { createMemberToken } from "./member-token";

export const MEMBER_COOKIE = "member_session";

export async function readMemberToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(MEMBER_COOKIE)?.value;
}

export async function startMemberSession(memberId: string): Promise<void> {
  const store = await cookies();
  store.set(MEMBER_COOKIE, createMemberToken(memberId, getEnv().ADMIN_SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MEMBER_SESSION_SECONDS,
  });
}

export async function endMemberSession(): Promise<void> {
  const store = await cookies();
  store.delete(MEMBER_COOKIE);
}
