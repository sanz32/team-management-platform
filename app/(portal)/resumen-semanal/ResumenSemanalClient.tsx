"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Wallet, Users, BarChart3 } from "lucide-react";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import IconBadge from "../../components/dashboard/IconBadge";
import { cascadeStyle } from "@/lib/cascade";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";

interface WeeklyEarningsRow {
  id: string;
  week_start: string;
  week_end: string;
  ib_paid: number;
  gold_paid_usd: number;
  gold_paid_amount: number;
  ob_paid: number;
  total_generated: number;
  total_paid: number;
}

interface GuildWeekRow {
  user_id: string;
  discord_username: string;
  ib_paid: number;
  gold_paid_usd: number;
  gold_paid_amount: number;
  ob_paid: number;
  total_generated: number;
  total_paid: number;
}

function GoldCell({ usd, amount }: { usd: number; amount: number }) {
  return (
    <div className="font-data">
      <span>${usd.toFixed(2)}</span>
      {amount !== 0 && (
        <span className="block text-ink-faint text-xs font-normal">{amount.toLocaleString("es-ES")} Gold</span>
      )}
    </div>
  );
}

const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const SHORT_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatWeekLabel(start: string, end: string): string {
  const s = WEEK_LABEL_FORMATTER.format(new Date(`${start}T00:00:00Z`));
  const e = WEEK_LABEL_FORMATTER.format(new Date(`${end}T00:00:00Z`));
  return `Semana del ${s} al ${e}`;
}

