# Supabase Connection Guide

Step-by-step guide to connect the raffle app to Supabase Postgres, locally and on Vercel.

> The app uses Supabase **only as a Postgres database**. It does not use `@supabase/supabase-js`, the anon key, Auth, or Realtime. You only need the **connection strings** and the **database password**.

---

## 1. How the app connects

| Variable | Supabase connection | Port | Used by |
|---|---|---|---|
| `DATABASE_URL` | **Transaction pooler** | `6543` | The app at runtime (Vercel functions, `npm run dev`) |
| `DATABASE_URL_UNPOOLED` | **Session pooler** | `5432` | Migrations only (`npm run db:migrate`, drizzle-kit) |

Why two URLs?
- **Transaction pooler (6543).** Serverless functions open many short-lived connections, and the pooler multiplexes them so Postgres is not exhausted. It does not support prepared statements, so `db/client.ts` sets `prepare: false`.
- **Session pooler (5432).** Migrations need a regular session, so they must not go through the transaction pooler.
- **Do not use the "Direct connection"** for migrations unless your network supports IPv6 (or you bought the IPv4 add-on). Direct connections are IPv6-only on Supabase. The session pooler works over IPv4.

---

## 2. Create the Supabase project

1. Go to https://supabase.com/dashboard and click **New project**.
2. Fill in:
   - **Name:** `rifa-pro-navidad` (any name works).
   - **Database password:** generate a strong one and **save it**. You will need it in the connection strings.
   - **Region:** **South America (São Paulo)** — `sa-east-1`. It sits next to the Vercel `gru1` functions configured in `vercel.json`, which keeps latency low from Peru.
3. Wait until the project status is **Healthy** (about 1–2 minutes).

> Tip: avoid special characters like `@ : / ? # %` in the password. If you use them, you must URL-encode them in the connection string (e.g. `@` → `%40`, `#` → `%23`).

---

## 3. Get the connection strings

1. In the project, click **Connect** (top bar), or open **Project Settings → Database → Connection string**.
2. Pick the **URI** format.
3. Copy the **Transaction pooler** string. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
4. Copy the **Session pooler** string. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the database password (without the brackets).

Check that:
- The **user** is `postgres.<project-ref>` (with the dot and project ref), not just `postgres`. Pooler connections require it.
- The **ports** are right: `6543` for `DATABASE_URL`, `5432` for `DATABASE_URL_UNPOOLED`.
- The **host** ends in `pooler.supabase.com`. (The prefix may be `aws-0` or `aws-1`; copy it exactly as shown.)

---

## 4. Local configuration

1. Create `.env.local` from the template:
   ```bash
   cp .env.example .env.local
   ```
2. Fill it in:
   ```env
   # Transaction pooler (6543) — app runtime
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   # Session pooler (5432) — migrations only
   DATABASE_URL_UNPOOLED=postgresql://postgres.<project-ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

   DNI_PEPPER=<32+ random characters, e.g. openssl rand -base64 48; never change after importing>
   ADMIN_PASSWORD=<a strong admin password>
   ADMIN_SESSION_SECRET=<32+ random characters>
   REGISTRATION_CLOSES_AT=2026-10-30T12:00:00-05:00
   ```
3. Generate `ADMIN_SESSION_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

> `.env.local` contains secrets. It is git-ignored; never commit it or share it in WhatsApp.

---

## 5. Create the tables (migrations)

Run once (and again after any schema change):

```bash
npm install
npm run db:migrate
```

This applies the SQL files in `drizzle/` through `DATABASE_URL_UNPOOLED`:
- `0000_*.sql` creates `participants` and `tickets`, with their constraints.
- `0001_enable_rls.sql` enables **Row Level Security with no policies** on `participants` and `tickets`.
- `0003`/`0004` replace the name columns of `participants` with a UNIQUE `member_id` and create `members` and `dni_attempts` (`0004` fails if `participants` still has rows: run `delete from participants;` first).
- `0005_members_rls.sql` enables RLS with no policies on `members` and `dni_attempts`.

Then import the roster (see README, "Member roster and access"): `npm run import:members -- "<roster.xlsx>"`.

**Why RLS matters:** Supabase automatically exposes the `public` schema through its REST API, using the public anon key. With RLS on and no policies, that API can read or change nothing. The app connects as the `postgres` role (the table owner), which bypasses RLS, so it keeps working normally.

### Verify in the dashboard

Open **SQL Editor** and run:

```sql
-- Both tables exist and RLS is on (rowsecurity = true)
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('participants', 'tickets', 'members', 'dni_attempts');

