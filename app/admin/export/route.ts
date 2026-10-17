import { getDb } from "@/db/client";
import { isAdmin } from "@/lib/admin-session";
import { listParticipants } from "@/lib/claim";
import { buildParticipantsCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return new Response("No autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const csv = buildParticipantsCsv(await listParticipants(getDb()));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rifa-participantes-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
