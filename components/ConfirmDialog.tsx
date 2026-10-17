"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

/** Accessible modal built on the native <dialog> element. */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = "Cancelar",
  busy = false,
  tone = "primary",
  onConfirm,
  onCancel,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const confirmClass =
    tone === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-emerald-700 hover:bg-emerald-800";

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-xl p-0 shadow-xl"
    >
      <div className="space-y-4 p-5">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="text-sm text-slate-700">{children}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
