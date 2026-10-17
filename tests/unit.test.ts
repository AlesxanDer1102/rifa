import { describe, expect, it } from "vitest";
import { cleanName, makeNameKey } from "@/lib/name";
import { claimSchema } from "@/lib/schemas";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const base = { firstName: "Ana María", lastName: "Pérez Soto" };

describe("name normalization", () => {
  it("collapses whitespace", () => {
    expect(cleanName("  José   Luis ")).toBe("José Luis");
  });

  it("strips diacritics, lowercases and collapses spaces", () => {
    expect(makeNameKey("José  Luis", "Pérez")).toBe("jose luis perez");
    expect(makeNameKey("jose luis", "PEREZ")).toBe(makeNameKey("José Luis", "Pérez"));
    expect(makeNameKey("Ñandú", "Muñoz")).toBe("nandu munoz");
  });
});

describe("claim schema", () => {
  it("accepts exactly 12 distinct in-range integers", () => {
    const parsed = claimSchema.safeParse({ ...base, numbers: range(1, 12) });
    expect(parsed.success).toBe(true);
    expect(claimSchema.safeParse({ ...base, numbers: [1057, ...range(1, 10), 1068] }).success).toBe(true);
  });

  it("rejects 11 and 13 numbers", () => {
    expect(claimSchema.safeParse({ ...base, numbers: range(1, 11) }).success).toBe(false);
    expect(claimSchema.safeParse({ ...base, numbers: range(1, 13) }).success).toBe(false);
  });

  it("rejects duplicates", () => {
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), 1] }).success).toBe(false);
  });

  it("rejects out-of-range numbers", () => {
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), 0] }).success).toBe(false);
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), 1069] }).success).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), 12.5] }).success).toBe(false);
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), "12"] }).success).toBe(false);
  });

  it("validates and cleans names", () => {
    const ok = claimSchema.safeParse({ firstName: "  Ana   María ", lastName: "Pérez", numbers: range(1, 12) });
    expect(ok.success && ok.data.firstName).toBe("Ana María");
    expect(claimSchema.safeParse({ firstName: "A", lastName: "Pérez", numbers: range(1, 12) }).success).toBe(false);
    expect(
      claimSchema.safeParse({ firstName: "x".repeat(61), lastName: "Pérez", numbers: range(1, 12) }).success,
    ).toBe(false);
  });
});
