import {
  DRAW_DATE_LABEL,
  PRIZES,
  TICKET_PRICE_PEN,
  TICKETS_PER_PERSON,
  TOTAL_PARTICIPANTS,
  TOTAL_TICKETS,
} from "@/lib/constants";
import { DrawRules } from "./DrawRules";

function Progress({ label, value, max }: { label: string; value: number | undefined; max: number }) {
  const pct = value === undefined ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-slate-600">
          {value ?? "-"} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? 0}
        className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function RaffleHeader({ taken, participants }: { taken?: number; participants?: number }) {
  return (
    <header className="no-print rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="inline-block rounded-lg bg-emerald-700 px-4 py-1.5 text-2xl font-extrabold tracking-[0.2em] text-white shadow-md sm:text-4xl">SINATPSI</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Rifa Pro Navidad 2026</h1>
      <p className="mt-2 text-slate-700">
        Cada participante elige exactamente {TICKETS_PER_PERSON} números del 1 al {TOTAL_TICKETS}. Cada
        número cuesta S/ {TICKET_PRICE_PEN}. Sorteo: {DRAW_DATE_LABEL}.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {PRIZES.map((p) => (
          <li key={p.place} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            <span className="block text-xs font-medium uppercase text-slate-500">{p.place}</span>
            <span className="font-semibold">{p.name}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <DrawRules />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Progress label="Números ocupados" value={taken} max={TOTAL_TICKETS} />
        <Progress label="Participantes" value={participants} max={TOTAL_PARTICIPANTS} />
      </div>
    </header>
  );
}
