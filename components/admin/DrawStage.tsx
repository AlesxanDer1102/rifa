"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetDrawAction, spinAction, type SpinActionResult } from "@/app/admin/actions";
import { PRIZES } from "@/lib/constants";
import { ConfirmDialog } from "../ConfirmDialog";
import { Confetti } from "./Confetti";

export interface DrawSpinView {
  id: number;
  prizeRank: 1 | 2 | 3;
  spinIndex: 1 | 2 | 3;
  number: number;
  participantName: string;
  isWinner: boolean;
}

interface Props {
  initialSpins: DrawSpinView[];
  eligibleCount: number;
}

type Phase = "idle" | "pending" | "rolling";
type Rank = 1 | 2 | 3;
type SpinFailure = Extract<SpinActionResult, { ok: false }>["reason"];

/** Prizes are drawn from the last place to the first. */
const DRAW_ORDER: readonly Rank[] = [3, 2, 1];
const ROLL_MS = 3200;

const pad = (n: number) => String(n).padStart(4, "0");
const prizeOf = (rank: Rank) => PRIZES[rank - 1];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ERROR_MESSAGES: Record<SpinFailure, string> = {
  unauthorized: "Tu sesión expiró. Recarga la página e inicia sesión de nuevo.",
  conflict: "Ese giro ya se había realizado (posible doble clic). Se actualizó el estado del sorteo.",
  finished: "El sorteo ya terminó. Reinícialo si quieres hacer otro ensayo.",
  empty_pool: "No quedan números disponibles para sortear.",
  error: "Ocurrió un error al girar. Inténtalo de nuevo.",
};

function deriveRound(spins: DrawSpinView[]): { prize: Rank | null; nextSpin: 1 | 2 | 3 | null } {
  for (const prize of DRAW_ORDER) {
    const done = spins.filter((s) => s.prizeRank === prize).length;
    if (done < 3) return { prize, nextSpin: (done + 1) as 1 | 2 | 3 };
  }
  return { prize: null, nextSpin: null };
}

/** Fixed-width digit cells so the number never changes width while rolling. */
function Digits({ value, className }: { value: string; className: string }) {
  return (
    <span className={`inline-flex justify-center font-mono font-black tabular-nums ${className}`} aria-hidden="true">
      {value.split("").map((ch, i) => (
        <span key={i} className="inline-block w-[0.66em] text-center">
          {ch}
        </span>
      ))}
    </span>
  );
}

