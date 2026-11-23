import { Banknote, Coins, Gem, Inbox } from "lucide-react";
import type { BalanceHistory } from "@/lib/balance";
import EmptyState from "../EmptyState";
import { cascadeStyle } from "@/lib/cascade";

interface FeedRow {
  id: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  categoryLabel: string;
  detail: string;
  amountLabel: string;
  paid: boolean;
  sortValue: number;
}

function buildRows(history: BalanceHistory, goldPerUsd: number | null, showObBalance: boolean): FeedRow[] {
  const ib: FeedRow[] = history.ib.map((r) => ({
    id: `ib-${r.id}`,
    icon: Banknote,
    iconColor: "var(--color-primary)",
    categoryLabel: "Shop Dólar",
    detail: r.note || "Ajuste manual",
    amountLabel: `$${r.amount.toFixed(2)}`,
    paid: r.paid,
    sortValue: new Date(r.paid ? r.paid_at! : r.created_at).getTime(),
  }));

  const gold: FeedRow[] = history.gold.map((r) => ({
    id: `gold-${r.id}`,
    icon: Coins,
    iconColor: "var(--color-success)",
    categoryLabel: "Gold",
    detail: r.note || "Ajuste manual",
    amountLabel: goldPerUsd
      ? `$${(r.amount / goldPerUsd).toFixed(2)}`
      : `${r.amount.toLocaleString("es-ES")} Gold`,
    paid: r.paid,
    sortValue: new Date(r.paid ? r.paid_at! : r.created_at).getTime(),
  }));

  const ob: FeedRow[] = !showObBalance ? [] : history.ob.map((r) => ({
    id: `ob-${r.id}`,
    icon: Gem,
    iconColor: "var(--color-secondary)",
    categoryLabel: "Fuera de la plataforma",
    detail: r.description,
    amountLabel: `$${r.amount.toFixed(2)}`,
    paid: r.paid,
    sortValue: new Date(`${r.sold_date}T00:00:00Z`).getTime(),
  }));

  return [...ib, ...gold, ...ob].sort((a, b) => b.sortValue - a.sortValue);
}

export default function RecentActivityFeed({
  history,
  goldPerUsd,
  showObBalance = true,
}: {
  history: BalanceHistory;
  goldPerUsd: number | null;
  showObBalance?: boolean;
}) {
  const rows = buildRows(history, goldPerUsd, showObBalance).slice(0, 6);

  return (
    <div className="card p-5">
      <p className="text-caption mb-3">Actividad reciente</p>
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Sin movimientos todavía"
          description="Los pagos y ajustes que se registren van a aparecer acá."
        />
      ) : (
        <div>
          {rows.map((r, index) => {
            const Icon = r.icon;
            return (
              <div
                key={r.id}
                className="grid items-center gap-3 py-2 border-b border-line last:border-0 cascade-item"
                style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto auto", ...cascadeStyle(index) }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: r.iconColor }} />
                <div className="min-w-0">
                  <span className="text-sm text-ink truncate block">{r.detail}</span>
                </div>
                <span className="text-xs text-ink-faint hidden sm:inline">{r.categoryLabel}</span>
                <div className="flex items-center gap-2 justify-end">
                  <span className={`pill ${r.paid ? "pill-success" : "pill-common"} !text-micro`}>
                    {r.paid ? "Pagado" : "Pendiente"}
                  </span>
                  <span className="font-data text-sm font-semibold text-ink text-right w-20 shrink-0">
                    {r.amountLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
