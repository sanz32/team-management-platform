"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X, Wallet } from "lucide-react";
import BalanceHistoryCard from "../BalanceHistoryCard";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { useConfirm } from "../../../components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import { cascadeStyle } from "@/lib/cascade";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";

interface BalanceSummary {
  ib: number;
  ob: number;
  goldAmount: number;
  goldPerUsd: number | null;
  goldUsd: number;
  total: number;
}

interface Member {
  id: string;
  discord_username: string;
}

interface AdjustmentRow {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

interface ActiveObDiscountGroup {
  reason: string | null;
  totalAmount: number;
  usersAffected: number;
}

export default function AdminBalanceClient({
  canManage,
  showObBalance,
}: {
  canManage: boolean;
  showObBalance: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [usdPerMillion, setUsdPerMillion] = useState<number | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const [ibEntries, setIbEntries] = useState<AdjustmentRow[]>([]);
  const [goldEntries, setGoldEntries] = useState<AdjustmentRow[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [memberSummary, setMemberSummary] = useState<BalanceSummary | null>(null);
  const [memberHistoryKey, setMemberHistoryKey] = useState(0);

  const [guildType, setGuildType] = useState<"ib" | "gold">("gold");
  const [guildMode, setGuildMode] = useState<"full" | "amount">("full");
  const [guildAmount, setGuildAmount] = useState("");
  const [guildBusy, setGuildBusy] = useState(false);
  const [guildMessage, setGuildMessage] = useState<{ text: string; error: boolean } | null>(null);

  const [memberPayType, setMemberPayType] = useState<"ib" | "gold">("gold");
  const [memberPayAmount, setMemberPayAmount] = useState("");
  const [memberPayBusy, setMemberPayBusy] = useState(false);
  const [memberPayMessage, setMemberPayMessage] = useState<{ text: string; error: boolean } | null>(null);

  const [guildObTotal, setGuildObTotal] = useState<number | null>(null);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountBusy, setDiscountBusy] = useState(false);
  const [discountMessage, setDiscountMessage] = useState<{ text: string; error: boolean } | null>(null);

  const [activeDiscountGroups, setActiveDiscountGroups] = useState<ActiveObDiscountGroup[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState("");
  const [revertDiscountBusy, setRevertDiscountBusy] = useState(false);
  const [revertDiscountMessage, setRevertDiscountMessage] = useState<{ text: string; error: boolean } | null>(null);

  const [memberDiscountAmount, setMemberDiscountAmount] = useState("");
  const [memberDiscountReason, setMemberDiscountReason] = useState("");
  const [memberDiscountBusy, setMemberDiscountBusy] = useState(false);
  const [memberDiscountMessage, setMemberDiscountMessage] = useState<{ text: string; error: boolean } | null>(null);

  const goldPerUsd = usdPerMillion ? 1_000_000 / usdPerMillion : null;

  function loadMembersAndRate() {
    fetch("/api/members")
      .then((res) => res.json())
      .then((data) => setMembers(data.members ?? []))
      .catch(() => {});
    fetch("/api/balance/gold-rate")
      .then((res) => res.json())
      .then((data) => setUsdPerMillion(data.usdPerMillion ?? null))
      .catch(() => {});
    loadDiscountsPanel();
  }

  function loadGuildObTotal() {
    if (!canManage) return;
    fetch("/api/balance/ob-discounts/summary")
      .then((res) => res.json())
      .then((data) => setGuildObTotal(typeof data.total === "number" ? data.total : null))
      .catch(() => {});
  }

  function loadActiveDiscounts() {
    if (!canManage) return;
    fetch("/api/balance/ob-discounts")
      .then((res) => res.json())
      .then((data) => setActiveDiscountGroups(data.groups ?? []))
      .catch(() => {});
  }

  function loadDiscountsPanel() {
    loadGuildObTotal();
    loadActiveDiscounts();
  }

  useRefetchOnReturn(loadMembersAndRate);

  const filteredMembers = members.filter((m) =>
    m.discord_username.toLowerCase().includes(memberSearch.trim().toLowerCase())
  );

  useEffect(() => {
    if (filteredMembers.length === 0) return;
    if (!selectedMemberId || !filteredMembers.some((m) => m.id === selectedMemberId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMemberId(filteredMembers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMembers]);

  async function loadEntries(memberId: string) {
    setLoadingEntries(true);
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        fetch(`/api/balance/adjustments?userId=${memberId}`),
        fetch(`/api/balance/summary?userId=${memberId}`),
      ]);
      const entriesData = await entriesRes.json();
      setIbEntries(entriesData.ib ?? []);
      setGoldEntries(entriesData.gold ?? []);
      setMemberSummary(await summaryRes.json());
    } finally {
      setLoadingEntries(false);
    }
  }

  useEffect(() => {
    if (selectedMemberId) {
      (async () => {
        await loadEntries(selectedMemberId);
      })();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberPayAmount("");
    setMemberPayMessage(null);
    setMemberDiscountAmount("");
    setMemberDiscountReason("");
    setMemberDiscountMessage(null);
  }, [selectedMemberId]);

  useRefetchOnReturn(() => {
    if (selectedMemberId) loadEntries(selectedMemberId);
  });

  async function saveRate() {
    const n = Number(rateInput);
    if (!Number.isFinite(n) || n <= 0) return;
    setSavingRate(true);
    try {
      const res = await fetch("/api/balance/gold-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdPerMillion: n }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        setUsdPerMillion(data.usdPerMillion);
        setRateInput("");
        toast.success("Tasa de cambio actualizada");
      } else {
        toast.error("No se pudo guardar la tasa de cambio", data.error || undefined);
      }
    } finally {
      setSavingRate(false);
    }
  }

  async function addAdjustment(type: "ib" | "gold", amount: number, note: string) {
    if (!selectedMemberId) return;
    const res = await fetch("/api/balance/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: selectedMemberId, type, amount, note }),
    });
    if (!res.ok) {
      const err = await readJsonBody(res);
      toast.error("No se pudo agregar el ajuste", err.error || undefined);
      return;
    }
    await loadEntries(selectedMemberId);
    setMemberHistoryKey((k) => k + 1);
    toast.success("Ajuste agregado");
  }

  async function saveAdjustment(id: string, amount: number, note: string) {
    const res = await fetch(`/api/balance/adjustments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note }),
    });
    if (!res.ok) {
      const err = await readJsonBody(res);
      toast.error("No se pudo guardar el ajuste", err.error || undefined);
      return;
    }
    if (selectedMemberId) await loadEntries(selectedMemberId);
    setMemberHistoryKey((k) => k + 1);
    toast.success("Ajuste guardado");
  }

  async function deleteAdjustment(id: string) {
    const res = await fetch(`/api/balance/adjustments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await readJsonBody(res);
      toast.error("No se pudo eliminar el ajuste", err.error || undefined);
      return;
    }
    if (selectedMemberId) await loadEntries(selectedMemberId);
    setMemberHistoryKey((k) => k + 1);
    toast.success("Ajuste eliminado");
  }

  async function submitGuildPayment() {
    const typeLabel = guildType === "gold" ? "el Balance Gold en la plataforma" : "el Dólar Shop en la plataforma";

    if (guildMode === "full") {
      const confirmed = await confirm(
        `¿Marcar ${typeLabel} como pagado para TODO EL GUILD? Esto liquida el balance pendiente de esa categoría para todos los miembros a la vez, no solo para uno. Los registros quedan en el historial de cada persona como "Pagado".`,
        { title: "Pago general del guild", confirmLabel: "Marcar como pagado" }
      );
      if (!confirmed) return;

      setGuildBusy(true);
      setGuildMessage(null);
      try {
        const res = await fetch("/api/balance/mark-paid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: guildType }),
        });
        const data = await readJsonBody(res);
        if (res.ok) {
          if (selectedMemberId) await loadEntries(selectedMemberId);
          setMemberHistoryKey((k) => k + 1);
          const amountLabel =
            guildType === "gold"
              ? `${Number(data.paidAmount).toLocaleString("es-ES")} Gold`
              : `$${Number(data.paidAmount).toFixed(2)}`;
          setGuildMessage({
            text: `Listo: se marcó ${amountLabel} como pagado para ${data.usersAffected} miembro(s).`,
            error: false,
          });
        } else {
          setGuildMessage({ text: data.error ?? "No se pudo marcar como pagado", error: true });
        }
      } finally {
        setGuildBusy(false);
      }
      return;
    }

    const n = Number(guildAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    const amountLabel = guildType === "gold" ? `${n.toLocaleString("es-ES")} Gold` : `$${n.toFixed(2)}`;

    const confirmed = await confirm(
      `¿Pagar ${amountLabel} de ${typeLabel} a CADA miembro con saldo pendiente? A quien tenga menos pendiente que ese monto se le paga todo lo que tiene. Esto no se puede deshacer.`,
      { title: "Pago parejo para todo el guild", confirmLabel: "Pagar a todos" }
    );
    if (!confirmed) return;

    setGuildBusy(true);
    setGuildMessage(null);
    try {
      const res = await fetch("/api/balance/adjustments/pay-partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, type: guildType, amount: n }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        if (selectedMemberId) await loadEntries(selectedMemberId);
        setMemberHistoryKey((k) => k + 1);
        setGuildAmount("");
        const totalLabel =
          guildType === "gold"
            ? `${Number(data.totalPaid).toLocaleString("es-ES")} Gold`
            : `$${Number(data.totalPaid).toFixed(2)}`;
        setGuildMessage({
          text: `Listo: se pagó hasta ${amountLabel} a ${data.usersAffected} miembro(s) (total ${totalLabel}).`,
          error: false,
        });
      } else {
        setGuildMessage({ text: data.error ?? "Error registrando el pago parejo", error: true });
      }
    } catch {
      setGuildMessage({ text: "Error registrando el pago parejo", error: true });
    } finally {
      setGuildBusy(false);
    }
  }

  async function submitMemberPayment() {
    if (!selectedMemberId) return;
    const n = Number(memberPayAmount);
    if (!Number.isFinite(n) || n <= 0) return;

    setMemberPayBusy(true);
    setMemberPayMessage(null);
    try {
      const res = await fetch("/api/balance/adjustments/pay-partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedMemberId, type: memberPayType, amount: n }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        await loadEntries(selectedMemberId);
        setMemberHistoryKey((k) => k + 1);
        setMemberPayAmount("");
        const amountLabel = memberPayType === "gold" ? `${n.toLocaleString("es-ES")} Gold` : `$${n.toFixed(2)}`;
        setMemberPayMessage({ text: `Listo: se marcó ${amountLabel} como pagado.`, error: false });
      } else {
        setMemberPayMessage({ text: data.error ?? "Error registrando el pago parcial", error: true });
      }
    } catch {
      setMemberPayMessage({ text: "Error registrando el pago parcial", error: true });
    } finally {
      setMemberPayBusy(false);
    }
  }

  async function submitGuildDiscount() {
    const n = Number(discountAmount);
    if (!Number.isFinite(n) || n <= 0) return;

    const confirmed = await confirm(
      `¿Descontar $${n.toFixed(2)} de Runs OB a CADA miembro con saldo pendiente? A quien tenga menos pendiente que ese monto se le descuenta todo lo que tiene. Esto se puede reintegrar después desde el historial.`,
      { title: "Descuento para todo el guild", confirmLabel: "Descontar a todos" }
    );
    if (!confirmed) return;

    setDiscountBusy(true);
    setDiscountMessage(null);
    try {
      const res = await fetch("/api/balance/ob-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, amount: n, reason: discountReason.trim() || undefined }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        if (selectedMemberId) await loadEntries(selectedMemberId);
        setMemberHistoryKey((k) => k + 1);
        loadDiscountsPanel();
        setDiscountAmount("");
        setDiscountReason("");
        setDiscountMessage({
          text: `Listo: se descontó hasta $${n.toFixed(2)} a ${data.usersAffected} miembro(s) (total $${Number(data.totalDiscounted).toFixed(2)}).`,
          error: false,
        });
      } else {
        setDiscountMessage({ text: data.error ?? "Error aplicando el descuento", error: true });
      }
    } catch {
      setDiscountMessage({ text: "Error aplicando el descuento", error: true });
    } finally {
      setDiscountBusy(false);
    }
  }

  async function submitRevertDiscountGroup() {
    if (selectedGroupIndex === "") return;
    const group = activeDiscountGroups[Number(selectedGroupIndex)];
    if (!group) return;

    const reasonLabel = group.reason || "Sin motivo";
    const confirmed = await confirm(
      `¿Reintegrar el descuento "${reasonLabel}" a los ${group.usersAffected} miembro(s) que lo tienen activo (total $${group.totalAmount.toFixed(2)})? El monto de cada uno vuelve a sumarse a su pendiente de Runs OB.`,
      { title: "Reintegrar descuento", confirmLabel: "Reintegrar a todos" }
    );
    if (!confirmed) return;

    setRevertDiscountBusy(true);
    setRevertDiscountMessage(null);
    try {
      const res = await fetch("/api/balance/ob-discounts/revert-by-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: group.reason }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        if (selectedMemberId) await loadEntries(selectedMemberId);
        setMemberHistoryKey((k) => k + 1);
        loadDiscountsPanel();
        setSelectedGroupIndex("");
        setRevertDiscountMessage({
          text: `Listo: se reintegraron $${Number(data.revertedAmount).toFixed(2)} a ${data.usersAffected} miembro(s).`,
          error: false,
        });
      } else {
        setRevertDiscountMessage({ text: data.error ?? "Error reintegrando el descuento", error: true });
      }
    } catch {
      setRevertDiscountMessage({ text: "Error reintegrando el descuento", error: true });
    } finally {
      setRevertDiscountBusy(false);
    }
  }

  async function submitMemberDiscount() {
    if (!selectedMemberId) return;
    const n = Number(memberDiscountAmount);
    if (!Number.isFinite(n) || n <= 0) return;

    setMemberDiscountBusy(true);
    setMemberDiscountMessage(null);
    try {
      const res = await fetch("/api/balance/ob-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedMemberId,
          amount: n,
          reason: memberDiscountReason.trim() || undefined,
        }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        await loadEntries(selectedMemberId);
        setMemberHistoryKey((k) => k + 1);
        loadDiscountsPanel();
        setMemberDiscountAmount("");
        setMemberDiscountReason("");
        setMemberDiscountMessage({
          text: `Listo: se descontaron $${Number(data.discountedAmount).toFixed(2)}.`,
          error: false,
        });
      } else {
        setMemberDiscountMessage({ text: data.error ?? "Error aplicando el descuento", error: true });
      }
    } catch {
      setMemberDiscountMessage({ text: "Error aplicando el descuento", error: true });
    } finally {
      setMemberDiscountBusy(false);
    }
  }

  const selectedMember = filteredMembers.find((m) => m.id === selectedMemberId) ?? null;
  const memberPayPending = memberPayType === "gold" ? memberSummary?.goldAmount : memberSummary?.ib;

  return (
    <div>
      <Link href="/balance" className="text-sm text-ink-muted hover:text-ink transition-colors inline-flex items-center gap-1.5">
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver a Balance
      </Link>

      <PageHeader
        eyebrow="Economía"
        icon={Wallet}
        title="Administrar balance"
        description="Ajustes de Balance en la plataforma y Gold, pagos al guild y descuentos de Runs OB."
      />

      <div className="flex flex-wrap gap-5 mb-5 items-stretch">
        <div className="card p-5 flex-1 min-w-[280px] max-w-sm">
          <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-2">
            Tasa de cambio Gold → USD
          </p>
          <p className="text-sm text-ink mb-3">
            Actual:{" "}
            {usdPerMillion ? (
              <span className="font-semibold">1.000.000 Gold = ${usdPerMillion.toLocaleString("es-ES")} USD</span>
            ) : (
              "sin configurar"
            )}
          </p>
          {canManage && (
            <div className="flex items-end gap-2.5">
              <div>
                <label className="block text-label text-ink-muted mb-1 font-medium">
                  Precio de 1.000.000 Gold (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="input px-2.5 py-1.5 text-sm w-32"
                />
              </div>
              <button
                type="button"
                onClick={saveRate}
                disabled={savingRate || !rateInput}
                className="btn btn-primary !px-3 !py-1.5 text-xs"
              >
                {savingRate ? "Guardando..." : "Actualizar"}
              </button>
            </div>
          )}
        </div>

        {canManage && (
        <div className="card p-5 flex-1 min-w-[280px] max-w-sm">
          <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-2">Pagos al guild</p>

          <SegmentedToggle
            className="mb-3"
            value={guildType}
            onChange={(v) => {
              setGuildType(v);
              setGuildMessage(null);
            }}
            options={[
              { value: "gold", label: "Gold" },
              { value: "ib", label: "Shop Dólar" },
            ]}
          />

          <SegmentedToggle
            className="mb-3"
            value={guildMode}
            onChange={(v) => {
              setGuildMode(v);
              setGuildMessage(null);
            }}
            options={[
              { value: "full", label: "Todo lo pendiente" },
              { value: "amount", label: "Monto por persona" },
            ]}
          />

          {guildMode === "amount" ? (
            <div className="flex items-end gap-2.5">
              <div>
                <label className="block text-label text-ink-muted mb-1 font-medium">Monto por miembro</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={guildAmount}
                  onChange={(e) => setGuildAmount(e.target.value)}
                  className="input px-2.5 py-1.5 text-sm w-32"
                />
              </div>
              <button
                type="button"
                onClick={submitGuildPayment}
                disabled={guildBusy || !guildAmount || !(Number(guildAmount) > 0)}
                className="btn btn-primary !px-3 !py-1.5 text-xs"
              >
                {guildBusy ? "Guardando..." : "Pagar a todos"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={submitGuildPayment}
              disabled={guildBusy}
              className="btn btn-primary !px-3 !py-1.5 text-xs"
            >
              {guildBusy ? "Marcando..." : "Marcar todo pagado"}
            </button>
          )}
          {guildMessage && (
            <p
              className="text-xs mt-2"
              style={{ color: guildMessage.error ? "var(--color-danger)" : "var(--color-success)" }}
            >
              {guildMessage.text}
            </p>
          )}
        </div>
        )}

        {canManage && showObBalance && (
        <div className="card p-5 flex-1 min-w-[280px] max-w-sm">
          <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-2">Descuentos</p>
          <p className="text-sm text-ink mb-3">
            Saldo Runs OB pendiente (todo el guild):{" "}
            <span className="font-data font-semibold">
              {guildObTotal !== null ? `$${guildObTotal.toFixed(2)}` : "cargando..."}
            </span>
          </p>

          <div className="flex items-end gap-2.5 mb-2.5">
            <div>
              <label className="block text-label text-ink-muted mb-1 font-medium">Monto por miembro</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="input px-2.5 py-1.5 text-sm w-32"
              />
            </div>
            <button
              type="button"
              onClick={submitGuildDiscount}
              disabled={discountBusy || !discountAmount || !(Number(discountAmount) > 0)}
              className="btn btn-primary !px-3 !py-1.5 text-xs"
            >
              {discountBusy ? "Guardando..." : "Descontar a todos"}
            </button>
          </div>

          <div className="mb-2.5">
            <label className="block text-label text-ink-muted mb-1 font-medium">Motivo (opcional)</label>
            <input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              className="input px-2.5 py-1.5 text-sm w-full"
            />
          </div>

          {discountMessage && (
            <p
              className="text-xs"
              style={{ color: discountMessage.error ? "var(--color-danger)" : "var(--color-success)" }}
            >
              {discountMessage.text}
            </p>
          )}
        </div>
        )}

        {canManage && showObBalance && (
        <div className="card p-5 flex-1 min-w-[280px] max-w-sm">
          <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-2">Reintegrar descuento</p>
          <p className="text-sm text-ink-muted mb-3">Elige un motivo para reintegrarlo a todos los que lo tienen.</p>

          <select
            value={selectedGroupIndex}
            onChange={(e) => {
              setSelectedGroupIndex(e.target.value);
              setRevertDiscountMessage(null);
            }}
            className="input px-2.5 py-1.5 text-sm w-full mb-2.5"
          >
            <option value="">
              {activeDiscountGroups.length === 0 ? "Sin descuentos activos" : "Elige un motivo..."}
            </option>
            {activeDiscountGroups.map((g, i) => (
              <option key={i} value={String(i)}>
                {g.reason || "Sin motivo"} — ${g.totalAmount.toFixed(2)} ({g.usersAffected} miembro
                {g.usersAffected === 1 ? "" : "s"})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submitRevertDiscountGroup}
            disabled={revertDiscountBusy || selectedGroupIndex === ""}
            className="btn btn-primary !px-3 !py-1.5 text-xs"
          >
            {revertDiscountBusy ? "Reintegrando..." : "Reintegrar a todos"}
          </button>
          {revertDiscountMessage && (
            <p
              className="text-xs mt-2"
              style={{ color: revertDiscountMessage.error ? "var(--color-danger)" : "var(--color-success)" }}
            >
              {revertDiscountMessage.text}
            </p>
          )}
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="card p-4 h-fit">
          <input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Buscar miembro..."
            className="input w-full px-3 py-2 text-sm mb-3"
          />
          <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
            {filteredMembers.map((m) => {
              const isSelected = m.id === selectedMemberId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors"
                  style={
                    isSelected
                      ? {
                          backgroundColor: "var(--color-surface-2)",
                          border: "1px solid var(--color-line-strong)",
                          color: "var(--color-ink)",
                        }
                      : { border: "1px solid transparent", color: "var(--color-ink-muted)" }
                  }
                >
                  <span className="truncate">{m.discord_username}</span>
                </button>
              );
            })}
            {filteredMembers.length === 0 && (
              <p className="text-ink-faint text-xs text-center py-6">Sin resultados.</p>
            )}
          </div>
        </div>

        <div className="card p-5">
          {!selectedMember ? (
            <p className="text-ink-faint text-sm text-center py-16">
              Elige un miembro de la lista para gestionar su balance.
            </p>
          ) : loadingEntries ? (
            <p className="text-ink-muted text-sm">Cargando...</p>
          ) : (
            <div className="space-y-6">
              <h3 className="font-heading text-lg font-bold text-ink">
                {selectedMember.discord_username}
              </h3>

              {memberSummary && (
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-ink-muted">
                    Balance en la plataforma (Shop Dólar):{" "}
                    <span className="font-data font-semibold text-ink">${memberSummary.ib.toFixed(2)}</span>
                  </span>
                  <span className="text-ink-muted">
                    Balance en la plataforma (Gold):{" "}
                    <span className="font-data font-semibold text-ink">
                      {memberSummary.goldAmount.toLocaleString("es-ES")}
                    </span>
                  </span>
                  {showObBalance && (
                    <span className="text-ink-muted">
                      Balance fuera de la plataforma:{" "}
                      <span className="font-data font-semibold text-ink">${memberSummary.ob.toFixed(2)}</span>
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4 items-stretch">
              {canManage && memberSummary && (
                <div
                  className="rounded-xl p-4 flex-1 min-w-[280px]"
                  style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
                >
                  <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-2">
                    Pagar fracción
                  </p>
                  <SegmentedToggle
                    className="mb-3"
                    value={memberPayType}
                    onChange={(v) => {
                      setMemberPayType(v);
                      setMemberPayMessage(null);
                    }}
                    options={[
                      { value: "gold", label: "Gold" },
                      { value: "ib", label: "Shop Dólar" },
                    ]}
                  />
                  <p className="text-xs text-ink-muted mb-2">
                    Pendiente:{" "}
                    <span className="font-data font-semibold text-ink">
                      {memberPayType === "gold"
                        ? `${(memberPayPending ?? 0).toLocaleString("es-ES")} Gold`
                        : `$${(memberPayPending ?? 0).toFixed(2)}`}
                    </span>
                  </p>
                  <div className="flex items-end gap-2.5">
                    <div>
                      <label className="block text-label text-ink-muted mb-1 font-medium">Monto pagado</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={memberPayAmount}
                        onChange={(e) => setMemberPayAmount(e.target.value)}
                        className="input px-2.5 py-1.5 text-sm w-32"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={submitMemberPayment}
                      disabled={
                        memberPayBusy ||
                        !memberPayAmount ||
                        !(Number(memberPayAmount) > 0) ||
                        Number(memberPayAmount) > (memberPayPending ?? 0) + 0.005
                      }
                      className="btn btn-primary !px-3 !py-1.5 text-xs"
                    >
                      {memberPayBusy ? "Guardando..." : "Marcar pagado"}
                    </button>
                  </div>
                  {memberPayMessage && (
                    <p
                      className="text-xs mt-2"
                      style={{ color: memberPayMessage.error ? "var(--color-danger)" : "var(--color-success)" }}
                    >
                      {memberPayMessage.text}
                    </p>
                  )}
                </div>
              )}

              {canManage && showObBalance && memberSummary && (
                <div
                  className="rounded-xl p-4 flex-1 min-w-[280px]"
                  style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
                >
                  <p className="text-xs text-ink-muted uppercase tracking-wide font-semibold mb-2">
                    Descuento Runs OB
                  </p>
                  <p className="text-xs text-ink-muted mb-2">
                    Pendiente:{" "}
                    <span className="font-data font-semibold text-ink">${memberSummary.ob.toFixed(2)}</span>
                  </p>
                  <div className="flex items-end gap-2.5 mb-2.5">
                    <div>
                      <label className="block text-label text-ink-muted mb-1 font-medium">Monto a descontar</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={memberDiscountAmount}
                        onChange={(e) => setMemberDiscountAmount(e.target.value)}
                        className="input px-2.5 py-1.5 text-sm w-32"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={submitMemberDiscount}
                      disabled={
                        memberDiscountBusy ||
                        !memberDiscountAmount ||
                        !(Number(memberDiscountAmount) > 0) ||
                        Number(memberDiscountAmount) > memberSummary.ob + 0.005
                      }
                      className="btn btn-primary !px-3 !py-1.5 text-xs"
                    >
                      {memberDiscountBusy ? "Guardando..." : "Aplicar descuento"}
                    </button>
                  </div>
                  <div>
                    <label className="block text-label text-ink-muted mb-1 font-medium">Motivo (opcional)</label>
                    <input
                      value={memberDiscountReason}
                      onChange={(e) => setMemberDiscountReason(e.target.value)}
                      className="input px-2.5 py-1.5 text-sm w-full"
                    />
                  </div>
                  {memberDiscountMessage && (
                    <p
                      className="text-xs mt-2"
                      style={{ color: memberDiscountMessage.error ? "var(--color-danger)" : "var(--color-success)" }}
                    >
                      {memberDiscountMessage.text}
                    </p>
                  )}
                </div>
              )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <AdjustmentSection
                  title="Balance en la plataforma (Shop Dólar)"
                  entries={ibEntries}
                  canManage={canManage}
                  onAdd={(amount, note) => addAdjustment("ib", amount, note)}
                  onSave={saveAdjustment}
                  onDelete={deleteAdjustment}
                  formatAmount={(n) => `$${n.toFixed(2)}`}
                />
                <AdjustmentSection
                  title="Balance en la plataforma (Gold)"
                  entries={goldEntries}
                  canManage={canManage}
                  onAdd={(amount, note) => addAdjustment("gold", amount, note)}
                  onSave={saveAdjustment}
                  onDelete={deleteAdjustment}
                  formatAmount={(n) => `${n.toLocaleString("es-ES")} Gold`}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-ink mb-2">
                  Historial de {selectedMember.discord_username}
                </p>
                <BalanceHistoryCard
                  userId={selectedMemberId ?? undefined}
                  goldPerUsd={goldPerUsd}
                  refreshKey={memberHistoryKey}
                  canDelete={canManage}
                  showObBalance={showObBalance}
                  onMutate={() => {
                    if (selectedMemberId) loadEntries(selectedMemberId);
                    loadDiscountsPanel();
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdjustmentSection({
  title,
  entries,
  canManage,
  onAdd,
  onSave,
  onDelete,
  formatAmount,
}: {
  title: string;
  entries: AdjustmentRow[];
  canManage: boolean;
  onAdd: (amount: number, note: string) => Promise<void>;
  onSave: (id: string, amount: number, note: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  formatAmount: (n: number) => string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function startAdd() {
    setEditingId("new");
    setAmount("");
    setNote("");
  }

  function startEdit(row: AdjustmentRow) {
    setEditingId(row.id);
    setAmount(String(row.amount));
    setNote(row.note ?? "");
  }

  function cancel() {
    setEditingId(null);
    setAmount("");
    setNote("");
  }

  async function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) return;
    setBusy(true);
    try {
      if (editingId === "new") await onAdd(n, note);
      else if (editingId) await onSave(editingId, n, note);
      cancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {canManage && editingId === null && (
          <button
            type="button"
            onClick={startAdd}
            className="text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ color: "var(--color-secondary)" }}
          >
            + Agregar
          </button>
        )}
      </div>

      <div className="space-y-1.5 mb-2">
        {entries.map((row, index) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm cascade-item"
            style={{
              backgroundColor: "var(--color-surface-2)",
              border: "1px solid var(--color-line)",
              ...cascadeStyle(index),
            }}
          >
            <div>
              <span className="font-data font-semibold text-ink">{formatAmount(row.amount)}</span>
              {row.note && <span className="text-ink-faint"> — {row.note}</span>}
            </div>
            {canManage && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="text-ink-faint hover:text-[color:var(--color-secondary)] text-xs font-medium transition-colors"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(row.id)}
                  className="text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && editingId === null && (
          <p className="text-ink-faint text-xs">Sin ajustes pendientes.</p>
        )}
      </div>

      {editingId !== null && (
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="block text-label text-ink-muted mb-1 font-medium">Monto</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input px-2.5 py-1.5 text-sm w-28"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-label text-ink-muted mb-1 font-medium">Nota (opcional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input px-2.5 py-1.5 text-sm w-full"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn btn-primary !px-3 !py-1.5 text-xs"
          >
            {busy ? "Guardando..." : editingId === "new" ? "Agregar" : "Guardar"}
          </button>
          <button type="button" onClick={cancel} className="btn btn-ghost !px-3 !py-1.5 text-xs">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${className ?? ""}`}
      style={{ backgroundColor: "var(--color-canvas)", border: "1px solid var(--color-line)" }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
            style={
              active
                ? {
                    backgroundColor: "var(--color-surface-2)",
                    border: "1px solid var(--color-line-strong)",
                    color: "var(--color-ink)",
                  }
                : { border: "1px solid transparent", color: "var(--color-ink-muted)" }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