-- Should return 0 rows before launch
select count(*) from tickets;
```

You can also check **Table Editor**: every table should appear, without the "RLS disabled" warning.

---

## 6. Run locally

```bash
npm run dev
```

Open http://localhost:3000, pick your name, enter its DNI, pick 12 numbers and confirm. Then check in the SQL Editor:

```sql
select m.full_name, array_agg(t.number order by t.number) as numbers
from participants p join members m on m.id = p.member_id
join tickets t on t.participant_id = p.id
group by p.id, m.full_name;
```

Release that test entry from `/admin` before launch, or run `delete from participants;` (tickets are removed by cascade).

---

## 7. Production (Vercel)

### Option A — manual env vars (recommended)

1. In Vercel: **Project → Settings → Environment Variables**.
2. Add for **Production** (and Preview, if you use it):
   - `DATABASE_URL` → Transaction pooler URI (6543)
   - `DNI_PEPPER`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `REGISTRATION_CLOSES_AT`
   - `DATABASE_URL_UNPOOLED` is not needed on Vercel, because migrations run from your machine.
3. Run the migrations from your machine against the production database (step 5), **before** the first deploy.
4. Deploy (or redeploy, so the new env vars take effect).

### Option B — Vercel Marketplace integration

**Vercel → Storage → Supabase** can create or link the project and inject env vars automatically. It injects `POSTGRES_URL` (pooled) and `POSTGRES_URL_NON_POOLING`, but the app reads `DATABASE_URL`, so add `DATABASE_URL` with the value of `POSTGRES_URL`. Use `POSTGRES_URL_NON_POOLING` as `DATABASE_URL_UNPOOLED` locally for migrations.

> Check that the pooled URL uses port **6543**. If it shows 5432, take the Transaction pooler URI from the Supabase dashboard instead.

---

## 8. Before launch day

- [ ] The project is **active**. Free projects **pause after ~7 days of inactivity**: open the dashboard the day before and click *Restore* if needed.
- [ ] The migrations are applied and RLS is on (step 5).
- [ ] Test entries are deleted (`select count(*) from participants;` returns 0).
- [ ] The env vars are set in Vercel, with a redeploy done after setting them.
- [ ] The Vercel Firewall rate-limit rule is enabled (see `README.md`).
- [ ] You did one real test from two phones at once: picking the same number, exactly one wins.

---

## 9. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Invalid environment configuration: DATABASE_URL is required` | Env var missing | Fill `.env.local` / Vercel env vars and restart or redeploy |
| `Tenant or user not found` | Wrong user in the pooler URL | The user must be `postgres.<project-ref>`, not `postgres` |
| `password authentication failed` | Wrong password or unencoded special characters | Reset it in **Project Settings → Database**, or URL-encode it |
| `prepared statement "..." already exists` / `does not exist` | Prepared statements through the transaction pooler | `db/client.ts` must keep `prepare: false` |
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` / `ENETUNREACH` | Direct connection over IPv6 from an IPv4 network | Use the **Session pooler** URI for `DATABASE_URL_UNPOOLED` |
| Migration hangs or fails on port 6543 | Migration running through the transaction pooler | Set `DATABASE_URL_UNPOOLED` to the session pooler (5432) |
| `remaining connection slots are reserved` / too many clients | Too many direct connections | Use the pooler URLs; the app already uses `max: 1` per function |
| Connection timeout / project unavailable | Project paused due to inactivity | Restore it from the Supabase dashboard |
| Data visible through the REST API | RLS not enabled | Re-run `npm run db:migrate` and check `rowsecurity = true` |
