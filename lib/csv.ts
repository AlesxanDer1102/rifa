import type { ParticipantWithNumbers } from "./claim";

const limaFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatLima(date: Date): string {
  return limaFormat.format(date);
}

/** Quote a CSV cell and neutralize spreadsheet formula injection. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** UTF-8 CSV with BOM so Excel detects the encoding. */
export function buildParticipantsCsv(rows: ParticipantWithNumbers[]): string {
  const lines = [["Nombres", "Apellidos", "Números", "Fecha"].map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.firstName, r.lastName, r.numbers.join(", "), formatLima(r.createdAt)].map(csvCell).join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
