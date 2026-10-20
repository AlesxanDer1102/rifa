# Rifa Pro Navidad 2026 (SINATPSI)

Raffle web app: 1056 tickets (numbers 1..1056), S/ 10 each. Only the 88 eligible SINATPSI members (closed roster) can take part; each picks exactly 12 numbers, once. Prizes: TV, air fryer, cookware set. Draw date: 2026-10-30. The UI is in Spanish; code and docs are in English. See `docs/ANALYSIS.md` for the full analysis.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase Postgres (`postgres` driver via the transaction pooler), Drizzle ORM, Zod, SWR, Vitest.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run db:migrate           # applies ./drizzle/*.sql to DATABASE_URL_UNPOOLED
npm run dev
```

Other scripts: `npm run import:members -- <roster.xlsx> [--dry-run]`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:generate` (after changing `db/schema.ts`).

## Environment variables

| Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **Transaction pooler** URI (port 6543), used by the app |
| `DATABASE_URL_UNPOOLED` | for migrations | Supabase **Session pooler** (or direct) URI (port 5432), used by `db:migrate`; falls back to `DATABASE_URL` |
| `DNI_PEPPER` | yes | Secret (32+ chars) used to HMAC member DNIs. Set before importing the roster; never change it afterwards |
| `ADMIN_PASSWORD` | yes | Password for `/admin` |
| `ADMIN_SESSION_SECRET` | yes | HMAC secret for the admin cookie, 32+ chars |
| `REGISTRATION_CLOSES_AT` | no | ISO 8601 deadline, e.g. `2026-10-30T12:00:00-05:00`. Empty means no deadline |

Env vars are validated lazily with Zod (`lib/env.ts`), so `next build` needs no secrets; the first request fails with a clear message if one is missing.

## Create the database (Supabase)

Full step-by-step guide (connection strings, migrations, Vercel, troubleshooting): [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

1. Create a Supabase project. Choose region **South America (São Paulo) `sa-east-1`**, next to the Vercel `gru1` functions.
2. Project Settings -> Database -> Connection string: copy **Transaction pooler** (port 6543) into `DATABASE_URL`, and **Session pooler** (or Direct connection, port 5432) into `DATABASE_URL_UNPOOLED`.
3. Run migrations once: `npm run db:migrate` (reads `.env.local` / `.env` / the environment; never goes through the transaction pooler).
4. The `0001_enable_rls` and `0005_members_rls` migrations enable Row Level Security with no policies on every table, so Supabase's auto REST API (anon key) can read nothing; the server connects as the `postgres` owner role, which bypasses RLS.

Alternative: the Vercel Marketplace Supabase integration injects `POSTGRES_URL` (pooled) and `POSTGRES_URL_NON_POOLING`; map them to `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in the Vercel env vars.

Note: free Supabase projects pause after ~7 days of inactivity. Open the dashboard and restore the project before launch day.

## Deploy to Vercel

1. Import the repo in Vercel and set the env vars above (Production).
2. Functions run in `gru1` (`vercel.json`).
3. Deploy. Run `npm run db:migrate` against the production `DATABASE_URL_UNPOOLED` before the first deploy and after any schema change.

### Rate limiting

Failed DNI attempts are limited in the database (5 per member and 30 per IP per 15 minutes; see "Member roster"). There is no other in-app rate limiter (in-memory counters are unreliable on serverless). Enable a **Vercel Firewall** rate-limit rule instead: Project -> Firewall -> Rules -> add a rate limit on `POST /` (Server Actions are POSTs to the page path), e.g. 10 requests/minute per IP, action "Too Many Requests". Do the same for `POST /admin` to slow down password guessing.

## Member roster and access

Access is a closed roster instead of a shared code. The `members` table holds the 88 eligible members (`full_name`, `office`, `unit`, `dni_hash`); **raw DNIs are never stored or committed**, only `HMAC-SHA256(DNI_PEPPER, dni)`.

1. Set `DNI_PEPPER` (keep a backup: without it nobody can verify a DNI).
2. Run the migrations (`npm run db:migrate`). Migration `0004` fails if `participants` still has legacy name-based rows: release them first (`delete from participants;`).
3. Import the roster (reads the xlsx locally, upserts by `dni_hash`, so it is safe to re-run):
   ```bash
   npm run import:members -- "path/to/roster.xlsx" --dry-run   # parse + report only, no DB access
   npm run import:members -- "path/to/roster.xlsx"
   ```
   Rows with `SITUACION == "CON LICENCIA"` are excluded; the script aborts unless exactly 88 members with unique 8-digit DNIs remain.
4. Public flow: pick your name (search is accent/case-insensitive) -> enter your DNI -> choose 12 numbers. A correct DNI sets a signed, httpOnly, `SameSite=Strict` cookie valid for 15 minutes; the claim endpoint derives the participant from that cookie only. `participants.member_id` is UNIQUE, so a member can participate once (enforced inside the atomic claim).
5. Brute force: failed attempts are stored in `dni_attempts` (only an HMAC of the IP); 5 failures per member or 30 per IP within 15 minutes lock further checks until they expire. Errors are generic ("DNI incorrecto").
6. `GET /api/members` returns only `id`, `fullName` and `participated`.

## Operating the raffle (admins)

- Open `/admin` and sign in with `ADMIN_PASSWORD` (12 h session, httpOnly cookie).
- Search participants by name or number.
- **Liberar** deletes a participant's registration and frees all their numbers immediately; the member stays in the roster and can participate again.
- **Exportar CSV** downloads `Nombre completo, Oficina, Unidad, Números, Fecha` (UTF-8 with BOM, dates in America/Lima).
- Names appear only in the admin panel; the public grid shows free/taken only.

## Concurrency design

- `tickets.number` is the primary key: the database, not app code, guarantees a number can have only one owner.
- A claim is ONE SQL statement (`WITH p AS (INSERT participants ... RETURNING id) INSERT tickets ... SELECT unnest(...)`), so it is all-or-nothing: no partial sets and no orphan participants, without interactive transactions (a good fit for the transaction pooler).
- On a unique violation the server inspects the constraint, re-reads which of the 12 numbers are taken, and returns `conflict` with that list; the UI keeps the rest of the selection.
- `participants.member_id` is UNIQUE, so a second registration by the same member is rejected atomically (parallel claims included).
- `GET /api/tickets` is CDN-cached (`s-maxage=2, stale-while-revalidate=5`), so ~88 clients polling every 3 s cost about one DB read every 2 s. Polling pauses in hidden tabs.

Tests (`npm test`) run the generated migration on PGlite, including 10 parallel claims for the same number (exactly one wins).
