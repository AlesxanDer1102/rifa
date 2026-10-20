"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { claimTickets, verifyDni, type VerifyDniResult } from "@/app/actions";
import { TICKETS_PER_PERSON, TOTAL_TICKETS } from "@/lib/constants";
import {
  parseReceipt,
  readReceiptRaw,
  RECEIPT_KEY,
  saveReceipt,
  subscribeReceipt,
  type StoredReceipt,
} from "@/lib/receipt";
import { DNI_PATTERN } from "@/lib/dni";
import { initialSelection, selectionReducer } from "@/lib/selection";
import { ConfirmDialog } from "./ConfirmDialog";
import { MemberPicker, type PickedMember } from "./MemberPicker";
import { NumberGrid } from "./NumberGrid";
import { RaffleHeader } from "./RaffleHeader";
import { Receipt } from "./Receipt";

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

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-brand-700";

export function RaffleApp() {
  const [selection, dispatch] = useReducer(selectionReducer, initialSelection);

  const { data, error, mutate } = useSWR<TicketsResponse>("/api/tickets", fetcher, {
    refreshInterval: 3000,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    keepPreviousData: true,
    onSuccess: (fresh) => dispatch({ type: "serverTaken", taken: fresh.taken }),
  });

  // Receipt persisted in this browser (convenience only).
  const rawReceipt = useSyncExternalStore(subscribeReceipt, readReceiptRaw, () => null);
  const storedReceipt = useMemo(() => parseReceipt(rawReceipt), [rawReceipt]);
  const [sessionReceipt, setSessionReceipt] = useState<StoredReceipt | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);
  const receipt = sessionReceipt ?? storedReceipt;

  // Steps 1-2 (member picker, then DNI check)
  const [step, setStep] = useState<"pick" | "dni" | "grid">("pick");
  const [member, setMember] = useState<PickedMember | null>(null);
  const [dni, setDni] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Step 3 (grid)
  const [block, setBlock] = useState<"all" | number>("all");
  const [goTo, setGoTo] = useState("");
  const [goToError, setGoToError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ n: number; tick: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const taken = useMemo(() => new Set(data?.taken ?? []), [data?.taken]);
  const selectedSet = useMemo(() => new Set(selection.selected), [selection.selected]);
  const lostSet = useMemo(() => new Set(selection.lost), [selection.lost]);
  const count = selection.selected.length;
  const limitReached = count >= TICKETS_PER_PERSON;

  useEffect(() => {
    if (!focusTarget) return;
    const el = document.getElementById(`n-${focusTarget.n}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (el instanceof HTMLButtonElement && !el.disabled) el.focus({ preventScroll: true });
  }, [focusTarget]);

  const onToggle = useCallback((n: number) => dispatch({ type: "toggle", number: n }), []);

  function onSelectMember(picked: PickedMember) {
    setMember(picked);
    setDni("");
    setFormError(null);
    setStep("dni");
  }

  const dniErrors: Record<Exclude<VerifyDniResult, { ok: true }>["reason"], string> = {
    invalid: "El DNI debe tener 8 dígitos.",
    incorrect: "DNI incorrecto.",
    locked: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo nuevamente.",
    already_participated: "Este afiliado ya participó.",
    closed: "El registro ya está cerrado.",
    error: "No se pudo verificar el DNI. Inténtalo nuevamente.",
  };

  async function onVerifyDni(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setFormError(null);
    if (!DNI_PATTERN.test(dni)) {
      setFormError(dniErrors.invalid);
      return;
    }
    setChecking(true);
    try {
      const result = await verifyDni(member.id, dni);
      if (!result.ok) {
        setFormError(dniErrors[result.reason]);
        if (result.reason === "closed") void mutate();
        if (result.reason === "already_participated") setStep("pick");
        return;
      }
      setDni("");
      setStep("grid");
    } catch {
      setFormError("No se pudo verificar el DNI. Revisa tu conexión e inténtalo nuevamente.");
    } finally {
      setChecking(false);
    }
  }

  function onRandomFill() {
    const free: number[] = [];
    for (let n = 1; n <= TOTAL_TICKETS; n++) {
      if (!taken.has(n) && !selectedSet.has(n) && !lostSet.has(n)) free.push(n);
    }
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    const picks = free.slice(0, TICKETS_PER_PERSON - count);
    dispatch({ type: "set", numbers: [...selection.selected, ...picks] });
  }

  function onGoTo(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(goTo);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_TICKETS) {
      setGoToError(`Ingresa un número entre 1 y ${TOTAL_TICKETS}.`);
      return;
    }
    setGoToError(null);
    if (block !== "all") setBlock(Math.floor((n - 1) / BLOCK_SIZE));
    setFocusTarget((prev) => ({ n, tick: (prev?.tick ?? 0) + 1 }));
  }

  async function onConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await claimTickets({ numbers: selection.selected });
      if (result.ok) {
        const stored: StoredReceipt = {
          fullName: result.participant.fullName,
          numbers: result.numbers,
          createdAt: new Date().toISOString(),
        };
        saveReceipt(stored);
        setSessionReceipt(stored);
        setJustClaimed(true);
        dispatch({ type: "clear" });
        setConfirmOpen(false);
        void mutate();
        return;
      }
      setConfirmOpen(false);
      switch (result.reason) {
        case "conflict":
          dispatch({ type: "conflict", taken: result.taken });
          break;
        case "already_participated":
          setStep("pick");
          setFormError(
            "Este afiliado ya participó. Si crees que es un error, comunícate con la directiva del sindicato.",
          );
          break;
        case "unauthorized":
          // Session expired (or never existed): ask for the DNI again, keeping the selection.
          setStep("dni");
          setFormError("Tu sesión expiró. Ingresa tu DNI nuevamente para confirmar.");
          break;
        case "closed":
          setSubmitError("El registro ya está cerrado.");
          break;
        case "invalid":
          setSubmitError(result.message ?? "Los datos enviados no son válidos.");
          break;
        default:
          setSubmitError("Ocurrió un error al registrar tus números. No se guardó nada; inténtalo nuevamente.");
      }
      void mutate();
    } catch {
      setConfirmOpen(false);
      setSubmitError("No se pudo conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function onForgetReceipt() {
    try {
      localStorage.removeItem(RECEIPT_KEY);
      window.dispatchEvent(new Event("rifa-receipt-change"));
    } catch {
      // ignore
    }
    setSessionReceipt(null);
    setJustClaimed(false);
    setMember(null);
    setFormError(null);
    setStep("pick");
  }

  const header = <RaffleHeader taken={data?.taken.length} participants={data?.participants} />;
  const availabilityLink = (
    <div className="no-print mx-auto max-w-xl">
      <Link
        href="/disponibilidad"
        className="block w-full rounded-md border-2 border-brand-700 bg-white px-4 py-3 text-center font-semibold text-brand-800 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Ver números ocupados y disponibles
      </Link>
    </div>
  );

  if (receipt) {
    return (
      <div className="space-y-6">
        {header}
        <Receipt receipt={receipt} returning={!justClaimed} />
        {availabilityLink}
        <div className="no-print text-center">
          <button type="button" onClick={onForgetReceipt} className="text-sm text-slate-500 underline">
            Registrar a otra persona desde este dispositivo
          </button>
        </div>
      </div>
    );
  }

  if (data?.closed) {
    return (
      <div className="space-y-6">
        {header}
        <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-center">
          <h2 className="text-xl font-bold">Registro cerrado</h2>
          <p className="mt-1 text-slate-700">
            Ya no se aceptan nuevos registros. Gracias por participar en la Rifa Pro Navidad 2026.
          </p>
        </section>
        {availabilityLink}
      </div>
    );
  }

  if (step === "pick" || !member) {
    return (
      <div className="space-y-6">
        {header}
        <section className="mx-auto max-w-xl space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold">Paso 1: selecciona tu nombre</h2>
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          )}
          <MemberPicker onSelect={onSelectMember} />
        </section>
        {availabilityLink}
      </div>
    );
  }

  if (step === "dni") {
    return (
      <div className="space-y-6">
        {header}
        <form
          onSubmit={onVerifyDni}
          noValidate
          className="mx-auto max-w-xl space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          <h2 className="text-xl font-semibold">Paso 2: verifica tu DNI</h2>
          <p className="text-sm text-slate-700">
            Afiliado: <strong>{member.fullName}</strong>{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setFormError(null);
                setStep("pick");
              }}
            >
              Cambiar
            </button>
          </p>
          <div>
            <label htmlFor="dni" className="mb-1 block text-sm font-medium">
              DNI (8 dígitos)
            </label>
            <input
              id="dni"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={8}
              className={inputClass}
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </div>
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={checking}
            className="w-full rounded-md bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {checking ? "Verificando..." : "Continuar y elegir números"}
          </button>
        </form>
        {availabilityLink}
      </div>
    );
  }

  const [rangeFrom, rangeTo] = block === "all" ? [1, TOTAL_TICKETS] : blockRange(block);
  const tabClass = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm whitespace-nowrap ${
      active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-4">
      {header}

      <section className="space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Paso 3: elige tus {TICKETS_PER_PERSON} números</h2>
            <p className="text-sm text-slate-600">
              Participante: {member.fullName}{" "}
              <button type="button" className="underline" onClick={() => setStep("pick")}>
                Cambiar participante
              </button>
            </p>
          </div>
          <p
            aria-live="polite"
            className={`rounded-full px-4 py-1 text-lg font-bold tabular-nums ${
              count === TICKETS_PER_PERSON ? "bg-brand-100 text-brand-800" : "bg-slate-100"
            }`}
          >
            {count} / {TICKETS_PER_PERSON}
          </p>
        </div>

        {selection.notice && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">
            <span>{selection.notice}</span>
            <button type="button" className="shrink-0 underline" onClick={() => dispatch({ type: "dismissNotice" })}>
              Entendido
            </button>
          </div>
        )}
        {submitError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={onGoTo} className="flex items-end gap-2">
            <div>
              <label htmlFor="goTo" className="mb-1 block text-sm font-medium">
                Ir al número
              </label>
              <input
                id="goTo"
                inputMode="numeric"
                className={`${inputClass} w-28`}
                value={goTo}
                onChange={(e) => setGoTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
              Ir
            </button>
          </form>
          <button
            type="button"
            onClick={onRandomFill}
            disabled={limitReached || !data}
            className="rounded-md border border-brand-700 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-50"
          >
            Completar al azar
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "clear" })}
            disabled={count === 0}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
          >
            Limpiar
          </button>
        </div>
        {goToError && (
          <p role="alert" className="text-sm text-red-700">
            {goToError}
          </p>
        )}

        <nav aria-label="Filtrar por bloques" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={block === "all"} onClick={() => setBlock("all")} className={tabClass(block === "all")}>
            Todos
          </button>
          {Array.from({ length: BLOCK_COUNT }, (_, i) => {
            const [from, to] = blockRange(i);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={block === i}
                onClick={() => setBlock(i)}
                className={tabClass(block === i)}
              >
                {from}–{to}
              </button>
            );
          })}
        </nav>

        <ul className="flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Leyenda">
          <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded border border-slate-300 bg-white" /> Libre</li>
          <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded border border-brand-700 bg-brand-600" /> Tu selección</li>
          <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded border border-slate-200 bg-slate-200" /> Ocupado</li>
          <li className="flex items-center gap-1.5"><span className="inline-block size-4 rounded border border-red-600 bg-red-100" /> Ya no disponible</li>
        </ul>

        {!data ? (
          <p role="status" className="py-10 text-center text-slate-600">
            {error ? "No se pudo cargar la disponibilidad. Reintentando..." : "Cargando disponibilidad..."}
          </p>
        ) : (
          <NumberGrid
            from={rangeFrom}
            to={rangeTo}
            taken={taken}
            selected={selectedSet}
            lost={lostSet}
            limitReached={limitReached}
            onToggle={onToggle}
          />
        )}
      </section>

      <div className="sticky bottom-0 -mx-3 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{count} / {TICKETS_PER_PERSON}</span> números elegidos
          </p>
          <button
            type="button"
            disabled={count !== TICKETS_PER_PERSON}
            onClick={() => setConfirmOpen(true)}
            className="rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirmar mis números
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirma tus números"
        confirmLabel="Confirmar registro"
        busy={submitting}
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>
          {member.fullName}, estos son los {TICKETS_PER_PERSON} números que registrarás:
        </p>
        <p className="my-3 rounded-md bg-slate-50 p-3 text-center text-base font-semibold tabular-nums">
          {selection.selected.join(", ")}
        </p>
        <p>Después de confirmar no podrás modificarlos.</p>
      </ConfirmDialog>
    </div>
  );
}
