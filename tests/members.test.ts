import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dniAttempts, schema } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { claimTicketNumbers } from "@/lib/claim";
import {
  DNI_ATTEMPT_WINDOW_MS,
  DNI_MAX_ATTEMPTS_PER_IP,
  DNI_MAX_ATTEMPTS_PER_MEMBER,
} from "@/lib/constants";
import { listMembers, verifyMemberDni } from "@/lib/members";
import { insertMember, PEPPER, range, resetDb } from "./helpers";

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as AppDb;

// The route handler is exercised against the PGlite database.
vi.mock("@/db/client", () => ({ getDb: () => db }));

const DNI = "12345678";
const WRONG = "87654321";
const login = (memberId: string, dni: string, extra: { ip?: string; now?: Date } = {}) =>
  verifyMemberDni(db, { memberId, dni, ip: extra.ip ?? "1.1.1.1", pepper: PEPPER, now: extra.now });

beforeEach(async () => {
  await resetDb(client);
});

afterAll(async () => {
  await client.close();
});

describe("verifyMemberDni", () => {
  it("accepts the correct DNI and returns the member", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    expect(await login(id, DNI)).toEqual({ ok: true, member: { id, fullName: "PEREZ ANA" } });
  });

  it("rejects a wrong DNI, malformed input and unknown members with generic results", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    expect(await login(id, WRONG)).toEqual({ ok: false, reason: "incorrect" });
    expect(await login(id, "1234")).toEqual({ ok: false, reason: "invalid" });
    expect(await login(id, "abcdefgh")).toEqual({ ok: false, reason: "invalid" });
    expect(await login("not-a-uuid", DNI)).toEqual({ ok: false, reason: "invalid" });
    expect(await login("6f1c1f0e-8f0e-4c53-9d8e-0c4f4f0d2a11", DNI)).toEqual({
      ok: false,
      reason: "incorrect",
    });
  });

  it("refuses members who already participated", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    await claimTicketNumbers(db, { memberId: id, numbers: range(1, 12) });
    expect(await login(id, DNI)).toEqual({ ok: false, reason: "already_participated" });
  });

  it("locks a member after too many failures, even for the correct DNI", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    const now = new Date("2026-10-20T12:00:00Z");
    for (let i = 0; i < DNI_MAX_ATTEMPTS_PER_MEMBER; i++) {
      expect(await login(id, WRONG, { now })).toEqual({ ok: false, reason: "incorrect" });
    }
    expect(await login(id, DNI, { now })).toEqual({ ok: false, reason: "locked" });
    expect(await login(id, WRONG, { now })).toEqual({ ok: false, reason: "locked" });
  });

  it("unlocks once the window has passed", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    const now = new Date("2026-10-20T12:00:00Z");
    for (let i = 0; i < DNI_MAX_ATTEMPTS_PER_MEMBER; i++) await login(id, WRONG, { now });
    const later = new Date(now.getTime() + DNI_ATTEMPT_WINDOW_MS + 1000);
    expect((await login(id, DNI, { now: later })).ok).toBe(true);
  });

  it("does not let parallel guesses slip past the member limit", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    const results = await Promise.all(
      range(1, 20).map(() => login(id, WRONG, { now: new Date("2026-10-20T12:00:00Z") })),
    );
    expect(results.filter((r) => !r.ok && r.reason === "incorrect")).toHaveLength(DNI_MAX_ATTEMPTS_PER_MEMBER);
    expect(results.filter((r) => !r.ok && r.reason === "locked")).toHaveLength(20 - DNI_MAX_ATTEMPTS_PER_MEMBER);
    expect(await db.select().from(dniAttempts)).toHaveLength(DNI_MAX_ATTEMPTS_PER_MEMBER);
  });

  it("limits failures per client IP across different members", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const ids = await Promise.all(
      range(1, 10).map((i) => insertMember(db, `PERSONA ${i}`, `4000000${i}`.slice(-8))),
    );
    // 10 members x 3 failures each = 30 failures from one IP, none over the per-member cap.
    for (const id of ids) for (let i = 0; i < 3; i++) await login(id, WRONG, { now, ip: "9.9.9.9" });
    expect(DNI_MAX_ATTEMPTS_PER_IP).toBe(30);
    const fresh = await insertMember(db, "OTRA PERSONA", "50000000");
    expect(await login(fresh, "50000000", { now, ip: "9.9.9.9" })).toEqual({ ok: false, reason: "locked" });
    expect((await login(fresh, "50000000", { now, ip: "8.8.8.8" })).ok).toBe(true);
  });

  it("never stores raw IPs or DNIs in the attempt log", async () => {
    const id = await insertMember(db, "PEREZ ANA", DNI);
    await login(id, WRONG, { ip: "203.0.113.7" });
    const dump = JSON.stringify(await db.select().from(dniAttempts));
    expect(dump).not.toContain("203.0.113.7");
    expect(dump).not.toContain(WRONG);
  });
});

describe("member list", () => {
  it("exposes only id, name and participation flag, sorted by name", async () => {
    const zoe = await insertMember(db, "ZAPATA ZOE", "10000001");
    await insertMember(db, "ÁLVAREZ ANA", "10000002");
    await claimTicketNumbers(db, { memberId: zoe, numbers: range(1, 12) });
    const list = await listMembers(db);
    expect(list.map((m) => m.fullName)).toEqual(["ÁLVAREZ ANA", "ZAPATA ZOE"]);
    expect(list.map((m) => m.participated)).toEqual([false, true]);
    for (const m of list) expect(Object.keys(m).sort()).toEqual(["fullName", "id", "participated"]);
  });

  it("GET /api/members never leaks DNIs or hashes", async () => {
    await insertMember(db, "PEREZ ANA", DNI);
    const { GET } = await import("@/app/api/members/route");
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(DNI);
    expect(text.toLowerCase()).not.toContain("hash");
    expect(text).not.toMatch(/[0-9a-f]{64}/);
    const body = JSON.parse(text) as { members: Record<string, unknown>[] };
    expect(body.members).toHaveLength(1);
    expect(Object.keys(body.members[0]).sort()).toEqual(["fullName", "id", "participated"]);
  });
});
