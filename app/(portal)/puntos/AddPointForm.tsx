"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Search, X } from "lucide-react";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import PointsEvidenceInput from "@/app/components/PointsEvidenceInput";
import PointStamp, { formatDiscount, POINT_COLOR, pointsLabel } from "@/app/components/PointStamp";
import { formatFightDateTime } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import { Avatar, difficultyLabel, type Member, type ResolvedWcl } from "./shared";


const FORM_PANEL = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-line)",
} as const;

const INSET_FIELD = { backgroundColor: "var(--color-surface)" } as const;

function FormSection({
  title,
  hint,
  framed = true,
  grow = false,
  children,
}: {
  title: string;
  hint?: string;
  framed?: boolean;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={grow ? "flex flex-col flex-1 min-h-0" : undefined}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-caption">{title}</h3>
        {hint && <span className="text-label text-ink-faint">{hint}</span>}
      </div>
      {framed ? (
        <div
          className={`rounded-xl p-4 ${grow ? "flex-1 flex flex-col min-h-0" : ""}`}
          style={FORM_PANEL}
        >
          {children}
        </div>
      ) : grow ? (
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

export default function AddPointForm({
  members,
  weekStart,
  isFutureWeek,
  onSaved,
}: {
  members: Member[];
  weekStart: string;
  isFutureWeek: boolean;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [scope, setScope] = useState<"week" | "run">("week");
  const [points, setPoints] = useState("1");
  const [percent, setPercent] = useState("10");
  const [reason, setReason] = useState("");
  const [wclUrl, setWclUrl] = useState("");
  const [fight, setFight] = useState<ResolvedWcl | null>(null);
  const [resolving, setResolving] = useState(false);
  const [evidence, setEvidence] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "warning" } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selectedMembers = members.filter((m) => userIds.includes(m.id));
  const filtered = members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()));
  const canSave = userIds.length > 0 && (scope === "week" || !!fight) && !saving;

  function toggleMember(id: string) {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pickerOpen]);

  async function resolveFight() {
    setResolving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/points/resolve-wcl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: wclUrl }),
      });
      const data = await readJson<{ resolved?: ResolvedWcl; error?: string }>(res);
      if (!res.ok || !data?.resolved) {
        setFight(null);
        setMessage({ text: data?.error ?? "No se pudo leer ese link.", kind: "error" });
        return;
      }
      setFight(data.resolved);
    } finally {
      setResolving(false);
    }
  }

  async function submit() {
    if (userIds.length === 0) return;

    if (isFutureWeek) {
      const ok = await confirm(
        "Estás cargando un punto en una semana que todavía no llegó. Va a quedar programado y la persona recién lo va a ver cuando esa semana empiece.",
        { title: "Semana futura", confirmLabel: "Programar de todas formas" }
      );
      if (!ok) return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const form = new FormData();
      userIds.forEach((id) => form.append("userId", id));
      form.set("scope", scope);
      form.set("points", points);
      form.set("percent", percent);
      form.set("reason", reason);
      form.set("weekStart", weekStart);
      if (wclUrl.trim()) form.set("wclUrl", wclUrl);
      if (evidence) form.set("evidence", evidence, "evidencia.jpg");

      const res = await fetch("/api/points", { method: "POST", body: form });
      const data = await readJson<{ error?: string; evidenceWarning?: string | null }>(res);

      if (!res.ok) {
        setMessage({ text: data?.error ?? "No se pudo guardar el punto.", kind: "error" });
        return;
      }
      if (data?.evidenceWarning) {
        setMessage({ text: data.evidenceWarning, kind: "warning" });
      }
      toast.success(userIds.length === 1 ? "Punto registrado" : `${userIds.length} puntos registrados`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const pointsCount = Number(points) || 0;
  const percentValue = Number(percent) || 0;
  const discountPreview = pointsCount * percentValue;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="flex flex-col gap-5">
          <FormSection
            title="Miembros"
            hint={
              selectedMembers.length > 0
                ? `${selectedMembers.length} ${selectedMembers.length === 1 ? "elegido" : "elegidos"}`
                : undefined
            }
          >
            <div ref={pickerRef} className="relative">
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full"
                      style={{ ...INSET_FIELD, border: "1px solid var(--color-line)" }}
                    >
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} size={18} />
                      <span className="text-xs text-ink truncate max-w-[110px]">{m.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleMember(m.id)}
                        aria-label={`Quitar a ${m.name}`}
                        className="text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  className="input !pl-9 w-full"
                  style={INSET_FIELD}
                  aria-label="Buscar miembro"
                  placeholder="Buscar miembros"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                />
              </div>

              {pickerOpen && (
                <div
                  className="absolute left-0 right-0 mt-2 z-20 max-h-52 overflow-y-auto rounded-lg"
                  style={{ ...INSET_FIELD, border: "1px solid var(--color-line)" }}
                >
                  {filtered.length === 0 ? (
                    <p className="text-xs text-ink-faint px-3 py-3">No hay ningún miembro con ese nombre.</p>
                  ) : (
                    filtered.map((m) => {
                      const checked = userIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMember(m.id)}
                          aria-pressed={checked}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover-surface"
                        >
                          <Avatar name={m.name} avatarUrl={m.avatarUrl} size={24} />
                          <span className={`text-sm truncate flex-1 ${checked ? "text-ink font-medium" : "text-ink"}`}>
                            {m.name}
                          </span>
                          {checked && (
                            <Check className="w-4 h-4 shrink-0" style={{ color: "var(--color-primary)" }} />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selectedMembers.length > 1 && (
              <p className="text-label text-ink-faint mt-2">
                Se crea un punto individual para cada uno de los {selectedMembers.length} miembros.
              </p>
            )}
          </FormSection>

          <FormSection title="Tipo y monto">
            <p className="text-label font-medium text-ink-faint mb-1.5">Tipo</p>
            <div className="flex gap-2" role="group" aria-label="Tipo de punto">
              {(["week", "run"] as const).map((value) => {
                const active = scope === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value)}
                    aria-pressed={active}
                    className={`btn !py-1.5 !px-4 text-xs ${active ? "btn-primary" : "btn-secondary"}`}
                  >
                    {value === "week" ? "Semana" : "Run específica"}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-4">
              <div className="flex-1">
                <label className="block text-label font-medium text-ink-faint mb-1.5" htmlFor="puntos-cantidad">
                  Puntos
                </label>
                <input
                  id="puntos-cantidad"
                  className="input w-full"
                  style={INSET_FIELD}
                  type="number"
                  min={1}
                  step={1}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="block text-label font-medium text-ink-faint mb-1.5" htmlFor="puntos-percent">
                  % por punto
                </label>
                <input
                  id="puntos-percent"
                  className="input w-full"
                  style={INSET_FIELD}
                  type="number"
                  min={0.01}
                  step={0.5}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </div>
            </div>

            <div
              className="flex items-center gap-3 mt-4 pt-4"
              style={{ borderTop: "1px solid var(--color-line)" }}
            >
              <PointStamp points={pointsCount} size="sm" />
              <div className="min-w-0">
                <p
                  className="font-heading font-bold tabular-nums text-2xl leading-none"
                  style={{ color: POINT_COLOR }}
                >
                  {formatDiscount(discountPreview)}
                </p>
                <p className="text-label text-ink-faint mt-1.5">
                  {pointsCount} {pointsLabel(pointsCount)} × {percentValue}% ·{" "}
                  {scope === "week" ? "aplica a toda la semana" : "aplica solo a esta run"}
                </p>
              </div>
            </div>
          </FormSection>
        </div>

        <div className="flex flex-col gap-5 min-h-0">
          <FormSection
            title="Contexto de Warcraft Logs"
            hint={scope === "week" ? "Opcional" : "Necesario para guardar"}
          >
            <label className="block text-label font-medium text-ink-faint mb-1.5" htmlFor="puntos-wcl">
              Link del pull o de la run completa
            </label>
            <div className="flex gap-2">
              <input
                id="puntos-wcl"
                className="input flex-1 min-w-0"
                style={INSET_FIELD}
                placeholder="https://www.warcraftlogs.com/reports/...#fight=12"
                value={wclUrl}
                onChange={(e) => {
                  setWclUrl(e.target.value);
                  setFight(null);
                }}
              />
              <button
                type="button"
                onClick={resolveFight}
                disabled={!wclUrl.trim() || resolving}
                className="btn btn-secondary shrink-0"
              >
                {resolving ? "Cargando..." : "Cargar"}
              </button>
            </div>
            {fight ? (
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {fight.kind === "fight" ? (
                  <>
                    <span className="pill pill-common !text-micro !px-2 !py-0.5">{fight.bossName}</span>
                    <span className="pill pill-common !text-micro !px-2 !py-0.5">
                      {difficultyLabel(fight.difficulty)}
                    </span>
                    {fight.kill !== null && (
                      <span
                        className={`pill !text-micro !px-2 !py-0.5 ${fight.kill ? "pill-success" : "pill-common"}`}
                      >
                        {fight.kill ? "Kill" : "Wipe"}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="pill pill-common !text-micro !px-2 !py-0.5">
                    {fight.bossCount} {fight.bossCount === 1 ? "jefe" : "jefes"}
                  </span>
                )}
                {fight.startTime !== null && (
                  <span className="text-xs text-ink-faint font-data">{formatFightDateTime(fight.startTime)}</span>
                )}
              </div>
            ) : (
              scope === "run" && (
                <p className="text-xs text-ink-faint mt-2.5">
                  Carga el link del pull o del reporte completo antes de guardar.
                </p>
              )
            )}
          </FormSection>

          <FormSection title="Motivo" grow>
            <textarea
              id="puntos-motivo"
              className="input w-full flex-1 min-h-[80px] resize-none"
              style={INSET_FIELD}
              aria-label="Motivo"
              placeholder="Motivo por el que se aplicará este punto"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormSection>
        </div>

        <FormSection title="Captura" hint="Opcional" framed={false} grow>
          <PointsEvidenceInput onChange={setEvidence} disabled={saving} />
        </FormSection>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-line">
        {message && (
          <p
            className="text-xs mr-auto"
            style={{ color: message.kind === "error" ? "var(--color-danger)" : "var(--color-warning)" }}
          >
            {message.text}
          </p>
        )}
        <button type="button" onClick={submit} disabled={!canSave} className="btn btn-primary">
          {saving
            ? "Guardando..."
            : selectedMembers.length > 1
              ? `Guardar ${selectedMembers.length} puntos`
              : "Guardar punto"}
        </button>
      </div>
    </div>
  );
}
