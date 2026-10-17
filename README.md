# Rifa Pro Navidad 2026 (SINATPSI)

Raffle web app: 1068 tickets (numbers 1..1068), S/ 10 each. Every participant picks exactly 12 numbers, so there are 89 participants. Prizes: TV, air fryer, cookware set. Draw date: 2026-10-30. The UI is in Spanish; code and docs are in English. See `docs/ANALYSIS.md` for the full analysis.

Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase Postgres (`postgres` driver via the transaction pooler), Drizzle ORM, Zod, SWR, Vitest.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run db:migrate           # applies ./drizzle/*.sql to DATABASE_URL_UNPOOLED
npm run dev
```

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:generate` (after changing `db/schema.ts`).

## Environment variables

| Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **Transaction pooler** URI (port 6543), used by the app |
| `DATABASE_URL_UNPOOLED` | for migrations | Supabase **Session pooler** (or direct) URI (port 5432), used by `db:migrate`; falls back to `DATABASE_URL` |
| `ACCESS_CODE` | yes | Shared group code sent through WhatsApp |
| `ADMIN_PASSWORD` | yes | Password for `/admin` |
| `ADMIN_SESSION_SECRET` | yes | HMAC secret for the admin cookie, 32+ chars |
| `REGISTRATION_CLOSES_AT` | no | ISO 8601 deadline, e.g. `2026-10-30T12:00:00-05:00`. Empty means no deadline |

Env vars are validated lazily with Zod (`lib/env.ts`), so `next build` needs no secrets; the first request fails with a clear message if one is missing.

## Create the database (Supabase)

Full step-by-step guide (connection strings, migrations, Vercel, troubleshooting): [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

1. Create a Supabase project. Choose region **South America (São Paulo) `sa-east-1`**, next to the Vercel `gru1` functions.
2. Project Settings -> Database -> Connection string: copy **Transaction pooler** (port 6543) into `DATABASE_URL`, and **Session pooler** (or Direct connection, port 5432) into `DATABASE_URL_UNPOOLED`.
3. Run migrations once: `npm run db:migrate` (reads `.env.local` / `.env` / the environment; never goes through the transaction pooler).
4. The `0001_enable_rls` migration enables Row Level Security with no policies on both tables, so Supabase's auto REST API (anon key) can read nothing; the server connects as the `postgres` owner role, which bypasses RLS.

Alternative: the Vercel Marketplace Supabase integration injects `POSTGRES_URL` (pooled) and `POSTGRES_URL_NON_POOLING`; map them to `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in the Vercel env vars.

Note: free Supabase projects pause after ~7 days of inactivity. Open the dashboard and restore the project before launch day.

## Deploy to Vercel

1. Import the repo in Vercel and set the env vars above (Production).
2. Functions run in `gru1` (`vercel.json`).
3. Deploy. Run `npm run db:migrate` against the production `DATABASE_URL_UNPOOLED` before the first deploy and after any schema change.

### Rate limiting

There is no in-app rate limiter (in-memory counters are unreliable on serverless). Enable a **Vercel Firewall** rate-limit rule instead: Project -> Firewall -> Rules -> add a rate limit on `POST /` (Server Actions are POSTs to the page path), e.g. 10 requests/minute per IP, action "Too Many Requests". Do the same for `POST /admin` to slow down password guessing.

## Operating the raffle (admins)

- Open `/admin` and sign in with `ADMIN_PASSWORD` (12 h session, httpOnly cookie).
- Search participants by name or number.
- **Liberar** deletes a participant (fake or duplicate entry) and frees all their numbers immediately.
- **Exportar CSV** downloads `Nombres, Apellidos, Números, Fecha` (UTF-8 with BOM, dates in America/Lima).
- Names appear only in the admin panel; the public grid shows free/taken only.

## Concurrency design

- `tickets.number` is the primary key: the database, not app code, guarantees a number can have only one owner.
- A claim is ONE SQL statement (`WITH p AS (INSERT participants ... RETURNING id) INSERT tickets ... SELECT unnest(...)`), so it is all-or-nothing: no partial sets and no orphan participants, without interactive transactions (a good fit for the transaction pooler).
- On a unique violation the server inspects the constraint, re-reads which of the 12 numbers are taken, and returns `conflict` with that list; the UI keeps the rest of the selection.
- `name_key` (accent/case-insensitive full name) is UNIQUE, so duplicate registrations are rejected atomically.
- `GET /api/tickets` is CDN-cached (`s-maxage=2, stale-while-revalidate=5`), so ~89 clients polling every 3 s cost about one DB read every 2 s. Polling pauses in hidden tabs.

Tests (`npm test`) run the generated migration on PGlite, including 10 parallel claims for the same number (exactly one wins).