function shiftWeekStart(weekStart: string, deltaWeeks: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function StatTile({
  icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <IconBadge icon={icon} color={color} />
      <div className="min-w-0">
        <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold truncate">{label}</p>
        <p className="font-data text-2xl font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}

export default function ResumenSemanalClient() {
  const [viewMode, setViewMode] = useState<"admin" | "personal">("personal");
  const [canManage, setCanManage] = useState(false);
  const [history, setHistory] = useState<WeeklyEarningsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMine() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/weekly-earnings");
    const data = await readJsonBody(res);
    if (!res.ok) {
      setError(data.error || "No se pudo cargar tu resumen semanal.");
      setLoading(false);
      return;
    }
    setCanManage(!!data.canManage);
    setHistory(data.history ?? []);
    setLoading(false);
  }

  useRefetchOnReturn(loadMine);

  if (loading) return <LoadingState count={6} />;

  return (
    <div>
      <PageHeader
        eyebrow="Economía"
        icon={BarChart3}
        title="Resumen Semanal"
        description={
          viewMode === "admin"
            ? "Cierra cada semana para dejar un registro fijo de lo que se le pagó a cada miembro"
            : "Lo que te pagaron semana a semana (Balance en la plataforma y fuera de la plataforma)"
        }
        actions={
          canManage && (
            <button onClick={() => setViewMode((v) => (v === "admin" ? "personal" : "admin"))} className="btn btn-secondary">
              {viewMode === "admin" ? "Mi vista personal" : "Vista de administración"}
            </button>
          )
        }
      />

      {error && (
        <div
          className="text-sm rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {viewMode === "admin" ? <AdminView /> : <PersonalView history={history} />}
    </div>
  );
}

function TrendChart({ history }: { history: WeeklyEarningsRow[] }) {
  const weeks = [...history].slice(0, 8).reverse();
  if (weeks.length < 2) return null;

  const max = Math.max(...weeks.map((w) => w.total_paid), 1);

  return (
    <div className="card p-5">
      <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-4">
        Tendencia (últimas {weeks.length} semanas)
      </p>
      <div className="flex items-end gap-3 h-40">
        {weeks.map((w, index) => {
          const heightPct = Math.max((w.total_paid / max) * 100, 4);
          return (
            <div
              key={w.id}
              className="flex-1 flex flex-col items-center justify-end h-full cascade-item"
              style={cascadeStyle(index)}
            >
              <span className="font-data text-label font-semibold text-ink mb-1 whitespace-nowrap">
                ${w.total_paid.toFixed(0)}
              </span>
              <div
                className="w-full rounded-t-[4px]"
                style={{ height: `${heightPct}%`, minHeight: "4px", backgroundColor: "var(--color-gold)" }}
                title={`${formatWeekLabel(w.week_start, w.week_end)}: $${w.total_paid.toFixed(2)}`}
              />
              <span className="text-micro text-ink-faint mt-1.5 whitespace-nowrap">
                {SHORT_LABEL_FORMATTER.format(new Date(`${w.week_start}T00:00:00Z`))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonalView({ history }: { history: WeeklyEarningsRow[] }) {
  if (history.length === 0) {
    return (
      <div className="card px-6 py-12 text-center text-ink-faint text-sm">
        Todavía no hay semanas cerradas para ti — un administrador cierra cada semana desde la vista
        de administración.
      </div>
    );
  }

  const showChart = history.length >= 2;

  const table = (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-ink-faint text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold">Semana</th>
              <th className="text-left px-5 py-3.5 font-semibold">Shop Dólar</th>
              <th className="text-left px-5 py-3.5 font-semibold">Gold</th>
              <th className="text-left px-5 py-3.5 font-semibold">OB</th>
              <th className="text-left px-5 py-3.5 font-semibold">Total pagado</th>
            </tr>
          </thead>
          <tbody>
            {history.map((w, index) => (
              <tr key={w.id} className="border-t border-line cascade-item" style={cascadeStyle(index)}>
                <td className="px-5 py-3.5 text-ink">{formatWeekLabel(w.week_start, w.week_end)}</td>
                <td className="px-5 py-3.5 text-ink-muted font-data">${w.ib_paid.toFixed(2)}</td>
                <td className="px-5 py-3.5 text-ink-muted">
                  <GoldCell usd={w.gold_paid_usd} amount={w.gold_paid_amount} />
                </td>
                <td className="px-5 py-3.5 text-ink-muted font-data">${w.ob_paid.toFixed(2)}</td>
                <td className="px-5 py-3.5 font-data font-semibold text-ink">${w.total_paid.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (!showChart) return <div className="max-w-3xl">{table}</div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,620px)] gap-6 items-start">
      <TrendChart history={history} />
      {table}
    </div>
  );
}

function AdminView() {
  const confirm = useConfirm();
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [weekEnd, setWeekEnd] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [rows, setRows] = useState<GuildWeekRow[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closeMessage, setCloseMessage] = useState("");

  async function loadWeek(targetWeekStart?: string) {
    setLoadingWeek(true);
    setCloseMessage("");
    try {
      const url = targetWeekStart
        ? `/api/weekly-earnings?all=true&weekStart=${targetWeekStart}`
        : "/api/weekly-earnings?all=true";
      const res = await fetch(url);
      const data = await readJsonBody(res);
      setWeekStart(data.weekStart ?? null);
      setWeekEnd(data.weekEnd ?? null);
      setClosed(!!data.closed);
      setRows(data.rows ?? []);
    } finally {
      setLoadingWeek(false);
    }
  }

  useRefetchOnReturn(() => {
    loadWeek(weekStart ?? undefined);
  });

  function goToWeek(delta: number) {
    if (!weekStart) return;
    loadWeek(shiftWeekStart(weekStart, delta));
  }

  async function handleClose() {
    if (!weekStart || !weekEnd) return;
    const confirmed = await confirm(
      `¿Cerrar ${formatWeekLabel(weekStart, weekEnd)}? Congela lo que se marcó como pagado en esa semana — queda como registro fijo, no se puede recalcular después.`,
      { title: "Cerrar semana", confirmLabel: "Cerrar semana" }
    );
    if (!confirmed) return;

    setClosing(true);
    try {
      const res = await fetch("/api/weekly-earnings/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, weekEnd }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        setCloseMessage(`Semana cerrada: ${data.closed} miembro(s) registrados.`);
        await loadWeek(weekStart);
      } else {
        setCloseMessage(data.error || "No se pudo cerrar la semana.");
      }
    } finally {
      setClosing(false);
    }
  }

  async function handleReopen() {
    if (!weekStart || !weekEnd) return;
    const confirmed = await confirm(
      `¿Deshacer el cierre de ${formatWeekLabel(weekStart, weekEnd)}? Borra el registro fijo de TODO el guild para esa semana (no solo el tuyo) — úsalo para corregir un cierre hecho por error o para testear, no sobre semanas reales que ya se usaron para pagar.`,
      { title: "Deshacer cierre", danger: true, confirmLabel: "Deshacer cierre" }
    );
    if (!confirmed) return;

    setReopening(true);
    try {
      const res = await fetch(`/api/weekly-earnings/close?weekStart=${weekStart}`, { method: "DELETE" });
      const data = await readJsonBody(res);
      if (res.ok) {
        setCloseMessage(`Cierre deshecho: se borraron ${data.deleted} registro(s).`);
        await loadWeek(weekStart);
      } else {
        setCloseMessage(data.error || "No se pudo deshacer el cierre.");
      }
    } finally {
      setReopening(false);
    }
  }

  const totalGuild = rows.reduce((sum, r) => sum + r.total_paid, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goToWeek(-1)}
            disabled={!weekStart || loadingWeek}
            className="btn btn-ghost !px-3 !py-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-heading text-lg font-semibold text-ink min-w-[220px] text-center">
            {weekStart && weekEnd ? formatWeekLabel(weekStart, weekEnd) : "Cargando..."}
          </span>
          <button
            type="button"
            onClick={() => goToWeek(1)}
            disabled={!weekStart || loadingWeek}
            className="btn btn-ghost !px-3 !py-1.5"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {closed ? (
          <div className="flex items-center gap-2.5">
            <span className="pill pill-success !text-xs !px-3 !py-1.5">Semana cerrada</span>
            <button
              type="button"
              onClick={handleReopen}
              disabled={reopening}
              title="Borra el registro fijo de esta semana para todo el guild"
              className="text-xs font-medium text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
            >
              {reopening ? "Deshaciendo..." : "Deshacer cierre"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            disabled={closing || loadingWeek || rows.length === 0}
            className="btn btn-primary"
          >
            {closing ? "Cerrando..." : "Cerrar semana"}
          </button>
        )}
      </div>

      {closeMessage && <p className="text-sm text-ink-muted mb-4">{closeMessage}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
        <StatTile icon={Wallet} color="var(--color-primary)" label="Total pagado (guild)" value={`$${totalGuild.toFixed(2)}`} />
        <StatTile icon={Users} color="var(--color-secondary)" label="Miembros con pagos" value={rows.length} />
      </div>

      {loadingWeek ? (
        <p className="text-ink-muted text-sm">Cargando...</p>
      ) : rows.length === 0 ? (
        <div className="card px-6 py-12 text-center text-ink-faint text-sm">
          Nadie tiene pagos marcados como &ldquo;Pagado&rdquo; esta semana.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-faint text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold">Miembro</th>
                <th className="text-left px-5 py-3.5 font-semibold">Shop Dólar</th>
                <th className="text-left px-5 py-3.5 font-semibold">Gold</th>
                <th className="text-left px-5 py-3.5 font-semibold">OB</th>
                <th className="text-left px-5 py-3.5 font-semibold">Total pagado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr key={r.user_id} className="border-t border-line cascade-item" style={cascadeStyle(index)}>
                  <td className="px-5 py-3.5 font-medium text-ink">{r.discord_username}</td>
                  <td className="px-5 py-3.5 text-ink-muted font-data">${r.ib_paid.toFixed(2)}</td>
                  <td className="px-5 py-3.5 text-ink-muted">
                    <GoldCell usd={r.gold_paid_usd} amount={r.gold_paid_amount} />
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted font-data">${r.ob_paid.toFixed(2)}</td>
                  <td className="px-5 py-3.5 font-data font-semibold text-ink">${r.total_paid.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
