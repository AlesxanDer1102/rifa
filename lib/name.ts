/** Trim and collapse internal whitespace. */
export function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Normalized identity key for a participant: NFD, no diacritics, lowercase,
 * collapsed spaces. "José  Pérez" and "jose perez" yield the same key.
 */
export function makeNameKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
