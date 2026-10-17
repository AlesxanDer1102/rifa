import { DRAW_DATE_LABEL } from "@/lib/constants";
import type { StoredReceipt } from "@/lib/receipt";

const dateFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "long",
  timeStyle: "short",
});

export function Receipt({ receipt, returning }: { receipt: StoredReceipt; returning: boolean }) {
  return (
    <section
      aria-labelledby="receipt-title"
      className="mx-auto max-w-xl rounded-xl border border-emerald-300 bg-white p-6 shadow-sm"
    >
      <p className="text-sm font-medium text-emerald-700">
        {returning ? "Ya registraste tus números" : "Registro exitoso"}
      </p>
      <h2 id="receipt-title" className="mt-1 text-2xl font-bold">
        Comprobante de participación
      </h2>
      <p className="mt-1 text-sm text-slate-600">Rifa Pro Navidad 2026 - SINATPSI</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Participante</dt>
          <dd className="text-base font-semibold">
            {receipt.firstName} {receipt.lastName}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Fecha de registro</dt>
          <dd>{dateFormat.format(new Date(receipt.createdAt))} (hora de Lima)</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Fecha del sorteo</dt>
          <dd>{DRAW_DATE_LABEL}</dd>
        </div>
      </dl>
      <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Tus 12 números">
        {receipt.numbers.map((n) => (
          <li
            key={n}
            className="rounded-md border border-emerald-600 bg-emerald-50 py-2 text-center font-semibold tabular-nums"
          >
            {n}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-500">
        Conserva este comprobante. El pago de S/ 10 por número se coordina con la directiva. Los
        números no se pueden modificar después de confirmar.
      </p>
      <button
        type="button"
        onClick={() => window.print()}
        className="no-print mt-5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
      >
        Imprimir / guardar
      </button>
    </section>
  );
}
