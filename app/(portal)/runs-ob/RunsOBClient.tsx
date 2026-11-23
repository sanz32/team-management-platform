"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Clock, Minus, Pencil, Plus, Swords, Trash2, Users, Wallet } from "lucide-react";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import WclFightPicker, { WclMatchedMember, WclUnknownActor } from "../../components/WclFightPicker";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { buildRunName, RunNamingCatalog } from "@/lib/run-naming";
import { cascadeStyle } from "@/lib/cascade";
import EmptyState from "../../components/EmptyState";
import IconAction from "../../components/IconAction";
import IconBadge from "../../components/dashboard/IconBadge";
import SectionToggle from "../../components/SectionToggle";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";

interface Member {
  id: string;
  discord_username: string;
}

interface FreelancerOption {
  id: string;
  name: string;
  binanceId: string | null;
}

interface BoosterCut {
  user_id: string | null;
  discord_username: string;
  is_freelance: boolean;
  cut_percent: number;
  cut_amount: number;
  paid: boolean;
}

interface ServiceRow {
  id: string;
  description: string;
  total_price: number;
  currency: string;
  sold_date: string;
  created_at: string;
  adv_user_id: string | null;
  adv_username: string | null;
  adv_cut_percent: number;
  fully_paid: boolean;
  boosters: BoosterCut[];
  my_cut?: number;
}

interface BoosterEntry {
  key: string;
  userId: string | null;
  freelanceName: string;
  cutPercent: number;
}

function makeMemberEntry(userId: string): BoosterEntry {
  return { key: `user:${userId}`, userId, freelanceName: "", cutPercent: 100 };
}

function makeFreelanceEntry(freelanceName = ""): BoosterEntry {
  const key = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return { key: `freelance:${key}`, userId: null, freelanceName, cutPercent: 100 };
}

function foldFreelanceName(name: string): string {
  return name.trim().toLowerCase();
}

const NO_ADV = "none";

const DEFAULT_ADV_CUT_PERCENT = "20";

const emptyForm = { description: "", advUserId: "", pot: "", advCutPercent: DEFAULT_ADV_CUT_PERCENT };

function groupByCreationDate(services: ServiceRow[]) {
  const groups = new Map<string, ServiceRow[]>();
  for (const s of services) {
    const raw = new Date(s.created_at).toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    const list = groups.get(label) ?? [];
    list.push(s);
    groups.set(label, list);
  }
  return groups;
}

function sharedCutAmount(boosters: BoosterCut[]): number | null {
  if (boosters.length === 0) return null;
  const first = boosters[0].cut_amount;
  return boosters.every((b) => Math.abs(b.cut_amount - first) < 0.005) ? first : null;
}

function runPayStatus(s: ServiceRow): "paid" | "partial" | "pending" {
  if (s.fully_paid) return "paid";
  const memberBoosters = s.boosters.filter((b) => !b.is_freelance);
  if (memberBoosters.some((b) => b.paid)) return "partial";
  return "pending";
}

