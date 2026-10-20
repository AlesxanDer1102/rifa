import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { members } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { hashDni } from "@/lib/dni";

export const PEPPER = "test-pepper-test-pepper-test-pepper-0123456789";

export const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Recreates the public schema and applies every generated migration. */
export async function resetDb(client: PGlite) {
  await client.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  const dir = path.resolve(__dirname, "../drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const content = readFileSync(path.join(dir, file), "utf8");
    for (const statement of content.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}

/** Inserts a roster member (DNI hashed with the test pepper) and returns its id. */
export async function insertMember(db: AppDb, fullName: string, dni = "12345678"): Promise<string> {
  const [row] = await db
    .insert(members)
    .values({ fullName, office: "OFICINA", unit: "UNIDAD", dniHash: hashDni(dni, PEPPER) })
    .returning({ id: members.id });
  return row.id;
}
