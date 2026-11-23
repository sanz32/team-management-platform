"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { formatDayLabel } from "@/lib/format";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import { cascadeStyle } from "@/lib/cascade";
import { readJsonBody } from "@/lib/read-json";

interface AdjustmentHistoryRow {
  id: string;
  amount: number;
  note: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

interface ObHistoryRow {
  id: string;
  amount: number;
  description: string;
  sold_date: string;
  paid: boolean;
}

interface ObDiscountHistoryRow {
  id: string;
  amount: number;
  reason: string | null;
  reverted: boolean;
  reverted_at: string | null;
  created_at: string;
}

interface BalanceHistory {
  ib: AdjustmentHistoryRow[];
  gold: AdjustmentHistoryRow[];
  ob: ObHistoryRow[];
  obDiscounts: ObDiscountHistoryRow[];
}

interface UnifiedRow {
  id: string;
  rawId: string;
  type: "ib" | "gold" | "ob" | "ob_discount";
  categoryLabel: string;
  amountLabel: string;
  subLabel?: string;
  detail: string;
  paid: boolean;
  statusOnLabel?: string;
  statusOffLabel?: string;
  dateLabel: string;
  sortValue: number;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
}

function StatusPill({
  paid,
  dateLabel,
  onLabel = "Pagado",
  offLabel = "Pendiente",
}: {
  paid: boolean;
  dateLabel: string;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <span className={`pill ${paid ? "pill-success" : "pill-common"} whitespace-nowrap`}>
      {paid ? `${onLabel} — ${dateLabel}` : `${offLabel} — ${dateLabel}`}
    </span>
  );
}

export default function BalanceHistoryCard({
  userId,
  goldPerUsd,
  refreshKey,
  canDelete,
  showObBalance = true,
  onMutate,
}: {
  userId?: string;
  goldPerUsd: number | null;
  refreshKey?: number;
  canDelete?: boolean;
  showObBalance?: boolean;
  onMutate?: () => void;
}) {
  const confirm = useConfirm();
  const [history, setHistory] = useState<BalanceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const url = userId ? `/api/balance/history?userId=${userId}` : "/api/balance/history";
      const res = await fetch(url);
      setHistory(await readJsonBody(res));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey]);

  useRefetchOnReturn(load);

  async function handleDelete(rawId: string, paid: boolean) {
    const confirmed = await confirm(
      paid
        ? "¿Deshacer este pago? El monto vuelve a contar como pendiente en el balance de esta persona (no se borra el ajuste, solo se le quita la marca de pagado)."
        : "¿Borrar esta entrada del historial? Es permanente (no se puede deshacer) — úsalo solo para limpiar cargas de prueba, no pagos reales.",
      { danger: !paid, confirmLabel: paid ? "Deshacer pago" : "Borrar" }
    );
    if (!confirmed) return;
    setDeletingId(rawId);
    try {
      await fetch(`/api/balance/adjustments/${rawId}`, { method: "DELETE" });
      await load();
      onMutate?.();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRevertDiscount(rawId: string) {
    const confirmed = await confirm(
      "¿Reintegrar este descuento? El monto vuelve a sumarse al balance pendiente de Runs OB de esta persona.",
      { confirmLabel: "Reintegrar" }
    );
    if (!confirmed) return;
    setDeletingId(rawId);
    try {
      await fetch(`/api/balance/ob-discounts/${rawId}`, { method: "DELETE" });
      await load();
      onMutate?.();
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <p className="text-ink-muted text-sm">Cargando historial...</p>;
  if (!history) return null;

  const ibRows: UnifiedRow[] = history.ib.map((r) => ({
    id: `ib-${r.id}`,
    rawId: r.id,
    type: "ib",
    categoryLabel: "En la plataforma (Shop Dólar)",
    amountLabel: `$${r.amount.toFixed(2)}`,
    detail: r.note || "Ajuste manual",
    paid: r.paid,
    dateLabel: formatTimestamp(r.paid ? r.paid_at! : r.created_at),
    sortValue: new Date(r.paid ? r.paid_at! : r.created_at).getTime(),
  }));

  const goldRows: UnifiedRow[] = history.gold.map((r) => ({
    id: `gold-${r.id}`,
    rawId: r.id,
    type: "gold",
    categoryLabel: "En la plataforma (Gold)",
    amountLabel: `${r.amount.toLocaleString("es-ES")} Gold`,
    subLabel: goldPerUsd ? `≈ $${(r.amount / goldPerUsd).toFixed(2)} USD` : undefined,
    detail: r.note || "Ajuste manual",
    paid: r.paid,
    dateLabel: formatTimestamp(r.paid ? r.paid_at! : r.created_at),
    sortValue: new Date(r.paid ? r.paid_at! : r.created_at).getTime(),
  }));

  const obRows: UnifiedRow[] = !showObBalance ? [] : history.ob.map((r) => ({
    id: `ob-${r.id}`,
    rawId: r.id,
    type: "ob",
    categoryLabel: "Fuera de la plataforma",
    amountLabel: `$${r.amount.toFixed(2)}`,
    detail: r.description,
    paid: r.paid,
    dateLabel: formatDayLabel(r.sold_date),
    sortValue: new Date(`${r.sold_date}T00:00:00Z`).getTime(),
  }));

  const obDiscountRows: UnifiedRow[] = !showObBalance ? [] : history.obDiscounts.map((r) => ({
    id: `ob-discount-${r.id}`,
    rawId: r.id,
    type: "ob_discount",
    categoryLabel: "Descuento Runs OB",
    amountLabel: `-$${r.amount.toFixed(2)}`,
    detail: r.reason || "Descuento",
    paid: r.reverted,
    statusOnLabel: "Reintegrado",
    statusOffLabel: "Aplicado",
    dateLabel: formatTimestamp(r.reverted ? r.reverted_at! : r.created_at),
    sortValue: new Date(r.reverted ? r.reverted_at! : r.created_at).getTime(),
  }));

  const rows = [...ibRows, ...obRows, ...obDiscountRows, ...goldRows].sort((a, b) => b.sortValue - a.sortValue);

  return (
    <div id="historial" className="card overflow-x-auto scroll-mt-24">
      {rows.length === 0 ? (
        <p className="text-ink-faint text-sm p-5">Sin movimientos.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-ink-faint text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold">Categoría</th>
              <th className="text-left px-5 py-3.5 font-semibold">Detalle</th>
              <th className="text-left px-5 py-3.5 font-semibold">Monto</th>
              <th className="text-left px-5 py-3.5 font-semibold">Estado</th>
              {canDelete && <th className="text-left px-5 py-3.5"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, index) => (
              <tr key={r.id} className="border-t border-line cascade-item" style={cascadeStyle(index)}>
                <td className="px-5 py-3.5 text-ink-muted whitespace-nowrap">{r.categoryLabel}</td>
                <td className="px-5 py-3.5 text-ink max-w-xs truncate">{r.detail}</td>
                <td className="px-5 py-3.5 font-data font-semibold text-ink whitespace-nowrap">
                  {r.amountLabel}
                  {r.subLabel && (
                    <span className="block text-ink-faint text-xs font-normal">{r.subLabel}</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <StatusPill
                    paid={r.paid}
                    dateLabel={r.dateLabel}
                    onLabel={r.statusOnLabel}
                    offLabel={r.statusOffLabel}
                  />
                </td>
                {canDelete && (
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {r.type === "ob_discount" ? (
                      !r.paid && (
                        <button
                          type="button"
                          onClick={() => handleRevertDiscount(r.rawId)}
                          disabled={deletingId === r.rawId}
                          title="Reintegrar este descuento (vuelve a sumarse al pendiente)"
                          className="text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )
                    ) : (
                      r.type !== "ob" && (
                        <button
                          type="button"
                          onClick={() => handleDelete(r.rawId, r.paid)}
                          disabled={deletingId === r.rawId}
                          title={r.paid ? "Deshacer este pago (vuelve a pendiente)" : "Borrar esta entrada (permanente)"}
                          className="text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
                        >
                          {r.paid ? <RotateCcw className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      )
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
