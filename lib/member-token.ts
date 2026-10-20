import { createHmac, timingSafeEqual } from "node:crypto";
import { MEMBER_SESSION_SECONDS } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(payload: string, secret: string): string {
  // The prefix keeps these signatures disjoint from the admin session token.
  return createHmac("sha256", secret).update(`member-session:${payload}`).digest("base64url");
}

/** Signed `v1.<memberId>.<expires>.<signature>` token bound to one member. */
export function createMemberToken(
  memberId: string,
  secret: string,
  nowMs: number = Date.now(),
): string {
  const expires = Math.floor(nowMs / 1000) + MEMBER_SESSION_SECONDS;
  const payload = `v1.${memberId}.${expires}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the member id when the token is authentic and unexpired, otherwise null. */
export function verifyMemberToken(
  token: string | undefined,
  secret: string,
  nowMs: number = Date.now(),
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, memberId, expires, signature] = parts;
  if (version !== "v1" || !UUID.test(memberId) || !/^\d+$/.test(expires)) return null;
  const expected = Buffer.from(sign(`${version}.${memberId}.${expires}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(expires) > Math.floor(nowMs / 1000) ? memberId : null;
}
