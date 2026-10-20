import ExcelJS from "exceljs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { members } from "../db/schema";
import { hashDni } from "../lib/dni";
import { parseRoster, type RawRosterRow } from "../lib/roster";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file not present: rely on the process environment
  }
}

const SHEET_NAME = "AFILIADOS ";
const FIRST_DATA_ROW = 4; // header is on row 3
// Columns B..H: Nro, DNI, APELLIDOS Y NOMBRES, SEXO, OFICINAS, UNIDAD, SITUACION
const COL = { dni: 3, fullName: 4, office: 6, unit: 7, status: 8 } as const;

async function readRows(file: string): Promise<RawRosterRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet =
    workbook.getWorksheet(SHEET_NAME) ??
    workbook.worksheets.find((w) => w.name.trim() === SHEET_NAME.trim());
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found.`);

  const rows: RawRosterRow[] = [];
  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const dniCell = row.getCell(COL.dni);
    const fullName = row.getCell(COL.fullName).text;
    if (!dniCell.text.trim() && !fullName.trim()) continue; // blank row
    // A numeric cell loses leading zeros: restore them to 8 digits.
    const dni = typeof dniCell.value === "number" ? String(dniCell.value).padStart(8, "0") : dniCell.text;
    rows.push({
      dni,
      fullName,
      office: row.getCell(COL.office).text,
      unit: row.getCell(COL.unit).text,
      status: row.getCell(COL.status).text,
    });
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run import:members -- <roster.xlsx> [--dry-run]");
    process.exit(1);
  }

  const { eligible, excluded } = parseRoster(await readRows(file));
  console.log(`Eligible members: ${eligible.length}`);
  console.log(`Excluded (${excluded.length}):`);
  for (const e of excluded) console.log(`  - ${e.fullName} (${e.status})`);

  if (dryRun) {
    console.log("Dry run: nothing written to the database.");
    return;
  }

  const pepper = process.env.DNI_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("DNI_PEPPER (>= 32 chars) is not set.");
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set.");

  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client);
    await db
      .insert(members)
      .values(
        eligible.map((m) => ({
          fullName: m.fullName,
          office: m.office,
          unit: m.unit,
          dniHash: hashDni(m.dni, pepper),
        })),
      )
      .onConflictDoUpdate({
        target: members.dniHash,
        set: { fullName: sql`excluded.full_name`, office: sql`excluded.office`, unit: sql`excluded.unit` },
      });
    console.log(`Upserted ${eligible.length} members.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
