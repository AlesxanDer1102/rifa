import { getDb } from "@/db/client";
import { getTicketsSnapshot } from "@/lib/claim";
import { TOTAL_TICKETS } from "@/lib/constants";
import { isRegistrationClosed } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getTicketsSnapshot(getDb());
    return Response.json(
      {
        taken: snapshot.taken,
        total: TOTAL_TICKETS,
        participants: snapshot.participants,
        closed: snapshot.taken.length >= TOTAL_TICKETS || isRegistrationClosed(),
      },
      { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } },
    );
  } catch (err) {
    console.error("GET /api/tickets failed", err);
    return Response.json(
      { error: "unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
