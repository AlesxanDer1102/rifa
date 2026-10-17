import type { PgDatabase } from "drizzle-orm/pg-core";
import type { schema } from "./schema";

/**
 * Driver-agnostic Drizzle database: satisfied by both `drizzle-orm/postgres-js`
 * (production) and `drizzle-orm/pglite` (tests).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDb = PgDatabase<any, typeof schema>;