export function DrawStage({ initialSpins, eligibleCount }: Props) {
  const router = useRouter();
  const [spins, setSpins] = useState(initialSpins);
  const [eligible, setEligible] = useState(eligibleCount);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<number | null>(null);
  const [landed, setLanded] = useState(false);
  const [winnerPending, setWinnerPending] = useState(false);
  const [burst, setBurst] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, startReset] = useTransition();
  const [prevInitial, setPrevInitial] = useState({ spins: initialSpins, eligibleCount });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Sync from the server whenever fresh props arrive, except mid-spin (the reveal would leak early).
  if (prevInitial.spins !== initialSpins || prevInitial.eligibleCount !== eligibleCount) {
    setPrevInitial({ spins: initialSpins, eligibleCount });
    if (phase === "idle") {
      setSpins(initialSpins);
      setEligible(eligibleCount);
      setWinnerPending(false);
      setShown(null);
      setLanded(false);
    }
  }

  const round = deriveRound(spins);
  const finished = round.prize === null;
  // While a winner card is up, the header and slots keep showing the round that just ended.
  const lastSpin = spins[spins.length - 1];
  const viewRank: Rank | null = winnerPending && lastSpin ? lastSpin.prizeRank : round.prize;
  const roundSpins = viewRank ? spins.filter((s) => s.prizeRank === viewRank) : [];
  const nextSpin = winnerPending ? null : round.nextSpin;
  const winnerSpin = winnerPending && lastSpin?.isWinner ? lastSpin : null;
  const busy = phase !== "idle";
  const rolling = phase === "rolling";
  const prize = viewRank ? prizeOf(viewRank) : null;
  const showFinal = finished && !winnerPending;

  async function roll(pool: number[], target: number) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduced ? 500 : ROLL_MS + Math.random() * 500;
    const start = performance.now();
    let elapsed = 0;
    while (elapsed < total) {
      if (!alive.current) return;
      setShown(pool[Math.floor(Math.random() * pool.length)]);
      const progress = elapsed / total;
      await sleep(reduced ? 120 : 45 + 420 * progress ** 3);
      elapsed = performance.now() - start;
    }
    if (alive.current) setShown(target);
  }

  async function onSpin() {
    if (busy) return;
    setError(null);
    setPhase("pending");
    let res: SpinActionResult;
    try {
      res = await spinAction();
    } catch {
      res = { ok: false, reason: "error" };
    }
    if (!alive.current) return;
    if (!res.ok) {
      setError(ERROR_MESSAGES[res.reason]);
      setPhase("idle");
      if (res.reason === "conflict" || res.reason === "finished") router.refresh();
      return;
    }

    setPhase("rolling");
    setLanded(false);
    setAnnounce("");
    await roll(res.eligibleBefore, res.number);
    if (!alive.current) return;

    const spin: DrawSpinView = {
      id: Date.now(),
      prizeRank: res.prizeRank,
      spinIndex: res.spinIndex,
      number: res.number,
      participantName: res.participantName,
      isWinner: res.isWinner,
    };
    setSpins((prev) => [...prev, spin]);
    // After a winner the next round gets the round's discarded numbers back (+1); otherwise one fewer.
    setEligible(res.isWinner ? res.eligibleBefore.length + 1 : res.eligibleBefore.length - 1);
    setLanded(true);
    setPhase("idle");
    setWinnerPending(res.isWinner);
    if (res.isWinner) {
      const p = prizeOf(res.prizeRank);
      setBurst((b) => b + 1);
      setAnnounce(`¡Ganador del ${p.place}, ${p.name}! Número ${pad(res.number)}, ${res.participantName}.`);
    } else {
      setAnnounce(`Giro ${res.spinIndex}: salió el número ${pad(res.number)}. Descartado esta ronda.`);
    }
  }

  function onContinue() {
    setWinnerPending(false);
    setShown(null);
    setLanded(false);
    setAnnounce("");
  }

  function onReset() {
    startReset(async () => {
      const res = await resetDrawAction();
      setConfirmReset(false);
      if (!res.ok) {
        setError("No se pudo reiniciar el sorteo.");
        return;
      }
      setSpins([]);
      setWinnerPending(false);
      setShown(null);
      setLanded(false);
      setAnnounce("Sorteo reiniciado.");
      setError(null);
      router.refresh();
    });
  }

  const spinLabel = nextSpin === 3 ? "¡Girar por el ganador!" : nextSpin === 2 ? "Girar de nuevo" : "Girar";
  const display = shown !== null ? pad(shown) : "----";

  return (
    <div className="space-y-4">
      <Confetti burst={burst} />
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-red-800 via-red-900 to-emerald-950 px-4 py-6 text-white shadow-xl ring-1 ring-amber-300/40 sm:px-8 sm:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {[8, 22, 38, 55, 70, 86, 15, 62, 92].map((left, i) => (
              <span
                key={left}
                className="draw-twinkle absolute text-amber-200"
                style={{ left: `${left}%`, top: `${(i * 37) % 90}%`, animationDelay: `${i * 0.35}s` }}
              >
                ✦
              </span>
            ))}
          </div>

          <div className="relative space-y-6 text-center">
            {showFinal ? (
              <div className="space-y-2 py-8">
                <p className="text-5xl" aria-hidden="true">
                  🎄
                </p>
                <h2 className="text-3xl font-extrabold text-amber-300 sm:text-4xl">¡Sorteo finalizado!</h2>
                <p className="text-sm text-red-100">Los tres premios ya tienen ganador. Revisa el resumen.</p>
              </div>
            ) : (
              <>
                <header className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">{prize?.place}</p>
                  <h2 className="text-3xl font-extrabold text-amber-300 sm:text-5xl">{prize?.name}</h2>
                  <p className="text-sm font-medium text-red-100 sm:text-base">
                    {winnerSpin
                      ? "Giro 3 de 3 — ¡Ganador!"
                      : `Giro ${nextSpin} de 3${nextSpin === 3 ? " — ¡Ganador!" : ""}`}
                  </p>
                </header>

                <div
                  className={`mx-auto flex max-w-full items-center justify-center rounded-2xl px-3 py-4 sm:px-8 sm:py-6 ${
                    winnerSpin
                      ? "bg-amber-300 text-red-900 shadow-[0_0_60px_rgba(251,191,36,0.7)]"
                      : "bg-black/35 text-amber-100 ring-2 ring-amber-300/60"
                  }`}
                >
                  <span className={landed ? "draw-pop inline-block" : "inline-block"}>
                    <Digits
                      value={display}
                      className="text-6xl leading-none min-[400px]:text-7xl sm:text-9xl md:text-[10rem]"
                    />
                  </span>
                </div>

                <ol className="mx-auto grid max-w-xl grid-cols-3 gap-2 sm:gap-3" aria-label="Giros de la ronda">
                  {([1, 2, 3] as const).map((idx) => {
                    const s = roundSpins.find((x) => x.spinIndex === idx);
                    const active = !s && idx === nextSpin;
                    const style = s
                      ? s.isWinner
                        ? "bg-amber-300 text-red-900 ring-amber-100"
                        : "bg-white/15 text-white ring-white/30"
                      : active
                        ? "bg-black/25 text-amber-100 ring-amber-300"
                        : "bg-black/20 text-white/50 ring-white/10";
                    return (
                      <li key={idx} className={`rounded-xl px-2 py-2 ring-1 ${style}`}>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wide sm:text-xs">
                          {idx === 3 ? "Ganador" : `Giro ${idx}`}
                        </p>
                        <p className="font-mono text-xl font-black tabular-nums sm:text-3xl">
                          {s ? pad(s.number) : "----"}
                        </p>
                        <p className="text-[0.6rem] leading-tight sm:text-xs">
                          {s ? (s.isWinner ? "¡Ganó!" : "descartado esta ronda") : active ? "siguiente" : "pendiente"}
                        </p>
                      </li>
                    );
                  })}
                </ol>

                {winnerSpin ? (
                  <div className="draw-pop mx-auto max-w-md space-y-3 rounded-2xl bg-white/95 p-4 text-slate-900 shadow-lg sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-700">¡Felicitaciones!</p>
                    <p className="font-mono text-4xl font-black tabular-nums text-red-800">{pad(winnerSpin.number)}</p>
                    <p className="break-words text-xl font-bold">{winnerSpin.participantName}</p>
                    <p className="text-sm text-slate-600">
                      {prizeOf(winnerSpin.prizeRank).place}: {prizeOf(winnerSpin.prizeRank).name}
                    </p>
                    <button
                      type="button"
                      onClick={onContinue}
                      className="w-full rounded-full bg-emerald-700 px-5 py-3 text-base font-bold text-white hover:bg-emerald-800"
                    >
                      {winnerSpin.prizeRank === 1
                        ? "Ver resumen final"
                        : `Continuar al ${prizeOf((winnerSpin.prizeRank - 1) as Rank).place}`}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onSpin}
                    disabled={busy || finished}
                    className="rounded-full bg-amber-300 px-8 py-4 text-lg font-extrabold text-red-900 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 sm:text-xl"
                  >
                    {phase === "pending" ? "Preparando..." : rolling ? "Girando..." : spinLabel}
                  </button>
                )}
              </>
            )}

            {error && (
              <p role="alert" className="mx-auto max-w-md rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-red-100">
              <p>
                Números en juego: <strong className="tabular-nums text-amber-200">{finished ? 0 : eligible}</strong>
              </p>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={busy || spins.length === 0}
                className="rounded-md border border-white/40 px-3 py-1 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40"
              >
                Reiniciar sorteo
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold">{showFinal ? "Resumen final" : "Resultados"}</h2>
          <ul className="space-y-2">
            {DRAW_ORDER.map((rank) => {
              const w = spins.find((s) => s.prizeRank === rank && s.isWinner);
              const p = prizeOf(rank);
              return (
                <li
                  key={rank}
                  className={`rounded-xl px-3 py-2 ring-1 ${
                    w ? "bg-amber-50 ring-amber-300" : "bg-slate-50 ring-slate-200"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {p.place} · {p.name}
                  </p>
                  {w ? (
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-2xl font-black tabular-nums text-red-800">{pad(w.number)}</span>
                      <span className="break-words font-semibold">{w.participantName}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">Pendiente</p>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reiniciar sorteo"
        confirmLabel="Reiniciar"
        tone="danger"
        busy={resetting}
        onConfirm={onReset}
        onCancel={() => setConfirmReset(false)}
      >
        <p>
          Se borrarán todos los giros y ganadores registrados y el sorteo empezará de nuevo desde el 3er premio. Esta
          acción no se puede deshacer.
        </p>
      </ConfirmDialog>
    </div>
  );
}
