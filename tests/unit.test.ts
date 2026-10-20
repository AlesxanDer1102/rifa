import { describe, expect, it } from "vitest";
import { cleanName, normalizeForSearch } from "@/lib/name";
import { claimSchema } from "@/lib/schemas";
import { range } from "./helpers";

const base = { memberId: "6f1c1f0e-8f0e-4c53-9d8e-0c4f4f0d2a11" };

describe("name normalization", () => {
  it("collapses whitespace", () => {
    expect(cleanName("  José   Luis ")).toBe("José Luis");
  });

  it("normalizes for accent- and case-insensitive search", () => {
    expect(normalizeForSearch("  José  LUIS Pérez ")).toBe("jose luis perez");
    expect(normalizeForSearch("Ñandú")).toBe("nandu");
    expect(normalizeForSearch("MUÑOZ").includes(normalizeForSearch("muno"))).toBe(true);
  });
});

describe("claim schema", () => {
  it("accepts exactly 12 distinct in-range integers", () => {
    const parsed = claimSchema.safeParse({ ...base, numbers: range(1, 12) });
    expect(parsed.success).toBe(true);
    expect(claimSchema.safeParse({ ...base, numbers: [1045, ...range(1, 10), 1056] }).success).toBe(true);
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
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), 1057] }).success).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), 12.5] }).success).toBe(false);
    expect(claimSchema.safeParse({ ...base, numbers: [...range(1, 11), "12"] }).success).toBe(false);
  });

  it("requires a valid member id", () => {
    expect(claimSchema.safeParse({ memberId: "nope", numbers: range(1, 12) }).success).toBe(false);
    expect(claimSchema.safeParse({ numbers: range(1, 12) }).success).toBe(false);
  });
});
