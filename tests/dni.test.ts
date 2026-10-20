import { describe, expect, it } from "vitest";
import { hashDni, hashIp, verifyDni } from "@/lib/dni";
import { createMemberToken, verifyMemberToken } from "@/lib/member-token";
import { PEPPER } from "./helpers";

const ID = "6f1c1f0e-8f0e-4c53-9d8e-0c4f4f0d2a11";
const SECRET = "t".repeat(40);

describe("dni hashing", () => {
  it("is a deterministic keyed hash that depends on the pepper", () => {
    const h = hashDni("01234567", PEPPER);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDni("01234567", PEPPER)).toBe(h);
    expect(hashDni("01234567", PEPPER + "x")).not.toBe(h);
    expect(h).not.toContain("01234567");
  });

  it("verifies the right DNI and rejects wrong, malformed and corrupt-hash inputs", () => {
    const h = hashDni("01234567", PEPPER);
    expect(verifyDni("01234567", h, PEPPER)).toBe(true);
    expect(verifyDni("01234568", h, PEPPER)).toBe(false);
    expect(verifyDni("1234567", h, PEPPER)).toBe(false);
    expect(verifyDni("01234567", h, "other-pepper-other-pepper-other-pepper")).toBe(false);
    expect(verifyDni("01234567", "zz", PEPPER)).toBe(false);
  });

  it("hashes IPs without exposing them", () => {
    expect(hashIp("203.0.113.7", PEPPER)).not.toContain("203.0.113.7");
  });
});

describe("member session token", () => {
  it("round-trips the member id", () => {
    expect(verifyMemberToken(createMemberToken(ID, SECRET), SECRET)).toBe(ID);
  });

  it("expires after the session lifetime", () => {
    const issued = Date.UTC(2026, 9, 20, 12, 0, 0);
    const token = createMemberToken(ID, SECRET, issued);
    expect(verifyMemberToken(token, SECRET, issued + 14 * 60 * 1000)).toBe(ID);
    expect(verifyMemberToken(token, SECRET, issued + 16 * 60 * 1000)).toBeNull();
  });

  it("rejects tampering, another secret and the admin token shape", () => {
    const token = createMemberToken(ID, SECRET);
    const [v, , exp, sig] = token.split(".");
    expect(verifyMemberToken(`${v}.${ID.replace("6f1c", "6f1d")}.${exp}.${sig}`, SECRET)).toBeNull();
    expect(verifyMemberToken(`${v}.${ID}.${Number(exp) + 999}.${sig}`, SECRET)).toBeNull();
    expect(verifyMemberToken(token, "u".repeat(40))).toBeNull();
    expect(verifyMemberToken("v1.9999999999.abc", SECRET)).toBeNull();
    expect(verifyMemberToken(undefined, SECRET)).toBeNull();
  });
});
