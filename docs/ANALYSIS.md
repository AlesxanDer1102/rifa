# Rifa Pro Navidad 2026 — Stack & Requirements Analysis

Source data: `RIFAS PRO NAVIDAD V3.xlsx` (SINATPSI). 89 members x 12 tickets = **1068 tickets** (numbers 1..1068), S/ 10 each, draw on 2026-10-30.

---

## 1. Stack analysis

### 1.1 "No backend" — clarification

A browser can never talk to Postgres directly and safely: the connection string would be public and anyone could rewrite the table. What we really want is **no separate backend project**. Next.js gives us that: Server Actions and Route Handlers run as serverless functions on Vercel, in the same repo and deploy as the UI.

### 1.2 Chosen stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Full-stack in one project, first-class on Vercel |
| Database | **Supabase Postgres** (region `sa-east-1`) | Managed Postgres with a free tier, used only as a plain database from the server (no Supabase client SDK) |
| DB driver | `postgres` (postgres.js) via the transaction pooler, `prepare: false` | Supavisor pools connections for serverless functions; prepared statements are unsupported in transaction mode |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Typed schema, plain SQL when needed, light on cold starts |
| Validation | **Zod** | Same schema validates client form and server action |
| Live grid | **Polling a CDN-cached endpoint** (SWR, ~3 s) | Vercel functions cannot hold WebSockets, and with 89 users polling is enough |
| UI | Tailwind CSS | Fast, responsive 1068-cell grid |

**Alternative considered: Neon** (serverless Postgres over HTTP, Vercel Marketplace). It would also work. We use Supabase strictly as Postgres; its Realtime push is not used, and the 3 s polling stays. RLS is enabled with no policies so the auto-generated REST API exposes nothing.

**Verdict:** the stack is right, as long as "no backend" is read as "no separate server".

---

## 2. Risks & how the design handles them

### 2.1 Concurrency (the core problem)
Expect everyone to open the WhatsApp link at the same time, and popular numbers (7, 13, 100, 777...) will collide.

- **The DB is the only source of truth.** `tickets.number` is the **PRIMARY KEY**, so two people physically cannot own the same number.
- **Atomic claim in ONE SQL statement.** The participant insert and the 12 ticket inserts go into a single CTE. A unique violation aborts the whole statement, so nobody ends up with 11 numbers or as an orphan participant:
  ```sql
  WITH p AS (
    INSERT INTO participants (first_name, last_name, name_key)
    VALUES ($1, $2, $3) RETURNING id
  )
  INSERT INTO tickets (number, participant_id)
  SELECT unnest($4::int[]), p.id FROM p;
  ```
- **Conflict UX.** On a violation, the server re-reads which of the 12 are now taken and returns them. The UI marks them red, keeps the other picks, and asks the user to replace only those. Nothing is lost.
- **No temporary holds/locks.** Holds need TTL cleanup, abandoned-hold handling and a much bigger state machine. Optimistic claim + live grid + conflict recovery is simpler and correct. (We can revisit this if collisions turn out to be painful in practice.)

### 2.2 Exactly 12, valid, distinct
Validated **on the server** (never trust the client): exactly 12 integers, all distinct, each in 1..1068. A DB `CHECK (number BETWEEN 1 AND 1068)` backs this up.

### 2.3 Same person registering twice
`participants.member_id` is **UNIQUE**: each roster member can participate once, enforced by the database inside the atomic claim. Fake names are impossible because identity comes from the roster (see 2.4).

### 2.4 Abuse / identity — **DECIDED: closed member roster, personal code = DNI**
- Only the 88 eligible SINATPSI members (the 5 "CON LICENCIA" are excluded) are in the `members` table. Raw DNIs are never stored: only `HMAC-SHA256(DNI_PEPPER, dni)`.
- Members pick their name from a list and prove identity with their DNI (constant-time compare). A signed, httpOnly, `SameSite=Strict`, 15-minute cookie bound to the member id authorizes the claim.
- Failed DNI attempts are limited in the database (5 per member, 30 per IP, per 15 minutes).
- Admins can still release a participant; the member can then participate again.
- Note: 88 members x 12 = 1056 numbers, so 12 of the 1068 numbers will remain unsold.

