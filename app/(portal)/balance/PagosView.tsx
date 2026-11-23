"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, RotateCcw, Swords, Trash2, Users, Gem } from "lucide-react";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import IconAction from "../../components/IconAction";
import SectionToggle from "../../components/SectionToggle";
import { cascadeStyle } from "@/lib/cascade";
import { formatDayLabel } from "@/lib/format";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { useModalDismiss } from "@/lib/useModalDismiss";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";

interface PayoutRun {
  id: string;
  description: string;
  soldDate: string;
  totalPrice: number;
  currency: string;
  advUsername: string | null;
  pendingAmount: number;
}

interface PayoutCandidate {
  key: string;
  userId: string | null;
  freelancerId: string | null;
  isFreelance: boolean;
  displayName: string;
  nickname: string | null;
  binanceId: string | null;
  pendingAmount: number;
  discountApplied: number;
  serviceCutIds: string[];
  hasOpenBatch: boolean;
}

interface PayoutBatchItem {
  id: string;
  discordUsername: string;
  isFreelance: boolean;
  binanceId: string;
  amount: number;
  discountApplied: number;
  status: "pending" | "paid";
  txReference: string | null;
}

interface PayoutBatch {
  id: string;
  currency: string;
  note: string | null;
  createdAt: string;
  items: PayoutBatchItem[];
  status: "pending" | "partially_paid" | "paid";
  total: number;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
}

const BATCH_STATUS_LABEL: Record<PayoutBatch["status"], string> = {
  pending: "Pendiente",
  partially_paid: "Parcial",
  paid: "Pagado",
};

const BATCH_STATUS_COLOR: Record<PayoutBatch["status"], string> = {
  pending: "var(--color-warning)",
  partially_paid: "var(--color-secondary)",
  paid: "var(--color-success)",
};

