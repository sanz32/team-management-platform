"use client";

import { useState } from "react";
import Link from "next/link";
import { Banknote, Coins, Gem, Wallet } from "lucide-react";
import BalanceHistoryCard from "./BalanceHistoryCard";
import PagosView from "./PagosView";
import IconBadge from "../../components/dashboard/IconBadge";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";

interface BalanceSummary {
  ib: number;
  ob: number;
  goldAmount: number;
  goldPerUsd: number | null;
  goldUsd: number;
  total: number;
}

export default function BalanceClient({
  canViewAdmin,
  showObBalance,
  canManagePayouts,
  initialPanel,
}: {
  canViewAdmin: boolean;
  showObBalance: boolean;
  canManagePayouts: boolean;
  initialPanel?: string;
}) {
  const [summary, setSummary] = useState<BalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"resumen" | "pagos">(
    canManagePayouts && initialPanel === "pagos" ? "pagos" : "resumen"
  );

  async function loadSummary() {
    setLoading(true);
    const res = await fetch("/api/balance/summary");
    setSummary(await readJsonBody(res));
    setLoading(false);
  }

  useRefetchOnReturn(loadSummary);

  if (view === "pagos") {
    return (
      <main className="portal-container is-wide py-10">
        <PagosView onBack={() => setView("resumen")} />
      </main>
    );
  }

  if (loading || !summary) {
    return (
      <main className="portal-container py-10">
        <LoadingState variant="panel" />
      </main>
    );
  }

  return (
    <main className="portal-container py-10">
      <PageHeader
        eyebrow="Economía"
        icon={Wallet}
        title="Balance"
        description={`Resumen de Balance en la plataforma (Shop Dólar y Gold)${showObBalance ? " y Balance fuera de la plataforma" : ""}`}
        actions={
          canViewAdmin && (
            <Link href="/balance/administrar" className="btn btn-primary">
              Administrar balance
            </Link>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-6 items-start">
        <div className="card hero-glow p-6 relative lg:sticky lg:top-6">
          <div
            className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[1rem]"
            style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover))" }}
            aria-hidden
          />
          <p className="text-caption mb-2">Balance actual aproximado</p>
          <p className="font-data gold-figure text-5xl font-bold mb-6">
            ${summary.total.toFixed(2)}
          </p>

          <div className="grid grid-cols-1 gap-3">
            <a href="#historial" className="balance-row flex items-start gap-3 rounded-xl p-4">
              <IconBadge icon={Banknote} color="var(--color-primary)" />
              <div className="min-w-0">
                <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-1">
                  Balance en la plataforma
                </p>
                <p className="text-ink-faint text-label mb-1">(Shop Dólar)</p>
                <p className="font-data text-2xl font-bold text-ink">${summary.ib.toFixed(2)}</p>
              </div>
            </a>
            {showObBalance && canManagePayouts && (
              <button
                type="button"
                onClick={() => setView("pagos")}
                className="balance-row flex items-start gap-3 rounded-xl p-4 text-left w-full"
              >
                <IconBadge icon={Gem} color="var(--color-secondary)" />
                <div className="min-w-0">
                  <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-1">
                    Balance fuera de la plataforma
                  </p>
                  <p className="font-data text-2xl font-bold text-ink">${summary.ob.toFixed(2)}</p>
                  <p className="text-ink-faint text-label mt-1">Ir a Pagos →</p>
                </div>
              </button>
            )}
            {showObBalance && !canManagePayouts && (
              <a href="#historial" className="balance-row flex items-start gap-3 rounded-xl p-4">
                <IconBadge icon={Gem} color="var(--color-secondary)" />
                <div className="min-w-0">
                  <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-1">
                    Balance fuera de la plataforma
                  </p>
                  <p className="font-data text-2xl font-bold text-ink">${summary.ob.toFixed(2)}</p>
                </div>
              </a>
            )}
            <a href="#historial" className="balance-row flex items-start gap-3 rounded-xl p-4">
              <IconBadge icon={Coins} color="var(--color-success)" />
              <div className="min-w-0">
                <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-1">
                  Balance en la plataforma
                </p>
                <p className="text-ink-faint text-label mb-1">(Gold)</p>
                <p className="font-data text-2xl font-bold text-ink">
                  {summary.goldAmount.toLocaleString("es-ES")}
                </p>
                <p className="text-ink-faint text-xs mt-1">
                  {summary.goldPerUsd ? `≈ $${summary.goldUsd.toFixed(2)} USD` : "Tasa no configurada"}
                </p>
              </div>
            </a>
          </div>
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-ink-muted text-sm font-semibold">Tasa de cambio Gold → USD Aproximado</p>
            <p className="text-ink-faint text-xs mt-1">
              {summary.goldPerUsd
                ? `Actual: 1M (1.000.000) Gold ≈ $${(1_000_000 / summary.goldPerUsd).toFixed(2)} USD`
                : "Tasa no configurada"}
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold text-ink mb-4">Tu historial</h2>
          <BalanceHistoryCard goldPerUsd={summary.goldPerUsd} showObBalance={showObBalance} />
        </div>
      </div>
    </main>
  );
}
