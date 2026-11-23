"use client";

import { useState } from "react";
import { formatDayLabel } from "@/lib/format";
import { useModalDismiss } from "@/lib/useModalDismiss";

export default function SwapRequestModal({
  myDate,
  theirName,
  theirDate,
  submitting,
  onConfirm,
  onCancel,
}: {
  myDate: string;
  theirName: string;
  theirDate: string;
  submitting?: boolean;
  onConfirm: (message: string) => void;
  onCancel: () => void;
}) {
  const panelRef = useModalDismiss<HTMLDivElement>(onCancel);
  const [message, setMessage] = useState("");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(5, 3, 10, 0.72)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Proponer intercambio"
        className="card p-6 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-lg font-bold text-ink mb-2">Proponer intercambio</h2>
        <p className="text-ink-muted text-sm leading-relaxed mb-3">
          Cedes tu día libre del{" "}
          <span className="font-semibold text-ink">{formatDayLabel(myDate)}</span> y te quedas con el
          de <span className="font-semibold text-ink">{theirName}</span> del{" "}
          <span className="font-semibold text-ink">{formatDayLabel(theirDate)}</span>.
        </p>

        <p className="text-ink-faint text-xs leading-relaxed mb-4">
          Primero tiene que aceptarlo {theirName} y después aprobarlo un RL. Recibes un aviso en cada
          paso.
        </p>

        <label className="block text-xs text-ink-muted mb-1.5 font-medium">Mensaje (opcional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Cuéntale por qué te gustaría cambiar..."
          rows={3}
          className="input w-full px-3 py-2 text-sm resize-none"
        />

        <div className="flex gap-3 mt-6 justify-end">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(message.trim())}
            disabled={submitting}
            className="btn btn-primary"
          >
            {submitting ? "Enviando..." : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
