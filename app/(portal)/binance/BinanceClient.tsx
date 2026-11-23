"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import { useToast } from "@/app/components/ToastProvider";
import { readJsonBody } from "@/lib/read-json";

export default function BinanceClient({ initialBinanceId }: { initialBinanceId: string | null }) {
  const toast = useToast();
  const [binanceId, setBinanceId] = useState(initialBinanceId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/binance-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ binanceId: binanceId.trim() || null }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        toast.success("Binance ID guardado");
      } else {
        const data = await readJsonBody(res);
        toast.error("No se pudo guardar el Binance ID", data.error || undefined);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        icon={Coins}
        title="Binance"
        description="Datos usados para pagarte tu Balance fuera de la plataforma."
      />

      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Coins className="w-5 h-5 shrink-0" style={{ color: "var(--color-secondary)" }} />
          <div>
            <p className="text-sm font-semibold text-ink">Binance ID (para pagos)</p>
            <p className="text-ink-faint text-xs mt-0.5">
              ID de Binance donde recibes el pago de tu Balance fuera de la plataforma.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="text"
            value={binanceId}
            onChange={(e) => setBinanceId(e.target.value)}
            placeholder="ID de Binance"
            className="input flex-1 min-w-[220px]"
          />
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary shrink-0">
            {saved ? "Guardado ✓" : saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
