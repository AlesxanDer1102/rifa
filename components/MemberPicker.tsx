"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { normalizeForSearch } from "@/lib/name";

export interface PickedMember {
  id: string;
  fullName: string;
}

interface MemberItem extends PickedMember {
  participated: boolean;
}

const fetcher = async (url: string): Promise<{ members: MemberItem[] }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo cargar la lista");
  return res.json();
};

export function MemberPicker({ onSelect }: { onSelect: (member: PickedMember) => void }) {
  const [query, setQuery] = useState("");
  const { data, error } = useSWR("/api/members", fetcher, {
    refreshInterval: 10000,
    refreshWhenHidden: false,
    keepPreviousData: true,
  });

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    const all = data?.members ?? [];
    return q ? all.filter((m) => normalizeForSearch(m.fullName).includes(q)) : all;
  }, [data, query]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="memberSearch" className="mb-1 block text-sm font-medium">
          Busca tu nombre
        </label>
        <input
          id="memberSearch"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Apellidos o nombres"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-brand-700"
        />
      </div>
      {!data ? (
        <p role="status" className="py-6 text-center text-sm text-slate-600">
          {error ? "No se pudo cargar la lista. Reintentando..." : "Cargando lista..."}
        </p>
      ) : (
        <ul
          aria-label="Afiliados"
          className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-500">
              No se encontró ningún nombre. Revisa la ortografía.
            </li>
          )}
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={m.participated}
                onClick={() => onSelect({ id: m.id, fullName: m.fullName })}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-slate-50"
              >
                <span>{m.fullName}</span>
                {m.participated && (
                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Ya participó
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
