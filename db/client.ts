import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "@/lib/env";
import { schema } from "./schema";
import type { AppDb } from "./types";

// Cache on globalThis so warm invocations (and dev HMR) reuse one connection.
const globalForDb = globalThis as unknown as { __rifaDb?: AppDb };

/**
 * Lazily created Drizzle instance over postgres.js.
 *
 * `prepare: false` is REQUIRED: production connects through Supabase's
 * transaction pooler (Supavisor, port 6543), which does not support
 * prepared statements.
 */
export function getDb(): AppDb {
  if (!globalForDb.__rifaDb) {
    const client = postgres(getEnv().DATABASE_URL, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    globalForDb.__rifaDb = drizzle(client, { schema }) as unknown as AppDb;
  }
  return globalForDb.__rifaDb;
}
