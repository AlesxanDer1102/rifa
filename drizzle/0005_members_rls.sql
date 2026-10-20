-- Same rationale as 0001_enable_rls: block Supabase PostgREST (anon/authenticated)
-- from the roster and the attempt log. The server connects as the owner role.
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dni_attempts" ENABLE ROW LEVEL SECURITY;
