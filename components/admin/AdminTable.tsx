"use client";

import { useMemo, useState, useTransition } from "react";
import { releaseAction } from "@/app/admin/actions";
import { normalizeForSearch } from "@/lib/name";
import { ConfirmDialog } from "../ConfirmDialog";

export interface AdminRow {
  id: string;
  fullName: string;
  office: string;
  numbers: number[];
  createdAt: string;
}

export function AdminTable({ rows }: { rows: AdminRow[] }) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return rows;
    const asNumber = /^\d+$/.test(q) ? Number(q) : null;
    return rows.filter(
      (r) =>
        normalizeForSearch(r.fullName).includes(q) ||
        (asNumber !== null && r.numbers.includes(asNumber)),
    );
  }, [rows, query]);

  function onRelease() {
    if (!target) return;
    const id = target.id;
    startTransition(async () => {
      const res = await releaseAction(id);
      setTarget(null);
      setError(res.ok ? null : "No se pudo liberar al participante.");
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="search" className="mb-1 block text-sm font-medium">
          Buscar por nombre o número
        </label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">
                Participante
              </th>
              <th scope="col" className="px-3 py-2">
                Números
              </th>
              <th scope="col" className="px-3 py-2">
                Fecha (Lima)
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  Sin resultados.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">
                  {r.fullName}
                  <span className="block text-xs font-normal text-slate-500">{r.office}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{r.numbers.join(", ")}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.createdAt}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setTarget(r)}
                    className="rounded-md border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50"
                  >
                    Liberar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={target !== null}
        title="Liberar participante"
        confirmLabel="Liberar"
        tone="danger"
        busy={pending}
        onConfirm={onRelease}
        onCancel={() => setTarget(null)}
      >
        {target && (
          <p>
            Se eliminará el registro de{" "}
            <strong>{target.fullName}</strong> y se liberarán sus {target.numbers.length} números.
            Podrá volver a participar. Esta acción no se puede deshacer.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
