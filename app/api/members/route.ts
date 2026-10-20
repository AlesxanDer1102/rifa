import { getDb } from "@/db/client";
import { listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

/** Public roster for the picker: id, name and participation flag only (no DNI, no hash). */
export async function GET() {
  try {
    const members = await listMembers(getDb());
    return Response.json(
      { members },
      { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } },
    );
  } catch (err) {
    console.error("GET /api/members failed", err);
    return Response.json(
      { error: "unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
