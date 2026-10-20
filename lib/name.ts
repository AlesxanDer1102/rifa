/** Trim and collapse internal whitespace. */
export function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Accent- and case-insensitive form for searching: NFD, no diacritics,
 * lowercase, collapsed spaces. "José  Pérez" and "jose perez" match.
 */
export function normalizeForSearch(value: string): string {
  return cleanName(value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
}
