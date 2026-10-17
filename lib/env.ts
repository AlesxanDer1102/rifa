import "server-only";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Migrations only (scripts/migrate.ts, drizzle.config.ts); not needed at runtime.
  DATABASE_URL_UNPOOLED: z.preprocess(emptyToUndefined, z.string().optional()),
  ACCESS_CODE: z.string().min(1, "ACCESS_CODE is required"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  ADMIN_SESSION_SECRET: z.string().min(32, "ADMIN_SESSION_SECRET must be at least 32 characters"),
  REGISTRATION_CLOSES_AT: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "REGISTRATION_CLOSES_AT must be an ISO 8601 date")
      .optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated server environment. Evaluated lazily so `next build` needs no secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** True when the registration deadline (if any) has passed. */
export function isRegistrationClosed(now: Date = new Date()): boolean {
  const closesAt = getEnv().REGISTRATION_CLOSES_AT;
  return closesAt !== undefined && now.getTime() > Date.parse(closesAt);
}
