"use client";

import { memo } from "react";

export type CellStatus = "free" | "taken" | "selected" | "lost";

interface CellProps {
  n: number;
  status: CellStatus;
  locked: boolean; // selection limit reached or grid not interactive
  onToggle: (n: number) => void;
}

const STATUS_LABEL: Record<CellStatus, string> = {
  free: "libre",
  taken: "ocupado",
  selected: "seleccionado",
  lost: "ya no disponible",
};

const STATUS_CLASS: Record<CellStatus, string> = {
  free: "border-slate-300 bg-white text-slate-800 hover:border-emerald-600 hover:bg-emerald-50",
  taken: "border-slate-200 bg-slate-200 text-slate-400 line-through cursor-not-allowed",
  selected: "border-emerald-700 bg-emerald-600 text-white font-semibold",
  lost: "border-red-600 bg-red-100 text-red-700 line-through cursor-not-allowed",
};

const NumberCell = memo(function NumberCell({ n, status, locked, onToggle }: CellProps) {
  const unavailable = status === "taken" || status === "lost";
  const blocked = unavailable || (locked && status === "free");
  return (
    <button
      type="button"
      id={`n-${n}`}
      aria-pressed={status === "selected"}
      aria-label={`Número ${n}, ${STATUS_LABEL[status]}`}
      disabled={blocked}
      onClick={() => onToggle(n)}
      className={`h-10 rounded-md border text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${STATUS_CLASS[status]} ${
        blocked && !unavailable ? "opacity-50" : ""
      }`}
    >
      {n}
    </button>
  );
});

interface GridProps {
  from: number;
  to: number;
  taken: ReadonlySet<number>;
  selected: ReadonlySet<number>;
  lost: ReadonlySet<number>;
  limitReached: boolean;
  onToggle: (n: number) => void;
}

export const NumberGrid = memo(function NumberGrid({
  from,
  to,
  taken,
  selected,
  lost,
  limitReached,
  onToggle,
}: GridProps) {
  const cells = [];
  for (let n = from; n <= to; n++) {
    const status: CellStatus = selected.has(n)
      ? "selected"
      : lost.has(n)
        ? "lost"
        : taken.has(n)
          ? "taken"
          : "free";
    cells.push(<NumberCell key={n} n={n} status={status} locked={limitReached} onToggle={onToggle} />);
  }
  return (
    <div
      role="group"
      aria-label={`Números del ${from} al ${to}`}
      className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12"
    >
      {cells}
    </div>
  );
});
