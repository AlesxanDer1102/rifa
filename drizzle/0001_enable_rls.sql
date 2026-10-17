-- Supabase exposes the public schema through PostgREST. Enabling RLS with no
-- policies denies anon/authenticated roles; the server connects as the table
-- owner (postgres role), which bypasses RLS.
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
