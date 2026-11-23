"use client";

import { useState } from "react";
import { Laptop2, CheckCircle2, XCircle } from "lucide-react";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { readJsonBody } from "@/lib/read-json";

type Status = "idle" | "approving" | "approved" | "error";

export default function ConectarAppClient({ deviceCode }: { deviceCode: string | null }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleApprove() {
    if (!deviceCode) return;

    const confirmed = await confirm(
      "¿Aprobar esta PC para sincronizar tus datos de personajes (oro, M+, Gran Vault) con el portal?",
      { title: "Vincular dispositivo", confirmLabel: "Aprobar" }
    );
    if (!confirmed) return;

    setStatus("approving");
    setError("");

    try {
      const res = await fetch("/api/sync/desktop/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode }),
      });
      const data = await readJsonBody(res);

      if (!res.ok) {
        setError(data.error ?? "No se pudo aprobar el dispositivo.");
        setStatus("error");
        return;
      }

      setStatus("approved");
    } catch {
      setError("No se pudo conectar con el portal. Intenta de nuevo.");
      setStatus("error");
    }
  }

  if (!deviceCode) {
    return (
      <div className="card px-6 py-12 text-center text-ink-faint text-sm">
        Falta el código de emparejamiento. Abre este enlace desde la app
        Desktop Sync, no a mano.
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Laptop2 className="w-5 h-5 shrink-0 text-ink-faint" />
        <div>
          <h1 className="text-display-md text-ink">Vincular Desktop Sync</h1>
          <p className="text-ink-faint text-xs mt-0.5">
            Una PC pidió sincronizar tus personajes con este portal.
          </p>
        </div>
      </div>

      {status === "approved" ? (
        <div
          className="flex items-center gap-2.5 text-sm rounded-xl p-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 35%, transparent)",
            color: "var(--color-success)",
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Dispositivo vinculado. Ya puedes cerrar esta pestaña.
        </div>
      ) : (
        <>
          {status === "error" && (
            <div
              className="flex items-center gap-2.5 text-sm rounded-xl p-4 mb-4"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
                color: "var(--color-danger)",
              }}
            >
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <button
            onClick={handleApprove}
            disabled={status === "approving"}
            className="btn btn-primary w-full"
          >
            {status === "approving" ? "Aprobando..." : "Aprobar este dispositivo"}
          </button>
        </>
      )}
    </div>
  );
}