### 2.4.1 Public visibility — **DEFAULT: free/taken only**
The public grid shows only free/taken, and names are visible only in the admin panel (privacy-safe default, Ley 29733).

### 2.5 Capacity
1068 / 12 = exactly 89 participants. Once all numbers are taken, the registration form closes by itself. The last participants get whatever is left, which is expected.

### 2.6 Polling cost on Vercel
89 users x 1 req / 3 s directly to functions would burn invocations and DB queries. The fix: `GET /api/tickets` returns a compact list of taken numbers with `Cache-Control: s-maxage=2, stale-while-revalidate`. The Vercel CDN answers almost every request, and the DB is hit about once every 2 s **total**. Polling also pauses while the tab is hidden. After a successful claim the client revalidates right away.

### 2.7 Privacy (Peru, Ley 29733)
See 2.4.1: the public grid shows free/taken only.

### 2.8 Deadline
`REGISTRATION_CLOSES_AT` env var (America/Lima). After it passes, the server action refuses claims and the UI shows "closed".

### 2.9 Corrections
Users cannot edit or cancel after confirming (this avoids races and disputes). An admin can release a participant's numbers.

### 2.10 Ops
- Deploy the Vercel function region close to the Supabase region (`gru1` São Paulo ↔ Supabase `sa-east-1`) to keep latency low from Peru.
- Migrations run with drizzle-kit before the first deploy.
- Basic rate limiting per IP on the claim action. It goes in-DB or uses Vercel's firewall, to keep things simple.

---

## 3. Requirements

### 3.1 Functional
- **FR-1** Landing page shows the raffle info (prizes, price, draw date) and progress (`X / 1068 taken`, `Y / 89 participants`).
- **FR-2** The user enters **first name(s) and last name(s)** (both required, 2–60 chars) *before* picking numbers.
- **FR-3** An interactive grid of 1068 numbers with three states: free, taken (disabled), selected by me. The user can jump to a number and filter by blocks of 100. It is responsive on mobile.
- **FR-4** The user must select **exactly 12**. A counter shows `n / 12`, and confirm is enabled only at 12. There is a "random fill" helper for the remaining slots.
- **FR-5** The grid refreshes live (≤ ~3 s) while others claim, and numbers taken by others disappear from my selection with a notice.
- **FR-6** Confirmation is atomic. On success, show the receipt (name + 12 numbers) with a printable/screenshot view.
- **FR-7** On conflict, highlight the lost numbers and keep the rest so the user can replace and retry.
- **FR-8** Duplicate full names are rejected with a clear message.
- **FR-9** Registration closes when all 1068 are taken or the deadline passes.
- **FR-10** Admin page (password from env): table of participants and their numbers, search, **CSV export**, release a participant.

### 3.2 Non-functional
- **NFR-1** No double assignment under any concurrency (enforced by DB constraints, not app code).
- **NFR-2** All validation is server-side, and secrets live only in server env vars.
- **NFR-3** Works on low-end mobile on 4G, and the grid renders in under 1 s.
- **NFR-4** UI language is Spanish (audience). Code and docs are in English.
- **NFR-5** Free tiers: Vercel Hobby + Supabase Free.

### 3.3 Data model
```
participants(id uuid pk, first_name text, last_name text,
             name_key text unique, created_at timestamptz default now())
tickets(number int pk check (number between 1 and 1068),
        participant_id uuid not null references participants(id) on delete cascade,
        created_at timestamptz default now())
```
A participant row with no tickets cannot exist, thanks to the single-statement CTE. Releasing a participant is a `DELETE` that cascades.

### 3.4 Out of scope
Online payment, running the draw itself, and email/SMS notifications.

---

## 4. Implementation plan (after decisions)
1. Scaffold Next.js + TS + Tailwind + Drizzle in `rifa/`.
2. Schema + migration and the seed-free DB (tickets exist only when claimed).
3. `GET /api/tickets` (cached) and `claimTickets` server action (Zod + atomic CTE + conflict reporting).
4. Grid UI, the selection state, and polling.
5. Admin page + CSV.
6. Tests: a concurrency test firing parallel claims at the same numbers, checking that exactly one wins.
7. Vercel + Supabase setup guide (`README.md`).
