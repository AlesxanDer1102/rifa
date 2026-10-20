import { describe, expect, it } from "vitest";
import { parseRoster, type RawRosterRow } from "@/lib/roster";

const row = (n: number, over: Partial<RawRosterRow> = {}): RawRosterRow => ({
  dni: String(n).padStart(8, "0"),
  fullName: `APELLIDO${n} NOMBRE${n}`,
  office: "OFICINA",
  unit: "UNIDAD",
  status: "ACTIVO",
  ...over,
});

describe("parseRoster", () => {
  it("excludes CON LICENCIA and keeps SUSPENDIDO / DESCANSO M. as eligible", () => {
    const rows = [
      row(1),
      row(2, { status: "SUSPENDIDO" }),
      row(3, { status: "DESCANSO M." }),
      row(4, { status: " con  licencia " }),
    ];
    const { eligible, excluded } = parseRoster(rows, 3);
    expect(eligible.map((m) => m.dni)).toEqual(["00000001", "00000002", "00000003"]);
    expect(excluded).toEqual([{ fullName: "APELLIDO4 NOMBRE4", status: "CON LICENCIA" }]);
  });

  it("normalizes whitespace and keeps accents and leading zeros", () => {
    const { eligible } = parseRoster([row(7, { fullName: "  MUÑOZ   PEÑA  JOSÉ ÁNGEL ", office: " LIMA  SUR " })], 1);
    expect(eligible[0]).toMatchObject({
      dni: "00000007",
      fullName: "MUÑOZ PEÑA JOSÉ ÁNGEL",
      office: "LIMA SUR",
    });
  });

  it("fails loudly on a wrong count", () => {
    expect(() => parseRoster([row(1), row(2)], 3)).toThrow(/Expected exactly 3/);
  });

  it("fails on malformed DNIs without echoing them", () => {
    for (const dni of ["1234567", "123456789", "1234567a", ""]) {
      let message = "";
      try {
        parseRoster([row(1, { dni })], 1);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/Invalid DNI format/);
      if (dni) expect(message).not.toContain(dni);
    }
  });

  it("fails on duplicate DNIs among eligible members", () => {
    expect(() => parseRoster([row(1), row(2, { dni: row(1).dni })], 2)).toThrow(/Duplicate DNI/);
  });

  it("ignores the DNI of excluded members", () => {
    expect(parseRoster([row(1), row(2, { status: "CON LICENCIA", dni: "x" })], 1).eligible).toHaveLength(1);
  });
});
