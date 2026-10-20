import { createHmac, timingSafeEqual } from "node:crypto";

export const DNI_PATTERN = /^\d{8}$/;

/** Keyed hash stored instead of the DNI: HMAC-SHA256(pepper, dni), hex. */
export function hashDni(dni: string, pepper: string): string {
  return createHmac("sha256", pepper).update(dni).digest("hex");
}

/** Constant-time check of a candidate DNI against a stored hash. */
export function verifyDni(dni: string, storedHash: string, pepper: string): boolean {
  if (!DNI_PATTERN.test(dni)) return false;
  const candidate = Buffer.from(hashDni(dni, pepper), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Keyed hash of a client IP for the attempt log (raw addresses are never stored). */
export function hashIp(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`ip:${ip}`).digest("hex");
}
