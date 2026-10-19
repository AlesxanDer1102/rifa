import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { DrawStage, type DrawSpinView } from "@/components/admin/DrawStage";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdmin } from "@/lib/admin-session";
import { getDrawState } from "@/lib/draw";

export const metadata: Metadata = { title: "Sorteo | Rifa Pro Navidad 2026" };
export const dynamic = "force-dynamic";

export default async function DrawPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
        <LoginForm />
      </main>
    );
  }

  const state = await getDrawState(getDb());
  const spins: DrawSpinView[] = state.spins.map((s) => ({
    id: s.id,
    prizeRank: s.prizeRank,
    spinIndex: s.spinIndex,
    number: s.number,
    participantName: s.participantName,
    isWinner: s.isWinner,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-3 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Sorteo Pro Navidad</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/ganadores"
            className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
          >
            Ver ganadores
          </Link>
          <Link
            href="/admin"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Volver a administración
          </Link>
        </div>
      </div>
      <DrawStage
        initialSpins={spins}
        eligibleCount={state.eligibleCount}
      />
    </main>
  );
}
