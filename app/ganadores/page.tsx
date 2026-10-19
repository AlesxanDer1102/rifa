import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { DrawRules } from "@/components/DrawRules";
import { WinnersAutoRefresh } from "@/components/WinnersAutoRefresh";
import { DRAW_DATE_LABEL, PRIZES } from "@/lib/constants";
import { listWinners } from "@/lib/draw";

export const metadata: Metadata = { title: "Ganadores | Rifa Pro Navidad 2026 | SINATPSI" };
export const dynamic = "force-dynamic";

export default async function WinnersPage() {
  const winners = await listWinners(getDb());
  const byRank = new Map(winners.map((w) => [w.prizeRank, w]));
  const complete = winners.length >= PRIZES.length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-3 py-6 sm:px-6">
      <WinnersAutoRefresh active={!complete} />
      <header className="rounded-xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">SINATPSI</p>
        <h1 className="text-3xl font-bold sm:text-4xl">Ganadores de la Rifa Pro Navidad 2026</h1>
        <p className="mt-2 text-slate-700">
          {winners.length === 0
            ? `Aún no hay ganadores. El sorteo es el ${DRAW_DATE_LABEL}. ¡Mucha suerte!`
            : complete
              ? "¡Felicitaciones a todos los ganadores!"
              : "El sorteo está en curso. Esta página se actualiza sola."}
        </p>
        <div className="mt-4 text-left">
          <DrawRules />
        </div>
      </header>

      <ol className="space-y-3">
        {PRIZES.map((prize, i) => {
          const winner = byRank.get((i + 1) as 1 | 2 | 3);
          const padded = winner ? String(winner.number).padStart(4, "0") : "";
          return (
            <li
              key={prize.place}
              className={
                winner
                  ? "rounded-xl bg-amber-50 p-5 shadow-sm ring-2 ring-amber-400"
                  : "rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{prize.place}</p>
              <p className="text-lg font-bold">{prize.name}</p>
              {winner ? (
                <div className="mt-3 flex items-center gap-4">
                  <span
                    aria-label={`Número ganador ${padded}`}
                    className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-2xl font-bold tabular-nums text-white sm:text-3xl"
                  >
                    {padded}
                  </span>
                  <p className="min-w-0 break-words text-lg font-semibold text-slate-900">
                    {winner.participantName}
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-sm font-medium text-slate-500">
                  Por sortear
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
