"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { TOTAL_TICKETS } from "@/lib/constants";
import { RaffleHeader } from "./RaffleHeader";

interface TicketsResponse {
  taken: number[];
  total: number;
  participants: number;
  closed: boolean;
}

const fetcher = async (url: string): Promise<TicketsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo cargar la disponibilidad");
  return res.json();
};

const BLOCK_SIZE = 100;
const BLOCK_COUNT = Math.ceil(TOTAL_TICKETS / BLOCK_SIZE);
const blockRange = (i: number): [number, number] => [
  i * BLOCK_SIZE + 1,
  Math.min((i + 1) * BLOCK_SIZE, TOTAL_TICKETS),
];

/** Public, read-only view of free and taken numbers. No member verification required. */
export function AvailabilityBoard() {
  const { data, error } = useSWR<TicketsResponse>("/api/tickets", fetcher, {
    refreshInterval: 5000,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  const [block, setBlock] = useState<"all" | number>("all");

  const taken = useMemo(() => new Set(data?.taken ?? []), [data?.taken]);
  const takenCount = data?.taken.length;
  const freeCount = takenCount === undefined ? undefined : TOTAL_TICKETS - takenCount;

  const [from, to] = block === "all" ? [1, TOTAL_TICKETS] : blockRange(block);
  const cells = [];
  for (let n = from; n <= to; n++) {
    const isTaken = taken.has(n);
    cells.push(
      <li
        key={n}
        aria-label={`Número ${n}, ${isTaken ? "ocupado" : "libre"}`}
        className={`flex h-10 items-center justify-center rounded-md border text-sm tabular-nums ${
          isTaken
            ? "border-slate-200 bg-slate-200 text-slate-400 line-through"
            : "border-brand-300 bg-brand-50 text-brand-900"
        }`}
      >
        {n}
      </li>,
    );
  }

  const tabClass = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm whitespace-nowrap ${
      active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-4 pb-24">
      <RaffleHeader taken={takenCount} participants={data?.participants} />

      <section className="space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Disponibilidad de números</h2>
          <ul className="flex gap-4 text-sm" aria-live="polite">
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-4 w-4 rounded border border-brand-300 bg-brand-50" />
              Libres: <strong className="tabular-nums">{freeCount ?? "…"}</strong>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-4 w-4 rounded border border-slate-200 bg-slate-200" />
              Ocupados: <strong className="tabular-nums">{takenCount ?? "…"}</strong>
            </li>
          </ul>
        </div>

        {error && !data && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            No se pudo cargar la disponibilidad. Reintentando...
          </p>
        )}
        {data?.closed && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">
            El registro está cerrado.
          </p>
        )}

        <nav aria-label="Filtrar por bloques" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={block === "all"} onClick={() => setBlock("all")} className={tabClass(block === "all")}>
            Todos
          </button>
          {Array.from({ length: BLOCK_COUNT }, (_, i) => {
            const [bFrom, bTo] = blockRange(i);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={block === i}
                onClick={() => setBlock(i)}
                className={tabClass(block === i)}
              >
                {bFrom}–{bTo}
              </button>
            );
          })}
        </nav>

        <ul
          aria-label={`Números del ${from} al ${to}`}
          className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12"
        >
          {cells}
        </ul>
      </section>

      {!data?.closed && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <Link
              href="/"
              className="block w-full rounded-md bg-brand-700 px-4 py-3 text-center font-semibold text-white hover:bg-brand-800"
            >
              Registrar mis números
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