export default function PagosView({ onBack }: { onBack: () => void }) {
  const confirm = useConfirm();

  const [step, setStep] = useState<"runs" | "boosters" | "done">("runs");
  const [hasChosenRuns, setHasChosenRuns] = useState(false);

  const [runs, setRuns] = useState<PayoutRun[] | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

  const [candidates, setCandidates] = useState<PayoutCandidate[] | null>(null);
  const [batches, setBatches] = useState<PayoutBatch[] | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const knownEligible = useRef<Set<string>>(new Set());

  const [currency, setCurrency] = useState("USDT");
  const [note, setNote] = useState("");
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingBinance, setSavingBinance] = useState(false);

  const [markPaidTarget, setMarkPaidTarget] = useState<{ kind: "batch" | "item"; id: string; label: string } | null>(
    null
  );

  async function loadRuns() {
    const res = await fetch("/api/admin/payouts/runs");
    if (!res.ok) return;
    const data = await readJsonBody(res);
    setRuns(data.runs ?? []);
  }

  async function loadCandidates(runIds: string[]) {
    if (runIds.length === 0) {
      setCandidates([]);
      return;
    }
    const res = await fetch(`/api/admin/payouts/candidates?runIds=${runIds.map(encodeURIComponent).join(",")}`);
    if (!res.ok) return;
    const data = await readJsonBody(res);
    const list: PayoutCandidate[] = data.candidates ?? [];
    setCandidates(list);

    setIncluded((prev) => {
      const next = new Set(prev);
      const currentKeys = new Set(list.map((c) => c.key));

      for (const c of list) {
        if (!c.binanceId) {
          next.delete(c.key);
          knownEligible.current.delete(c.key);
          continue;
        }
        if (!knownEligible.current.has(c.key)) {
          next.add(c.key);
          knownEligible.current.add(c.key);
        }
      }

      for (const key of Array.from(next)) {
        if (!currentKeys.has(key)) next.delete(key);
      }
      return next;
    });
  }

  async function loadBatches() {
    const res = await fetch("/api/admin/payouts/batches");
    if (!res.ok) return;
    const data = await readJsonBody(res);
    setBatches(data.batches ?? []);
  }

  useRefetchOnReturn(() => {
    loadRuns();
    loadBatches();
  });

  function toggleRun(runId: string) {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }

  const selectedRuns = useMemo(() => (runs ?? []).filter((r) => selectedRunIds.has(r.id)), [runs, selectedRunIds]);
  const selectedRunsTotal = selectedRuns.reduce((sum, r) => sum + r.pendingAmount, 0);

  async function handleContinueFromRuns() {
    if (selectedRunIds.size === 0) return;
    setActionError(null);
    knownEligible.current = new Set();
    setIncluded(new Set());
    await loadCandidates(Array.from(selectedRunIds));
    setHasChosenRuns(true);
    setStep("boosters");
  }

  function toggleIncluded(key: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const eligibleKeys = useMemo(
    () => (candidates ?? []).filter((c) => c.binanceId).map((c) => c.key),
    [candidates]
  );
  const allEligibleIncluded = eligibleKeys.length > 0 && eligibleKeys.every((key) => included.has(key));
  const someEligibleIncluded = eligibleKeys.some((key) => included.has(key));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someEligibleIncluded && !allEligibleIncluded;
    }
  }, [someEligibleIncluded, allEligibleIncluded]);

  function toggleSelectAll() {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (allEligibleIncluded) {
        for (const key of eligibleKeys) next.delete(key);
      } else {
        for (const key of eligibleKeys) next.add(key);
      }
      return next;
    });
  }

  const includedCandidates = useMemo(
    () => (candidates ?? []).filter((c) => included.has(c.key) && c.binanceId),
    [candidates, included]
  );
  const total = includedCandidates.reduce((sum, c) => sum + c.pendingAmount, 0);

  async function handleSaveBinanceId(candidate: PayoutCandidate) {
    setSavingBinance(true);
    setActionError(null);
    try {
      const url = candidate.isFreelance
        ? `/api/admin/freelancers/${candidate.freelancerId}`
        : `/api/admin/members/${candidate.userId}`;
      const body = candidate.isFreelance
        ? { binanceId: editingValue.trim() || null }
        : { binance_id: editingValue.trim() || null };
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJsonBody(res).catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error ?? "Error guardando el Binance ID");
        return;
      }
      setEditingKey(null);
      setEditingValue("");
      await loadCandidates(Array.from(selectedRunIds));
    } finally {
      setSavingBinance(false);
    }
  }

  function accountTypeFor(binanceId: string): string {
    return binanceId.includes("@") ? "Binance Registered Email" : "Binance ID (BUID)";
  }

  function buildBinanceCsv(batch: PayoutBatch): string {
    const header =
      "Account Type (Required),Recipient's Account information (Required),Crypto Currency (Required),Amount (Required)";
    const notesRow = "Notes 1. Don't delete or add columns.";
    const rows = batch.items
      .filter((item) => item.amount > 0)
      .map((item) => `${accountTypeFor(item.binanceId)},${item.binanceId},${batch.currency},${item.amount.toFixed(2)}`);
    return [header, notesRow, ...rows].join("\n");
  }

  function downloadCsv(batch: PayoutBatch) {
    const csv = buildBinanceCsv(batch);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagos-${batch.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    if (includedCandidates.length === 0) return;
    setExporting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/payouts/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          note: note.trim() || null,
          items: includedCandidates.map((c) => ({
            userId: c.userId,
            freelancerId: c.freelancerId,
            serviceCutIds: c.serviceCutIds,
          })),
        }),
      });
      const data = await readJsonBody(res).catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error ?? "Error armando el lote");
        return;
      }
      downloadCsv(data.batch);
      setNote("");
      setStep("done");
      await Promise.all([loadRuns(), loadBatches()]);
    } finally {
      setExporting(false);
    }
  }

  function handleStartNewBatch() {
    setSelectedRunIds(new Set());
    setCandidates(null);
    setIncluded(new Set());
    knownEligible.current = new Set();
    setStep("runs");
  }

  async function confirmMarkPaid(txReference: string) {
    if (!markPaidTarget) return;
    setActionError(null);
    const url =
      markPaidTarget.kind === "batch"
        ? `/api/admin/payouts/batches/${markPaidTarget.id}/mark-paid`
        : `/api/admin/payouts/items/${markPaidTarget.id}/mark-paid`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txReference: txReference.trim() || null }),
    });
    const data = await readJsonBody(res).catch(() => ({}));
    if (!res.ok) {
      setActionError(data.error ?? "Error confirmando el pago");
      return;
    }
    setMarkPaidTarget(null);
    await Promise.all([loadRuns(), loadBatches()]);
  }

  async function handleUnmark(itemId: string) {
    const ok = await confirm("¿Deshacer este pago? El monto vuelve a sumarse al pendiente de este booster.", {
      confirmLabel: "Deshacer",
      danger: true,
    });
    if (!ok) return;
    setActionError(null);
    const res = await fetch(`/api/admin/payouts/items/${itemId}/unmark-paid`, { method: "POST" });
    const data = await readJsonBody(res).catch(() => ({}));
    if (!res.ok) {
      setActionError(data.error ?? "Error deshaciendo el pago");
      return;
    }
    await Promise.all([loadRuns(), loadBatches()]);
  }

  async function handleDeleteBatch(batch: PayoutBatch) {
    const confirmed = await confirm(
      `¿Eliminar este lote (${formatTimestamp(batch.createdAt)}, $${batch.total.toFixed(2)})? No se puede deshacer.`,
      { title: "Eliminar lote", confirmLabel: "Eliminar", danger: true }
    );
    if (!confirmed) return;
    setActionError(null);
    const res = await fetch(`/api/admin/payouts/batches/${batch.id}`, { method: "DELETE" });
    const data = await readJsonBody(res).catch(() => ({}));
    if (!res.ok) {
      setActionError(data.error ?? "Error eliminando el lote");
      return;
    }
    await loadBatches();
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="btn btn-ghost !px-2 !py-1 mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" />
        Volver a Balance
      </button>

      <PageHeader
        eyebrow="Economía"
        icon={Gem}
        title="Pagos"
        description="Balance fuera de la plataforma -- arma lotes para Binance «Enviar a varios destinatarios» y confirma acá cuando ya hayas pagado a mano."
      />

      {actionError && (
        <div
          className="text-sm rounded-xl p-4 mb-5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {actionError}
        </div>
      )}

      <div className="card p-6 mb-4">
        <SectionToggle
          icon={Swords}
          title="1. Elegir Runs OB a pagar"
          hint={
            step === "runs"
              ? "Marca las runs para las que ya se tiene el dinero y se puede pagar a los boosters"
              : selectedRuns.length > 0
                ? `${selectedRuns.length} run${selectedRuns.length === 1 ? "" : "s"} elegida${selectedRuns.length === 1 ? "" : "s"} · $${selectedRunsTotal.toFixed(2)}`
                : undefined
          }
          open={step === "runs"}
          onToggle={() => setStep("runs")}
          closedLabel="Editar"
        />

        {step === "runs" && (
          <div className="mt-5">
            {!runs ? (
              <p className="text-ink-muted text-sm">Cargando...</p>
            ) : runs.length === 0 ? (
              <p className="text-ink-faint text-sm">No hay ninguna Run OB pendiente de pago.</p>
            ) : (
              <>
                <div className="space-y-1.5 mb-4">
                  {runs.map((r, index) => (
                    <label
                      key={r.id}
                      className="balance-row flex items-center gap-3 rounded-xl p-3 cursor-pointer cascade-item"
                      style={cascadeStyle(index)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRunIds.has(r.id)}
                        onChange={() => toggleRun(r.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink truncate">{r.description}</p>
                        <p className="text-ink-faint text-xs">
                          {formatDayLabel(r.soldDate)} · Pot ${r.totalPrice.toFixed(2)}
                          {r.advUsername && ` · ADV ${r.advUsername}`}
                        </p>
                      </div>
                      <span className="font-data text-sm font-semibold text-ink shrink-0">
                        ${r.pendingAmount.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleContinueFromRuns}
                    disabled={selectedRunIds.size === 0}
                    className="btn btn-primary"
                  >
                    Continuar ({selectedRunIds.size})
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {hasChosenRuns && (
        <div className="card p-6 mb-8">
          <SectionToggle
            icon={Users}
            title="2. Elegir boosters a pagar"
            hint={
              step === "boosters"
                ? "Marca a quién pagarle de las runs elegidas"
                : step === "done"
                  ? "Lote ya exportado -- revisa el historial abajo"
                  : undefined
            }
            open={step === "boosters"}
            onToggle={() => setStep("boosters")}
            closedLabel="Editar"
          />

          {step === "boosters" && (
            <div className="mt-5">
              {!candidates ? (
                <p className="text-ink-muted text-sm">Cargando...</p>
              ) : candidates.length === 0 ? (
                <p className="text-ink-faint text-sm">
                  Nadie tiene saldo pendiente sin pagar en las runs elegidas.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm">
                      <thead className="text-ink-faint text-xs uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">
                            <label className="flex items-center gap-1.5 normal-case font-normal cursor-pointer">
                              <input
                                ref={selectAllRef}
                                type="checkbox"
                                checked={allEligibleIncluded}
                                disabled={eligibleKeys.length === 0}
                                onChange={toggleSelectAll}
                              />
                              Seleccionar todo
                            </label>
                          </th>
                          <th className="text-left px-3 py-2 font-semibold">Booster</th>
                          <th className="text-left px-3 py-2 font-semibold">Binance ID</th>
                          <th className="text-left px-3 py-2 font-semibold">Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map((c, index) => {
                          const missing = !c.binanceId;
                          const isEditing = editingKey === c.key;
                          return (
                            <tr key={c.key} className="border-t border-line cascade-item" style={cascadeStyle(index)}>
                              <td
                                className="px-3 py-2"
                                style={
                                  missing
                                    ? { backgroundColor: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }
                                    : undefined
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={included.has(c.key)}
                                  disabled={missing}
                                  onChange={() => toggleIncluded(c.key)}
                                />
                              </td>
                              <td
                                className="px-3 py-2"
                                style={
                                  missing
                                    ? { backgroundColor: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }
                                    : undefined
                                }
                              >
                                <p className="text-sm text-ink truncate flex items-center gap-1.5">
                                  {c.nickname ?? c.displayName}
                                  {c.isFreelance && <span className="pill pill-info text-micro px-1.5 py-0">Freelance</span>}
                                  {c.hasOpenBatch && (
                                    <span className="text-ink-faint text-label">(ya en un lote sin confirmar)</span>
                                  )}
                                </p>
                                {c.nickname && c.displayName && c.nickname !== c.displayName && (
                                  <p className="text-ink-faint text-xs truncate">{c.displayName}</p>
                                )}
                              </td>
                              <td
                                className="px-3 py-2"
                                style={
                                  missing
                                    ? { backgroundColor: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }
                                    : undefined
                                }
                              >
                                {isEditing ? (
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      className="input !py-1 text-xs w-40"
                                      placeholder="ID de Binance"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveBinanceId(c)}
                                      disabled={savingBinance}
                                      className="btn btn-primary !px-2 !py-1 text-xs"
                                    >
                                      Guardar
                                    </button>
                                  </div>
                                ) : missing ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingKey(c.key);
                                      setEditingValue("");
                                    }}
                                    className="flex items-center gap-1 text-xs"
                                    style={{ color: "var(--color-danger)" }}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Falta -- cargar
                                  </button>
                                ) : (
                                  <span className="text-ink-faint text-xs font-data">{c.binanceId}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-data text-ink font-semibold">
                                ${c.pendingAmount.toFixed(2)}
                                {c.discountApplied > 0 && (
                                  <p className="text-ink-faint text-micro font-normal font-sans">
                                    -${c.discountApplied.toFixed(2)} por descuento activo
                                  </p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-end gap-3 justify-between">
                    <div className="flex gap-3 items-end flex-wrap">
                      <div>
                        <label className="block text-xs text-ink-muted mb-1 font-medium">Moneda</label>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                          className="input !py-1.5 text-sm"
                        >
                          <option value="USDT">USDT</option>
                          <option value="USDC">USDC</option>
                          <option value="BUSD">BUSD</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-ink-muted mb-1 font-medium">Nota (opcional)</label>
                        <input
                          type="text"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Ej: Pago total por fuera"
                          className="input !py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-ink-faint text-xs uppercase tracking-wide font-semibold mb-1">
                        Total ({includedCandidates.length} boosters)
                      </p>
                      <p className="font-data text-xl font-bold text-ink mb-2">${total.toFixed(2)}</p>
                      <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting || includedCandidates.length === 0}
                        className="btn btn-primary"
                      >
                        <Download className="w-4 h-4" />
                        {exporting ? "Exportando..." : "Exportar CSV para Binance"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-ink-faint text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--color-success)" }} />
                Lote exportado -- ya podés subir el CSV a Binance.
              </p>
              <button type="button" onClick={handleStartNewBatch} className="btn btn-secondary !px-3 !py-1.5 text-sm">
                + Nuevo lote
              </button>
            </div>
          )}
        </div>
      )}

      <section>
        <h2 className="font-heading text-lg font-semibold text-ink mb-4">Historial de pagos</h2>
        {!batches ? (
          <p className="text-ink-muted text-sm">Cargando...</p>
        ) : batches.length === 0 ? (
          <p className="text-ink-faint text-sm">Aún no se armó ningún pago.</p>
        ) : (
          <div className="space-y-4">
            {batches.map((batch, index) => (
              <div key={batch.id} className="card p-5 cascade-item" style={cascadeStyle(index)}>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div>
                    <p className="text-ink text-sm font-semibold">
                      {formatTimestamp(batch.createdAt)} · {batch.currency} · ${batch.total.toFixed(2)}
                    </p>
                    {batch.note && <p className="text-ink-faint text-xs mt-0.5">{batch.note}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-semibold uppercase tracking-wide rounded px-2 py-1"
                      style={{
                        color: BATCH_STATUS_COLOR[batch.status],
                        backgroundColor: `color-mix(in srgb, ${BATCH_STATUS_COLOR[batch.status]} 16%, transparent)`,
                      }}
                    >
                      {BATCH_STATUS_LABEL[batch.status]}
                    </span>
                    <IconAction
                      icon={Download}
                      label="Volver a descargar el CSV de este lote"
                      onClick={() => downloadCsv(batch)}
                    />
                    <IconAction
                      icon={Trash2}
                      label={
                        batch.status === "pending"
                          ? "Eliminar lote"
                          : "No se puede eliminar: este lote ya tiene pagos confirmados -- deshazlos primero"
                      }
                      onClick={() => handleDeleteBatch(batch)}
                      disabled={batch.status !== "pending"}
                      className="hover:text-[color:var(--color-danger)]"
                    />
                    {batch.status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => setMarkPaidTarget({ kind: "batch", id: batch.id, label: "todo el lote" })}
                        className="btn btn-secondary !px-3 !py-1.5 text-xs"
                      >
                        Marcar lote pagado
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {batch.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2"
                      style={{ backgroundColor: "var(--color-surface-2)" }}
                    >
                      <span className="text-ink min-w-0 truncate flex items-center gap-1.5">
                        {item.discordUsername}
                        {item.isFreelance && <span className="pill pill-info text-micro px-1.5 py-0 shrink-0">Freelance</span>}
                      </span>
                      <span className="text-ink-faint text-xs font-data shrink-0">{item.binanceId}</span>
                      <span className="flex-1" />
                      <span className="flex flex-col items-end shrink-0">
                        <span className="font-data text-ink">${item.amount.toFixed(2)}</span>
                        {item.discountApplied > 0 && (
                          <span className="text-ink-faint text-micro">-${item.discountApplied.toFixed(2)} desc.</span>
                        )}
                      </span>
                      {item.status === "paid" ? (
                        <span className="flex items-center gap-2 shrink-0">
                          <span
                            className="flex items-center gap-1 text-xs"
                            style={{ color: "var(--color-success)" }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Pagado
                          </span>
                          <IconAction icon={RotateCcw} label="Deshacer pago" onClick={() => handleUnmark(item.id)} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setMarkPaidTarget({ kind: "item", id: item.id, label: item.discordUsername })
                          }
                          className="btn btn-secondary !px-2.5 !py-1 text-xs shrink-0"
                        >
                          Marcar pagado
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {markPaidTarget && (
        <MarkPaidModal
          label={markPaidTarget.label}
          onCancel={() => setMarkPaidTarget(null)}
          onConfirm={confirmMarkPaid}
        />
      )}
    </div>
  );
}

function MarkPaidModal({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: (txReference: string) => Promise<void>;
}) {
  const panelRef = useModalDismiss<HTMLDivElement>(onCancel);
  const [txReference, setTxReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(txReference);
    } finally {
      setSubmitting(false);
    }
  }

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
        aria-label="Confirmar pago"
        className="card p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-lg font-bold text-ink mb-2">Confirmar pago</h2>
        <p className="text-ink-muted text-sm leading-relaxed mb-4">
          Marca {label} como pagado -- confirma SOLO después de haber enviado el pago real en Binance. El
          estatus de las Runs OB involucradas se actualiza solo.
        </p>
        <label className="block text-xs text-ink-muted mb-1.5 font-medium">
          Referencia/ID de transacción (opcional)
        </label>
        <input
          type="text"
          value={txReference}
          onChange={(e) => setTxReference(e.target.value)}
          placeholder="ej. ID de la transacción en Binance"
          className="input w-full px-3 py-2 text-sm"
        />
        <div className="flex gap-3 mt-6 justify-end">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} disabled={submitting} className="btn btn-primary">
            {submitting ? "Confirmando..." : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
