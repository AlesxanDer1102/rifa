import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { AdminTable } from "@/components/admin/AdminTable";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdmin } from "@/lib/admin-session";
import { listParticipants } from "@/lib/claim";
import { TOTAL_PARTICIPANTS, TOTAL_TICKETS } from "@/lib/constants";
import { formatLima } from "@/lib/csv";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Administración | Rifa Pro Navidad 2026" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
        <LoginForm />
      </main>
    );
  }

  const rows = await listParticipants(getDb());
  const serialized = rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    numbers: r.numbers,
    createdAt: formatLima(r.createdAt),
  }));
  const totalTickets = rows.reduce((sum, r) => sum + r.numbers.length, 0);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-3 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Administración de la rifa</h1>
        <div className="flex gap-2">
          <a
            href="/admin/export"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Exportar CSV
          </a>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
      <p className="text-sm text-slate-700">
        Participantes: <strong>{rows.length}</strong> / {TOTAL_PARTICIPANTS} - Números ocupados:{" "}
        <strong>{totalTickets}</strong> / {TOTAL_TICKETS}
      </p>
      <AdminTable rows={serialized} />
    </main>
  );
}