export default function RunsOBClient({ canManage }: { canManage: boolean }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [freelancers, setFreelancers] = useState<FreelancerOption[]>([]);
  const [raidCatalog, setRaidCatalog] = useState<RunNamingCatalog>({ raids: [], encounterToBoss: {} });
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [boosterEntries, setBoosterEntries] = useState<BoosterEntry[]>([]);
  const [boosterSearch, setBoosterSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [wclSummary, setWclSummary] = useState<{
    matched: WclMatchedMember[];
    unknown: WclUnknownActor[];
  } | null>(null);
  const [namingWarning, setNamingWarning] = useState("");

  const acknowledgedFreelanceNames = useRef<Set<string>>(new Set());

  async function loadServices() {
    const res = await fetch(`/api/services${canManage ? "?all=true" : ""}`);
    const data = await readJsonBody(res);
    setServices(data.services ?? []);
  }

  async function loadMembers() {
    const res = await fetch("/api/members");
    const data = await readJsonBody(res);
    setMembers(data.members ?? []);
  }

  async function loadFreelancers() {
    const res = await fetch("/api/admin/freelancers");
    if (!res.ok) return;
    const data = await readJsonBody(res);
    setFreelancers(data.freelancers ?? []);
  }

  async function loadRaidCatalog() {
    const res = await fetch("/api/raids");
    if (!res.ok) return;
    const data = await readJsonBody(res);
    setRaidCatalog({ raids: data.raids ?? [], encounterToBoss: data.encounterToBoss ?? {} });
  }

  async function loadAll() {
    setLoading(true);
    await loadServices();
    if (canManage) await Promise.all([loadMembers(), loadFreelancers(), loadRaidCatalog()]);
    setLoading(false);
  }

  useRefetchOnReturn(loadAll);

  function toggleBooster(id: string) {
    setBoosterEntries((prev) => {
      if (prev.some((e) => e.userId === id)) return prev.filter((e) => e.userId !== id);
      return [...prev, makeMemberEntry(id)];
    });
  }

  function addFreelance() {
    setBoosterEntries((prev) => [...prev, makeFreelanceEntry()]);
  }

  function updateFreelanceName(key: string, name: string) {
    setBoosterEntries((prev) => prev.map((e) => (e.key === key ? { ...e, freelanceName: name } : e)));
  }

  function updateCutPercent(key: string, percent: number) {
    setBoosterEntries((prev) => prev.map((e) => (e.key === key ? { ...e, cutPercent: percent } : e)));
  }

  function removeBoosterEntry(key: string) {
    setBoosterEntries((prev) => prev.filter((e) => e.key !== key));
  }

  function handleWclResolved({
    matched,
    unknown,
    selectedFights,
  }: {
    matched: WclMatchedMember[];
    unknown: WclUnknownActor[];
    selectedFights: { encounterId: number; difficulty: number | null }[];
  }) {
    setWclSummary({ matched, unknown });
    setBoosterEntries(matched.map((m) => makeMemberEntry(m.user_id)));

    const { name, error } = buildRunName(selectedFights, raidCatalog);
    setNamingWarning(error ?? "");
    if (name) {
      setForm((prev) => ({ ...prev, description: name }));
    }
  }

  function startEdit(service: ServiceRow) {
    setEditingId(service.id);
    setForm({
      description: service.description,
      advUserId: service.adv_user_id ?? NO_ADV,
      pot: String(service.total_price),
      advCutPercent: String(service.adv_cut_percent),
    });
    setBoosterEntries(
      service.boosters.map((b) => ({
        ...(b.user_id ? makeMemberEntry(b.user_id) : makeFreelanceEntry(b.discord_username)),
        cutPercent: b.cut_percent,
      }))
    );
    for (const b of service.boosters) {
      if (!b.user_id) acknowledgedFreelanceNames.current.add(foldFreelanceName(b.discord_username));
    }
    setFormError("");
    setWclSummary(null);
    setNamingWarning("");
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setBoosterEntries([]);
    setBoosterSearch("");
    setFormError("");
    setWclSummary(null);
    setNamingWarning("");
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const pot = Number(form.pot);
    const advCutPercent = Number(form.advCutPercent);
    if (!form.description || form.advUserId === "" || !pot || pot <= 0 || boosterEntries.length === 0) {
      setFormError("Completa Run, ADV, Pot y selecciona al menos un booster.");
      return;
    }
    if (Number.isNaN(advCutPercent) || advCutPercent < 0 || advCutPercent > 100) {
      setFormError("El % de ADV tiene que estar entre 0 y 100.");
      return;
    }
    if (boosterEntries.some((e) => !e.userId && !e.freelanceName.trim())) {
      setFormError("Todo participante Freelance necesita un nombre.");
      return;
    }
    if (boosterEntries.some((e) => Number.isNaN(e.cutPercent) || e.cutPercent < 0 || e.cutPercent > 100)) {
      setFormError("El % de cut de cada booster tiene que estar entre 0 y 100.");
      return;
    }

    const newMatches = new Map<string, FreelancerOption>();
    for (const e of boosterEntries) {
      if (e.userId || !e.freelanceName.trim()) continue;
      const folded = foldFreelanceName(e.freelanceName);
      if (acknowledgedFreelanceNames.current.has(folded) || newMatches.has(folded)) continue;
      const existing = freelancers.find((f) => foldFreelanceName(f.name) === folded);
      if (existing) newMatches.set(folded, existing);
    }

    if (newMatches.size > 0) {
      const lines = Array.from(newMatches.values())
        .map((f) => `• ${f.name} (${f.binanceId ? "Binance ID ya cargado" : "sin Binance ID cargado todavía"})`)
        .join("\n");
      const ok = await confirm(
        `Ya existe un Freelance guardado con este nombre:\n\n${lines}\n\nSi alguno es una persona DISTINTA con el mismo nombre, cancela y cambia el nombre antes de continuar -- si no, se va a fusionar con el perfil ya guardado y van a compartir el mismo Binance ID.`,
        { title: "Freelance ya guardado", confirmLabel: "Sí, es la misma persona" }
      );
      if (!ok) return;
      for (const folded of newMatches.keys()) acknowledgedFreelanceNames.current.add(folded);
    }

    setSubmitting(true);
    try {
      const res = await fetch(editingId ? `/api/services/${editingId}` : "/api/services", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          advUserId: form.advUserId === NO_ADV ? null : form.advUserId,
          pot,
          advCutPercent,
          boosters: boosterEntries.map((e) => ({
            userId: e.userId,
            freelanceName: e.userId ? null : e.freelanceName.trim(),
            cutPercent: e.cutPercent,
          })),
        }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setFormError(data.error || "No se pudo guardar la run.");
        return;
      }
      cancelEdit();
      await loadServices();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, description: string) {
    const confirmed = await confirm(`¿Eliminar la run "${description}"? Esta acción no se puede deshacer.`, {
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!confirmed) return;

    const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) cancelEdit();
      await loadServices();
      toast.success("Run eliminada");
    } else {
      const err = await readJsonBody(res);
      toast.error("No se pudo eliminar la run", err.error || undefined);
    }
  }

  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, m.discord_username])), [members]);

  const restMembers = useMemo(() => {
    const q = boosterSearch.trim().toLowerCase();
    const selectedIds = new Set(boosterEntries.map((e) => e.userId).filter((id): id is string => Boolean(id)));
    return members
      .filter((m) => !selectedIds.has(m.id))
      .filter((m) => !q || m.discord_username.toLowerCase().includes(q));
  }, [members, boosterEntries, boosterSearch]);

  if (loading) return <LoadingState count={6} />;

  const grouped = groupByCreationDate(services);
  const unpaidCount = services.filter((s) => !s.fully_paid).length;
  const potTotal = services.reduce((sum, s) => sum + Number(s.total_price), 0);
  const myCutTotal = services.reduce((sum, s) => sum + (s.my_cut ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Economía"
        icon={Swords}
        title="Runs OB"
        description="Runs, boosters y reparto de cuts del guild"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatTile icon={Swords} color="var(--color-secondary)" label="Runs" value={services.length} />
        {canManage ? (
          <StatTile
            icon={Wallet}
            color="var(--color-primary)"
            label="Pot"
            value={`$${potTotal.toFixed(2)}`}
            hint="Suma de estas runs"
          />
        ) : (
          <StatTile
            icon={Wallet}
            color="var(--color-primary)"
            label="Tu cut"
            value={`$${myCutTotal.toFixed(2)}`}
            hint="Suma de estas runs"
          />
        )}
        <StatTile
          icon={Clock}
          color={unpaidCount > 0 ? "var(--color-warning)" : "var(--color-success)"}
          label="Sin pagar"
          value={unpaidCount}
          hint={unpaidCount === 0 ? "Todo liquidado" : undefined}
        />
      </div>

      {canManage && (
        <div className="card p-6 mb-8">
          <SectionToggle
            icon={editingId ? Pencil : Plus}
            title={editingId ? "Editar run" : "Agregar run"}
            hint={
              editingId
                ? "Cambia boosters, ADV o pot de una run ya registrada"
                : "Importa las peleas desde Warcraft Logs o carga los boosters a mano"
            }
            open={showForm}
            onToggle={() => (showForm ? cancelEdit() : setShowForm(true))}
            closedLabel="Abrir"
          />

          {showForm && (
          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
          >
            <label className="block text-xs text-ink-muted mb-2 font-medium">
              Importar desde Warcraft Logs (opcional) — solo completa los campos Run y Boosters
            </label>
            <WclFightPicker confirmLabel="Buscar boosters de estas peleas" onResolved={handleWclResolved} />
            {namingWarning && (
              <p className="text-xs mt-2.5" style={{ color: "var(--color-danger)" }}>
                {namingWarning}
              </p>
            )}
            {wclSummary && (
              <p className="text-ink-faint text-xs mt-2.5">
                {wclSummary.matched.length} miembro{wclSummary.matched.length === 1 ? "" : "s"} matcheado
                {wclSummary.matched.length === 1 ? "" : "s"} como booster
                {wclSummary.matched.length === 1 ? "" : "s"}
                {wclSummary.unknown.length > 0 && ` · ${wclSummary.unknown.length} sin match en el guild`}.
                Revisa la lista de Boosters abajo antes de generar la run.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 items-start">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">Run</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Nombre de la Run"
                  className="input w-full px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">ADV</label>
                <select
                  value={form.advUserId}
                  onChange={(e) => setForm({ ...form, advUserId: e.target.value })}
                  className="input w-full px-3 py-2 text-sm"
                >
                  <option value="">Selecciona...</option>
                  <option value={NO_ADV}>No</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.discord_username}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-muted mb-1.5 font-medium">% ADV</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.advCutPercent}
                    onChange={(e) => setForm({ ...form, advCutPercent: e.target.value })}
                    disabled={form.advUserId === NO_ADV}
                    className="input w-full px-3 py-2 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1.5 font-medium">Pot ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.pot}
                    onChange={(e) => setForm({ ...form, pot: e.target.value })}
                    className="input w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <label className="text-xs text-ink-muted font-medium">
                  Boosters
                  {boosterEntries.length > 0 && (
                    <span className="text-ink-faint font-normal"> · {boosterEntries.length} elegidos</span>
                  )}
                </label>
                {boosterEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBoosterEntries([])}
                    className="text-xs text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
                  >
                    Quitar todos
                  </button>
                )}
              </div>

              {boosterEntries.length > 0 && (
                <div
                  className="grid gap-2 mb-3"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
                >
                  {boosterEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className="rounded-lg p-2 flex flex-col gap-1.5"
                      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        {entry.userId ? (
                          <span className="text-sm text-ink min-w-0 truncate">
                            {memberNameById.get(entry.userId) ?? "Desconocido"}
                          </span>
                        ) : (
                          <span className="pill pill-info text-micro px-1.5 py-0.5 shrink-0">Freelance</span>
                        )}
                        <IconAction
                          icon={Trash2}
                          label="Quitar booster"
                          onClick={() => removeBoosterEntry(entry.key)}
                          className="shrink-0 hover:text-[color:var(--color-danger)]"
                        />
                      </div>

                      {!entry.userId && (
                        <input
                          value={entry.freelanceName}
                          onChange={(e) => updateFreelanceName(entry.key, e.target.value)}
                          placeholder="Nombre..."
                          list="freelancer-names"
                          className="input w-full px-2 py-1 text-sm"
                        />
                      )}

                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          value={entry.cutPercent}
                          onChange={(e) => updateCutPercent(entry.key, Number(e.target.value))}
                          title="% del cut que recibe (el resto se reparte entre los demás boosters)"
                          className="input w-full px-2 py-1 text-xs text-right"
                        />
                        <span className="text-xs text-ink-faint shrink-0">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <input
                value={boosterSearch}
                onChange={(e) => setBoosterSearch(e.target.value)}
                placeholder="Buscar integrante..."
                className="input w-full px-3 py-2 text-sm mb-3"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addFreelance}
                  className="text-sm px-3 py-1.5 rounded-full border cursor-pointer transition-all flex items-center gap-1"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    borderColor: "var(--color-line)",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  <Plus className="w-3 h-3" />
                  Freelance
                </button>
                {restMembers.map((m) => (
                  <label
                    key={m.id}
                    className="text-sm px-3 py-1.5 rounded-full border cursor-pointer transition-all"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      borderColor: "var(--color-line)",
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={false}
                      onChange={() => toggleBooster(m.id)}
                    />
                    {m.discord_username}
                  </label>
                ))}
                {members.length === 0 && (
                  <p className="text-ink-faint text-xs">No hay integrantes registrados todavía.</p>
                )}
                {members.length > 0 && restMembers.length === 0 && boosterSearch.trim() && (
                  <p className="text-ink-faint text-xs">Ningún integrante coincide con la búsqueda.</p>
                )}
              </div>

              <datalist id="freelancer-names">
                {freelancers.map((f) => (
                  <option key={f.id} value={f.name} />
                ))}
              </datalist>
            </div>
          </div>

          {formError && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2.5 pt-4 border-t border-line">
            {editingId && (
              <button type="button" onClick={cancelEdit} className="btn btn-secondary">
                Cancelar
              </button>
            )}
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar run"}
            </button>
          </div>
          </form>
          )}
        </div>
      )}

      {services.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon={Swords}
            message="No hay runs registradas todavía"
            description={
              canManage
                ? "Agrega la primera desde el panel de arriba: importa las peleas desde Warcraft Logs o carga los boosters a mano."
                : "Cuando el líder registre una run en la que participaste, aparece acá con tu cut."
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([dateLabel, group]) => {
            const groupPot = group.reduce((sum, s) => sum + Number(s.total_price), 0);
            const groupMyCut = group.reduce((sum, s) => sum + (s.my_cut ?? 0), 0);
            return (
              <div key={dateLabel}>
                <div className="flex items-center gap-3 mb-2.5 px-1">
                  <h3 className="text-caption">{dateLabel}</h3>
                  <span className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
                  <span className="text-xs text-ink-faint whitespace-nowrap">
                    {group.length} run{group.length === 1 ? "" : "s"}
                  </span>
                  <span
                    className="font-data text-xs font-bold whitespace-nowrap"
                    style={{ color: "var(--color-primary)" }}
                  >
                    ${(canManage ? groupPot : groupMyCut).toFixed(2)}
                  </span>
                </div>

                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-ink-faint text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-3.5 font-semibold">Run</th>
                        <th className="text-left px-5 py-3.5 font-semibold">
                          {canManage ? "Reparto" : "Boosters"}
                        </th>
                        <th className="text-left px-5 py-3.5 font-semibold">ADV</th>
                        <th className="text-left px-5 py-3.5 font-semibold">
                          {canManage ? "Pot" : "Tu cut"}
                        </th>
                        <th className="text-left px-5 py-3.5 font-semibold">Estatus</th>
                        {canManage && <th className="px-5 py-3.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((s, index) => {
                        const shared = sharedCutAmount(s.boosters);
                        const payStatus = runPayStatus(s);
                        return (
                          <tr
                            key={s.id}
                            className="border-t border-line hover:bg-[color:var(--color-surface-2)] transition-colors cascade-item align-top"
                            style={{
                              borderLeft: `3px solid ${
                                payStatus === "paid"
                                  ? "var(--color-success)"
                                  : payStatus === "partial"
                                    ? "var(--color-warning)"
                                    : "var(--color-line)"
                              }`,
                              ...cascadeStyle(index),
                            }}
                          >
                            <td className="px-5 py-4 font-medium text-ink">{s.description}</td>
                            <td className="px-5 py-4">
                              <div className="max-w-[560px] flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                                  <Users className="w-3.5 h-3.5 shrink-0 text-ink-faint" />
                                  <span className="text-ink-muted">
                                    {s.boosters.length} booster{s.boosters.length === 1 ? "" : "s"}
                                  </span>
                                  {canManage && shared !== null && (
                                    <>
                                      <span className="text-ink-faint">·</span>
                                      <span className="font-data font-semibold text-ink">
                                        ${shared.toFixed(2)}
                                      </span>
                                      <span className="text-ink-faint">cada uno</span>
                                    </>
                                  )}
                                </div>
                                {s.boosters.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.boosters.map((b, bi) => (
                                      <BoosterChip
                                        key={b.user_id ?? `freelance-${bi}`}
                                        name={b.discord_username}
                                        freelance={b.is_freelance}
                                        paid={!b.is_freelance && b.paid}
                                        percent={canManage && b.cut_percent !== 100 ? b.cut_percent : undefined}
                                        amount={canManage && shared === null ? b.cut_amount : undefined}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {s.adv_username ? (
                                <span className="pill pill-info">
                                  {s.adv_username} · {s.adv_cut_percent}%
                                </span>
                              ) : (
                                <span className="text-ink-faint text-xs">Sin ADV</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className="font-data font-bold whitespace-nowrap"
                                style={{ color: "var(--color-primary)" }}
                              >
                                ${(canManage ? Number(s.total_price) : s.my_cut ?? 0).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <PaidBadge status={payStatus} />
                            </td>
                            {canManage && (
                              <td className="px-5 py-4">
                                <div className="flex items-center justify-end gap-1">
                                  <IconAction
                                    icon={Pencil}
                                    label={
                                      payStatus === "pending"
                                        ? "Editar run"
                                        : "No se puede editar: esta run ya tiene pagos confirmados -- deshaz el pago desde Pagos primero"
                                    }
                                    onClick={() => startEdit(s)}
                                    disabled={payStatus !== "pending"}
                                    className="hover:text-[color:var(--color-secondary)]"
                                  />
                                  <IconAction
                                    icon={Trash2}
                                    label={
                                      payStatus === "pending"
                                        ? "Eliminar run"
                                        : "No se puede eliminar: esta run ya tiene pagos confirmados -- deshaz el pago desde Pagos primero"
                                    }
                                    onClick={() => handleDelete(s.id, s.description)}
                                    disabled={payStatus !== "pending"}
                                    className="hover:text-[color:var(--color-danger)]"
                                  />
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  color,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <IconBadge icon={icon} color={color} />
      <div className="min-w-0">
        <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold truncate">{label}</p>
        <p className="font-data text-2xl font-bold text-ink">{value}</p>
        {hint && <p className="text-ink-faint text-xs truncate">{hint}</p>}
      </div>
    </div>
  );
}

function BoosterChip({
  name,
  amount,
  percent,
  freelance,
  paid,
}: {
  name: string;
  amount?: number;
  percent?: number;
  freelance?: boolean;
  paid?: boolean;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap"
      style={{
        backgroundColor: paid ? "color-mix(in srgb, var(--color-success) 14%, var(--color-surface-2))" : "var(--color-surface-2)",
        border: `1px solid ${paid ? "color-mix(in srgb, var(--color-success) 45%, transparent)" : "var(--color-line)"}`,
      }}
    >
      <span className={paid ? "text-ink" : "text-ink-muted"}>{name}</span>
      {paid && <Check className="w-3 h-3 shrink-0" style={{ color: "var(--color-success)" }} />}
      {freelance && <span className="pill pill-info text-micro px-1.5 py-0">Freelance</span>}
      {percent !== undefined && <span className="text-ink-faint">({percent}%)</span>}
      {amount !== undefined && (
        <span className="font-data font-semibold text-ink">${amount.toFixed(2)}</span>
      )}
    </span>
  );
}

function PaidBadge({ status }: { status: "paid" | "partial" | "pending" }) {
  const config = {
    paid: { className: "pill-success", icon: Check, label: "Pagado" },
    partial: { className: "pill-warning", icon: Minus, label: "Parcialmente Pago" },
    pending: { className: "pill-common", icon: Clock, label: "No pago" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`pill ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
