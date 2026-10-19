"use client";

import { useRef } from "react";
import { DRAW_DATE_LABEL, PRIZES, TICKETS_PER_PERSON } from "@/lib/constants";

// Mirrors lib/draw.ts (DRAW_ORDER, SPINS_PER_PRIZE). That module is server-only, so it is not imported here.
const SPINS_PER_PRIZE = 3;
const DRAW_ORDER = [...PRIZES].reverse();

/** Highlighted "important note" banner that opens the full draw rules in a modal. */
export function DrawRules() {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <div
        role="note"
        className="flex flex-col gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-800">Nota importante</p>
          <p className="mt-1 text-sm text-slate-800">
            Cada premio se sortea en {SPINS_PER_PRIZE} giros y solo el número del giro {SPINS_PER_PRIZE} gana.
            Revisa cómo funciona el sorteo antes de participar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.showModal()}
          className="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Ver reglas del sorteo
        </button>
      </div>

      <dialog
        ref={ref}
        aria-labelledby="draw-rules-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[min(94vw,36rem)] rounded-xl p-0 shadow-xl"
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="border-b border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Nota importante</p>
            <h2 id="draw-rules-title" className="text-xl font-bold">
              Reglas del sorteo
            </h2>
          </div>

          <div className="space-y-5 overflow-y-auto p-5 text-sm text-slate-700">
            <section>
              <h3 className="font-semibold text-slate-900">¿Cuándo y quiénes participan?</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>El sorteo se realiza el {DRAW_DATE_LABEL}.</li>
                <li>
                  Participan solo los números registrados. Cada participante tiene {TICKETS_PER_PERSON} números y
                  cada número tiene la misma probabilidad de salir.
                </li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900">Orden de los premios</h3>
              <p className="mt-2">Se sortea del último al primer premio:</p>
              <ol className="mt-2 space-y-1">
                {DRAW_ORDER.map((p, i) => (
                  <li key={p.place} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span>
                      <strong>{p.place}</strong>: {p.name}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900">¿Quién gana cada ronda?</h3>
              <p className="mt-2">Cada premio es una ronda de {SPINS_PER_PRIZE} giros:</p>
              <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                <li className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <span className="block font-semibold text-slate-900">Giro 1</span>
                  El número que sale queda descartado en esa ronda.
                </li>
                <li className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <span className="block font-semibold text-slate-900">Giro 2</span>
                  El número que sale queda descartado en esa ronda.
                </li>
                <li className="rounded-lg bg-amber-50 p-3 ring-2 ring-amber-400">
                  <span className="block font-semibold text-slate-900">Giro 3</span>
                  ¡El número que sale es el <strong>ganador</strong> del premio!
                </li>
              </ol>
              <p className="mt-2">Un número que ya salió en una ronda no puede volver a salir en esa misma ronda.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900">¿Qué pasa en las rondas siguientes?</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Los números descartados (giros 1 y 2) vuelven a participar en la siguiente ronda.</li>
                <li>El número ganador ya no participa en las rondas siguientes.</li>
                <li>Tus demás números siguen participando en las rondas que faltan.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900">Transparencia</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Cada giro elige un número al azar con un generador aleatorio seguro del sistema.</li>
                <li>Cada giro queda registrado y no puede repetirse ni modificarse.</li>
                <li>Los ganadores se publican en la página &quot;Ganadores&quot;, que se actualiza sola durante el sorteo.</li>
              </ul>
            </section>
          </div>

          <div className="flex justify-end border-t border-slate-200 p-4">
            <button
              type="button"
              onClick={close}
              className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Entendido
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
