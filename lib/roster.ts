import { TOTAL_MEMBERS } from "./constants";
import { DNI_PATTERN } from "./dni";
import { cleanName } from "./name";

/** One spreadsheet row, as read (before any cleaning). */
export interface RawRosterRow {
  dni: string;
  fullName: string;
  office: string;
  unit: string;
  status: string;
}

export interface RosterMember {
  dni: string;
  fullName: string;
  office: string;
  unit: string;
}

/** Members on leave are not part of the raffle. SUSPENDIDO / DESCANSO M. remain eligible. */
export const EXCLUDED_STATUS = "CON LICENCIA";

export interface ParsedRoster {
  eligible: RosterMember[];
  excluded: { fullName: string; status: string }[];
}

/**
 * Cleans and filters the raw roster rows. Fails loudly (never prints a DNI) when
 * the result is not exactly `expected` members with valid, unique DNIs.
 */
export function parseRoster(rows: RawRosterRow[], expected: number = TOTAL_MEMBERS): ParsedRoster {
  const eligible: RosterMember[] = [];
  const excluded: ParsedRoster["excluded"] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const fullName = cleanName(row.fullName);
    const status = cleanName(row.status).toUpperCase();
    if (status === EXCLUDED_STATUS) {
      excluded.push({ fullName, status });
      continue;
    }
    const dni = row.dni.trim();
    if (!fullName) throw new Error("Roster row without a name.");
    if (!DNI_PATTERN.test(dni)) throw new Error(`Invalid DNI format for "${fullName}".`);
    if (seen.has(dni)) throw new Error(`Duplicate DNI detected (second occurrence: "${fullName}").`);
    seen.add(dni);
    eligible.push({ dni, fullName, office: cleanName(row.office), unit: cleanName(row.unit) });
  }

  if (eligible.length !== expected) {
    throw new Error(`Expected exactly ${expected} eligible members, found ${eligible.length}.`);
  }
  return { eligible, excluded };
}
