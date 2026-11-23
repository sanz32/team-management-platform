"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gavel,
  ImageOff,
  MessageSquareWarning,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import SectionToggle from "@/app/components/SectionToggle";
import SegmentedToggle from "@/app/components/SegmentedToggle";
import { useToast } from "@/app/components/ToastProvider";
import PointsEvidenceInput from "@/app/components/PointsEvidenceInput";
import PointStamp, { formatDiscount, POINT_COLOR, pointsLabel } from "@/app/components/PointStamp";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { cascadeStyle } from "@/lib/cascade";
import { readJson } from "@/lib/read-json";
import { formatFightDateTime } from "@/lib/format";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import PageHeader from "@/app/components/PageHeader";
import {
  Avatar,
  formatWeekLabel,
  shiftWeek,
  wclFightUrl,
  type Member,
  type ResolvedWcl,
} from "./shared";
import AddPointForm from "./AddPointForm";

interface PointRow {
  id: string;
  userId: string;
  points: number;
  percent: number;
  scope: "week" | "run";
  reason: string | null;
  wclReportCode: string | null;
  wclFightId: number | null;
  wclBossName: string | null;
  wclKill: boolean | null;
  wclStartTime: string | null;
  hasEvidence: boolean;
  evidenceUrl: string | null;
  weekStart: string;
  createdAt: string;
  reverted: boolean;
  revertedAt: string | null;
  appealStatus: "pending" | "approved" | "denied" | null;
}

interface PendingAppeal {
  id: string;
  reason: string;
  createdAt: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  point: PointRow;
}

interface PointsTotals {
  totalPoints: number;
  totalPercentValue: number;
}

interface ScopedTotals {
  week: PointsTotals;
  run: PointsTotals;
}

interface WeekGroup {
  weekStart: string;
  total: PointsTotals;
  scoped: ScopedTotals;
  rows: PointRow[];
}


function EvidenceThumb({ row, onOpen }: { row: PointRow; onOpen: (url: string) => void }) {
  if (row.evidenceUrl) {
    return (
      <button
        type="button"
        onClick={() => onOpen(row.evidenceUrl!)}
        title="Ampliar la captura"
        className="shrink-0 rounded-md overflow-hidden transition-transform hover:scale-105"
        style={{ border: "1px solid var(--color-line)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.evidenceUrl} alt="Captura" className="w-12 h-12 object-cover block" />
      </button>
    );
  }
  if (row.hasEvidence) {
    return (
      <span
        className="shrink-0 w-12 h-12 rounded-md flex flex-col items-center justify-center gap-0.5 text-ink-faint"
        style={{ border: "1px dashed var(--color-line-strong)" }}
        title="La captura se conserva 10 semanas y esta ya venció"
      >
        <ImageOff className="w-3.5 h-3.5" />
        <span className="text-micro uppercase tracking-wide">Vencida</span>
      </span>
    );
  }
  return null;
}

interface EffectiveDiscount {
  weekPercentValue: number;
  runPercentValue: number;
}

const REVERTED_RECORD: React.CSSProperties = { filter: "grayscale(0.85)", opacity: 0.55 };

function pointTitle(row: PointRow): string {
  return (
    row.reason ||
    (row.scope === "run" && row.wclBossName ? `Run contra ${row.wclBossName}` : "Sin motivo anotado")
  );
}

function PointCard({
  row,
  onOpenEvidence,
  index,
  appealable = false,
  onAppealed,
  hideReason = false,
  editable = false,
  onEdited,
}: {
  row: PointRow;
  onOpenEvidence: (url: string) => void;
  index: number;
  appealable?: boolean;
  onAppealed?: () => void;
  hideReason?: boolean;
  editable?: boolean;
  onEdited?: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const title = pointTitle(row);
  const isFullReport = !row.wclBossName && !!row.wclReportCode;

  const metaTextSize = hideReason ? "text-sm" : "text-xs";
  const pillClass = hideReason ? "!text-xs !px-2.5 !py-1" : "!text-micro !px-2 !py-0.5";

  if (editing) {
    return (
      <div className="card cascade-item p-4" style={cascadeStyle(index)}>
        <EditPointForm
          row={row}
          onOpenEvidence={onOpenEvidence}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onEdited?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="card cascade-item p-4" style={cascadeStyle(index)}>
      <div
        className={`flex ${hideReason ? "items-center" : "items-start"} gap-3`}
        style={row.reverted ? REVERTED_RECORD : undefined}
      >
        <PointStamp points={row.points} size={hideReason ? "md" : "sm"} />

      <div className="min-w-0 flex-1">
        {!hideReason && <p className="text-sm text-ink font-medium break-words">{title}</p>}
        <div
          className={`flex flex-wrap items-center ${hideReason ? "gap-x-2.5 gap-y-1.5" : "gap-x-2 gap-y-1"} ${hideReason ? "" : "mt-1.5"}`}
        >
          <span
            className={`${metaTextSize} font-semibold tabular-nums cursor-default`}
            style={{ color: POINT_COLOR }}
            title={`${row.points} ${pointsLabel(row.points)} al ${row.percent}%`}
          >
            {formatDiscount(row.points * row.percent)}
          </span>
          {row.wclBossName ? (
            <>
              <span className={`text-ink-faint ${metaTextSize}`}>·</span>
              <span className={`pill pill-common ${pillClass}`}>{row.wclBossName}</span>
              {row.wclKill !== null && (
                <span className={`pill ${pillClass} ${row.wclKill ? "pill-success" : "pill-common"}`}>
                  {row.wclKill ? "Kill" : "Wipe"}
                </span>
              )}
            </>
          ) : (
            isFullReport && (
              <>
                <span className={`text-ink-faint ${metaTextSize}`}>·</span>
                <span className={`pill pill-common ${pillClass}`}>Reporte completo</span>
              </>
            )
          )}
          {row.wclStartTime && (
            <span className={`text-ink-faint ${metaTextSize} font-data`}>
              {formatFightDateTime(new Date(row.wclStartTime).getTime())}
            </span>
          )}
          {row.wclReportCode && (
            <a
              href={wclFightUrl(row.wclReportCode, row.wclFightId)}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 ${metaTextSize} font-medium text-ink-faint hover:text-[color:var(--color-primary)] transition-colors`}
            >
              <ExternalLink className="w-3 h-3" />
              Log
            </a>
          )}
        </div>
      </div>

        <EvidenceThumb row={row} onOpen={onOpenEvidence} />
      </div>

      <PointCardFooter
        row={row}
        appealable={appealable}
        formOpen={formOpen}
        onOpenForm={() => setFormOpen(true)}
        onCloseForm={() => setFormOpen(false)}
        onAppealed={() => {
          setFormOpen(false);
          onAppealed?.();
        }}
        editable={editable}
        onEdit={() => setEditing(true)}
      />
    </div>
  );
}

function PointCardFooter({
  row,
  appealable,
  formOpen,
  onOpenForm,
  onCloseForm,
  onAppealed,
  editable = false,
  onEdit,
}: {
  row: PointRow;
  appealable: boolean;
  formOpen: boolean;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onAppealed: () => void;
  editable?: boolean;
  onEdit?: () => void;
}) {
  const canAppeal = appealable && !row.reverted && row.appealStatus !== "pending";
  const canEdit = editable && !row.reverted && row.appealStatus !== "pending";
  const showFooter = row.reverted || row.appealStatus === "pending" || canAppeal || canEdit;
  if (!showFooter) return null;

  return (
    <div className="mt-3 pt-3 border-t border-line">
      {row.reverted ? (
        <span className="pill pill-common !text-micro !px-2 !py-0.5">Revertido por apelación</span>
      ) : row.appealStatus === "pending" ? (
        <span className="pill pill-info !text-micro !px-2 !py-0.5">Apelación en revisión</span>
      ) : formOpen ? (
        <AppealForm row={row} onCancel={onCloseForm} onSent={onAppealed} />
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          {canAppeal && (
            <button type="button" onClick={onOpenForm} className="btn btn-secondary !text-xs !py-1 !px-3">
              Apelar
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="btn btn-secondary !text-xs !py-1 !px-3 inline-flex items-center gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
          )}
          {row.appealStatus === "denied" && (
            <span className="text-xs text-ink-faint">Tu apelación anterior fue rechazada.</span>
          )}
        </div>
      )}
    </div>
  );
}

function AppealForm({
  row,
  onCancel,
  onSent,
}: {
  row: PointRow;
  onCancel: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/points/${row.id}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo enviar la apelación.");
        return;
      }
      toast.success("Apelación enviada", "Un RL la va a revisar.");
      onSent();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-caption !text-ink-faint" htmlFor={`apelacion-${row.id}`}>
        ¿Por qué apelas este punto?
      </label>
      <textarea
        id={`apelacion-${row.id}`}
        className="input min-h-[72px] !text-xs"
        placeholder="Explica qué pasó, en una o dos líneas."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      {error && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!reason.trim() || sending}
          className="btn btn-primary !text-xs !py-1 !px-3"
        >
          {sending ? "Enviando..." : "Enviar apelación"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          className="btn btn-ghost !text-xs !py-1 !px-3"
        >
          Cancelar
        </button>
      </div>
      <p className="text-xs text-ink-faint">
        Un RL la revisa y se te avisa cuando haya respuesta.
      </p>
    </div>
  );
}

function EditPointForm({
  row,
  onOpenEvidence,
  onCancel,
  onSaved,
}: {
  row: PointRow;
  onOpenEvidence: (url: string) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [scope, setScope] = useState<"week" | "run">(row.scope);
  const [points, setPoints] = useState(String(row.points));
  const [percent, setPercent] = useState(String(row.percent));
  const [reason, setReason] = useState(row.reason ?? "");
  const [wclUrl, setWclUrl] = useState(row.wclReportCode ? wclFightUrl(row.wclReportCode, row.wclFightId) : "");
  const [linkTouched, setLinkTouched] = useState(false);
  const [fight, setFight] = useState<ResolvedWcl | null>(null);
  const [resolving, setResolving] = useState(false);
  const [evidence, setEvidence] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = scope === "week" || wclUrl.trim().length > 0;

  async function resolveFight() {
    setResolving(true);
    setError("");
    try {
      const res = await fetch("/api/points/resolve-wcl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: wclUrl }),
      });
      const data = await readJson<{ resolved?: ResolvedWcl; error?: string }>(res);
      if (!res.ok || !data?.resolved) {
        setFight(null);
        setError(data?.error ?? "No se pudo leer ese link.");
        return;
      }
      setFight(data.resolved);
    } finally {
      setResolving(false);
    }
  }

  async function submit() {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("scope", scope);
      form.set("points", points);
      form.set("percent", percent);
      form.set("reason", reason);
      if (wclUrl.trim()) form.set("wclUrl", wclUrl);
      if (evidence) form.set("evidence", evidence, "evidencia.jpg");

      const res = await fetch(`/api/points/${row.id}`, { method: "PATCH", body: form });
      const data = await readJson<{ error?: string; evidenceWarning?: string | null }>(res);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar el punto.");
        return;
      }
      toast.success("Punto actualizado");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const pointsCount = Number(points) || 0;
  const percentValue = Number(percent) || 0;
  const discountPreview = pointsCount * percentValue;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption !text-ink-faint">Editando el punto</p>

      <div className="flex gap-2" role="group" aria-label="Tipo de punto">
        {(["week", "run"] as const).map((value) => {
          const active = scope === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              aria-pressed={active}
              className={`btn !py-1 !px-3 text-xs ${active ? "btn-primary" : "btn-secondary"}`}
            >
              {value === "week" ? "Semana" : "Run específica"}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-label font-medium text-ink-faint mb-1" htmlFor={`editar-puntos-${row.id}`}>
            Puntos
          </label>
          <input
            id={`editar-puntos-${row.id}`}
            className="input w-full !text-xs"
            type="number"
            min={1}
            step={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="block text-label font-medium text-ink-faint mb-1" htmlFor={`editar-percent-${row.id}`}>
            % por punto
          </label>
          <input
            id={`editar-percent-${row.id}`}
            className="input w-full !text-xs"
            type="number"
            min={0.01}
            step={0.5}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </div>
      </div>

      <p className="text-label text-ink-faint">
        {formatDiscount(discountPreview)} · {pointsCount} {pointsLabel(pointsCount)} × {percentValue}%
      </p>

      <div>
        <label className="block text-label font-medium text-ink-faint mb-1" htmlFor={`editar-wcl-${row.id}`}>
          Link del pull o de la run completa {scope === "week" && "(opcional)"}
        </label>
        <div className="flex gap-2">
          <input
            id={`editar-wcl-${row.id}`}
            className="input flex-1 min-w-0 !text-xs"
            placeholder="https://www.warcraftlogs.com/reports/...#fight=12"
            value={wclUrl}
            onChange={(e) => {
              setWclUrl(e.target.value);
              setLinkTouched(true);
              setFight(null);
            }}
          />
          <button
            type="button"
            onClick={resolveFight}
            disabled={!wclUrl.trim() || resolving}
            className="btn btn-secondary !text-xs !py-1 !px-3 shrink-0"
          >
            {resolving ? "Cargando..." : "Cargar"}
          </button>
        </div>
        {fight ? (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {fight.kind === "fight" ? (
              <>
                <span className="pill pill-common !text-micro !px-2 !py-0.5">{fight.bossName}</span>
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
          </div>
        ) : (
          !linkTouched &&
          row.wclReportCode && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="pill pill-common !text-micro !px-2 !py-0.5">
                {row.wclBossName ?? "Reporte completo"}
              </span>
              <span className="text-label text-ink-faint">(link actual, sin tocar)</span>
            </div>
          )
        )}
      </div>

      <div>
        <label className="block text-label font-medium text-ink-faint mb-1" htmlFor={`editar-motivo-${row.id}`}>
          Motivo
        </label>
        <textarea
          id={`editar-motivo-${row.id}`}
          className="input w-full !text-xs min-h-[60px] resize-none"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div>
        <p className="text-label font-medium text-ink-faint mb-1">Captura</p>
        {row.hasEvidence && !evidence && (
          <div className="flex items-center gap-2 mb-2">
            <EvidenceThumb row={row} onOpen={onOpenEvidence} />
            <span className="text-label text-ink-faint">Subir una nueva la reemplaza.</span>
          </div>
        )}
        <PointsEvidenceInput onChange={setEvidence} disabled={saving} />
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={!canSave || saving}
          className="btn btn-primary !text-xs !py-1 !px-3"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn btn-ghost !text-xs !py-1 !px-3">
          Cancelar
        </button>
      </div>
    </div>
  );
}

const SCOPE_STAT_VALUE_SIZE: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};
const SCOPE_STAT_LABEL_SIZE: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "text-micro",
  sm: "text-micro",
  md: "text-xs",
  lg: "text-xs",
};

function ScopeStat({
  label,
  totals,
  size,
}: {
  label: string;
  totals: PointsTotals;
  size: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <div className={`flex items-center ${size === "xs" ? "gap-2" : "gap-2.5"}`}>
      <PointStamp points={totals.totalPoints} size={size} />
      <div className="min-w-0">
        <p
          className={`font-heading font-bold tabular-nums leading-tight ${SCOPE_STAT_VALUE_SIZE[size]}`}
          style={{ color: POINT_COLOR }}
        >
          {formatDiscount(totals.totalPercentValue)}
        </p>
        <p className={`${SCOPE_STAT_LABEL_SIZE[size]} text-ink-muted leading-tight whitespace-nowrap`}>
          {label}
        </p>
      </div>
    </div>
  );
}

function WeekSummary({
  scoped,
  size = "md",
}: {
  scoped: ScopedTotals;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <div className={`flex flex-wrap items-center ${size === "xs" || size === "sm" ? "gap-3" : "gap-5"}`}>
      {scoped.week.totalPoints > 0 && (
        <ScopeStat
          label={`${scoped.week.totalPoints} ${pointsLabel(scoped.week.totalPoints)} de semana`}
          totals={scoped.week}
          size={size}
        />
      )}
      {scoped.run.totalPoints > 0 && (
        <ScopeStat
          label={`${scoped.run.totalPoints} ${pointsLabel(scoped.run.totalPoints)} en runs`}
          totals={scoped.run}
          size={size}
        />
      )}
    </div>
  );
}

function runGroupKey(row: PointRow): string {
  return `${row.wclReportCode ?? "sin-reporte"}-${row.wclFightId ?? "sin-pull"}`;
}

function localPercentValue(rows: PointRow[]): number {
  const raw = rows.reduce((sum, r) => (r.reverted ? sum : sum + r.points * r.percent), 0);
  return Math.round(raw * 100) / 100;
}

interface RunGroup {
  key: string;
  bossName: string | null;
  rows: PointRow[];
  percentValue: number;
}

function groupRunRows(rows: PointRow[]): RunGroup[] {
  const map = new Map<string, RunGroup>();
  for (const row of rows) {
    const key = runGroupKey(row);
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(key, { key, bossName: row.wclBossName, rows: [row], percentValue: 0 });
    }
  }
  for (const group of map.values()) {
    group.percentValue = localPercentValue(group.rows);
  }
  return Array.from(map.values());
}

const GRID_COLS =
  "grid-cols-1 @min-[830px]:grid-cols-2 @min-[1250px]:grid-cols-3 @min-[1670px]:grid-cols-4";

const GROUP_SPAN = [
  "",
  "",
  "@min-[830px]:col-span-2",
  "@min-[830px]:col-span-2 @min-[1250px]:col-span-3",
  "@min-[830px]:col-span-2 @min-[1250px]:col-span-3 @min-[1670px]:col-span-4",
];

const GROUP_COLS = [
  "",
  "grid-cols-1",
  "grid-cols-1 @min-[830px]:grid-cols-2",
  "grid-cols-1 @min-[830px]:grid-cols-2 @min-[1250px]:grid-cols-3",
  "grid-cols-1 @min-[830px]:grid-cols-2 @min-[1250px]:grid-cols-3 @min-[1670px]:grid-cols-4",
];

function GroupHeader({
  label,
  boss,
  percentValue,
  effective,
  note,
}: {
  label: string;
  boss?: string | null;
  percentValue: number;
  effective?: EffectiveDiscount | null;
  note?: string;
}) {
  const headline = effective
    ? effective.weekPercentValue + effective.runPercentValue
    : percentValue;

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <span className="text-micro uppercase tracking-[0.14em] text-ink-faint shrink-0">
          {label}
        </span>
        {boss && (
          <span className="text-xs font-medium text-ink-muted truncate min-w-0">{boss}</span>
        )}
        <span className="h-px flex-1 min-w-2" style={{ backgroundColor: "var(--color-line)" }} />
        {headline > 0 && (
          <span
            className="text-xs font-semibold tabular-nums shrink-0"
            style={{ color: POINT_COLOR }}
          >
            {formatDiscount(headline)}
            {effective && <span className="text-ink-faint font-normal"> efectivo</span>}
          </span>
        )}
      </div>
      {effective ? (
        <p className="text-label text-ink-faint mt-1">
          {formatDiscount(effective.weekPercentValue)} de la semana y{" "}
          {formatDiscount(effective.runPercentValue)} de este pull
        </p>
      ) : (
        note && <p className="text-label text-ink-faint mt-1">{note}</p>
      )}
    </div>
  );
}

function WeekPointsList({
  rows,
  onOpenEvidence,
  appealable = false,
  onAppealed,
  hideReason = false,
  editable = false,
  onEdited,
}: {
  rows: PointRow[];
  onOpenEvidence: (url: string) => void;
  appealable?: boolean;
  onAppealed?: () => void;
  hideReason?: boolean;
  editable?: boolean;
  onEdited?: () => void;
}) {
  const weekRows = rows.filter((r) => r.scope === "week");
  const runGroups = groupRunRows(rows.filter((r) => r.scope === "run"));
  const weekPercentValue = localPercentValue(weekRows);

  let cascadeIndex = 0;

  return (
    <div className="@container">
      <div className={`grid ${GRID_COLS} gap-x-4 gap-y-5 items-start [grid-auto-flow:dense]`}>
        {weekRows.length > 0 && (
          <section className={GROUP_SPAN[Math.min(weekRows.length, 4)]}>
            <GroupHeader
              label="General de la semana"
              percentValue={weekPercentValue}
              note="Se aplica a cualquier run de esta semana."
            />
            <div className={`grid ${GROUP_COLS[Math.min(weekRows.length, 4)]} gap-3 items-start`}>
              {weekRows.map((row) => (
                <PointCard
                  key={row.id}
                  row={row}
                  index={cascadeIndex++}
                  onOpenEvidence={onOpenEvidence}
                  appealable={appealable}
                  onAppealed={onAppealed}
                  hideReason={hideReason}
                  editable={editable}
                  onEdited={onEdited}
                />
              ))}
            </div>
          </section>
        )}
        {runGroups.map((group) => {
          const effective: EffectiveDiscount | null =
            weekRows.length > 0
              ? { weekPercentValue, runPercentValue: group.percentValue }
              : null;
          const size = Math.min(group.rows.length, 4);
          return (
            <section key={group.key} className={GROUP_SPAN[size]}>
              <GroupHeader
                label="Run"
                boss={group.bossName ?? "Reporte completo"}
                percentValue={group.percentValue}
                effective={effective}
              />
              <div className={`grid ${GROUP_COLS[size]} gap-3 items-start`}>
                {group.rows.map((row) => (
                  <PointCard
                    key={row.id}
                    row={row}
                    index={cascadeIndex++}
                    onOpenEvidence={onOpenEvidence}
                    appealable={appealable}
                    onAppealed={onAppealed}
                    hideReason={hideReason}
                    editable={editable}
                    onEdited={onEdited}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type PuntosViewMode = "personal" | "guild" | "admin";

export default function PuntosClient({ canManage }: { canManage: boolean }) {
  const [viewMode, setViewMode] = useState<PuntosViewMode>("personal");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
  const loadAppealsCount = useCallback(async () => {
    if (!canManage) return;
    const res = await fetch("/api/points/appeals");
    const data = await readJson<{ appeals: PendingAppeal[] }>(res);
    setPendingAppealsCount(data?.appeals.length ?? 0);
  }, [canManage]);
  useRefetchOnReturn(loadAppealsCount);

  const segments: { value: PuntosViewMode; label: string; badge?: number }[] = [
    { value: "personal", label: "Mis puntos" },
    { value: "guild", label: "Guild" },
  ];
  if (canManage) segments.push({ value: "admin", label: "Administrar", badge: pendingAppealsCount });

  return (
    <main className="portal-container py-10">
      <PageHeader
        eyebrow="Disciplina"
        icon={Gavel}
        title="Puntos"
        description="El registro de los descuentos aplicados: cuántos puntos y por qué."
        accent={POINT_COLOR}
        actions={
          <SegmentedToggle options={segments} value={viewMode} onChange={setViewMode} ariaLabel="Vista de Puntos" />
        }
      />

      {viewMode === "admin" ? (
        <AdminView onOpenEvidence={setLightbox} onAppealsCountChange={setPendingAppealsCount} />
      ) : viewMode === "guild" ? (
        <GuildView onOpenEvidence={setLightbox} />
      ) : (
        <PersonalView onOpenEvidence={setLightbox} />
      )}

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </main>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(6, 8, 14, 0.85)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Captura"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-5 right-5 p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-[color:var(--color-surface-2)] transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Captura"
        className="max-w-full max-h-full rounded-xl"
        style={{ border: "1px solid var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function PersonalView({ onOpenEvidence }: { onOpenEvidence: (url: string) => void }) {
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [currentWeek, setCurrentWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/points");
    const data = await readJson<{ weeks: WeekGroup[]; currentWeek: string }>(res);
    setWeeks(data?.weeks ?? []);
    setCurrentWeek(data?.currentWeek ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await load();
    }
    initialLoad();
  }, [load]);

  if (loading) {
    return <p className="text-ink-muted text-sm">Cargando tus puntos...</p>;
  }

  const thisWeek = weeks.find((w) => w.weekStart === currentWeek) ?? null;
  const previous = weeks.filter((w) => w.weekStart !== currentWeek);

  return (
    <div className="flex flex-col gap-5">
      <section className="card p-6">
        <p className="text-caption !text-ink-faint mb-3">Esta semana</p>
        {thisWeek ? (
          <>
            <WeekSummary scoped={thisWeek.scoped} size="lg" />
            <p className="text-xs text-ink-faint mt-4">
              Cada punto representa un descuento que se aplicará en una run o en toda la semana.
            </p>
            <div className="mt-5">
              <WeekPointsList
                rows={thisWeek.rows}
                onOpenEvidence={onOpenEvidence}
                appealable
                onAppealed={load}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4">
            <PointStamp points={0} size="lg" />
            <div>
              <p className="text-ink font-medium">Sin puntos esta semana</p>
              <p className="text-xs text-ink-muted mt-1">
                Aquí aparece el motivo de cualquier descuento que se te aplique.
              </p>
            </div>
          </div>
        )}
      </section>

      {previous.length > 0 && (
        <section className="card p-6">
          <SectionToggle
            icon={Gavel}
            color={POINT_COLOR}
            title="Semanas anteriores"
            hint={`${previous.length} ${previous.length === 1 ? "semana" : "semanas"} con puntos`}
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
          />
          {historyOpen && (
            <div className="flex flex-col gap-6 mt-6">
              {previous.map((group) => (
                <div key={group.weekStart}>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-line">
                    <p className="font-heading font-semibold text-ink text-sm">
                      {formatWeekLabel(group.weekStart)}
                    </p>
                    <WeekSummary scoped={group.scoped} />
                  </div>
                  <WeekPointsList
                    rows={group.rows}
                    onOpenEvidence={onOpenEvidence}
                    appealable
                    onAppealed={load}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface AdminData {
  weekStart: string;
  currentWeek: string;
  rows: PointRow[];
  totalsByUser: Record<string, ScopedTotals>;
  members: Member[];
}

function GuildView({ onOpenEvidence }: { onOpenEvidence: (url: string) => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/points?all=true");
      const parsed = await readJson<AdminData>(res);
      setData(parsed);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-heading text-lg font-semibold text-ink">
          {data ? formatWeekLabel(data.weekStart) : "Cargando..."}
        </span>
        <span className="pill pill-info !text-xs !px-3 !py-1.5">Semana en curso</span>
      </div>
      <GuildWeek data={data} loading={loading} onOpenEvidence={onOpenEvidence} hideReason />
    </div>
  );
}

function AdminView({
  onOpenEvidence,
  onAppealsCountChange,
}: {
  onOpenEvidence: (url: string) => void;
  onAppealsCountChange?: (count: number) => void;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async (week?: string) => {
    setLoading(true);
    try {
      const query = week ? `?all=true&weekStart=${week}` : "?all=true";
      const res = await fetch(`/api/points${query}`);
      const parsed = await readJson<AdminData>(res);
      if (parsed) {
        setData(parsed);
        setWeekStart(parsed.weekStart);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await load();
    }
    initialLoad();
  }, [load]);

  const isCurrentWeek = !!data && weekStart === data.currentWeek;
  const isPastWeek = !!data && !!weekStart && weekStart < data.currentWeek;
  const isFutureWeek = !!data && !!weekStart && weekStart > data.currentWeek;

  return (
    <div className="flex flex-col gap-5">
      <AppealsQueue
        onResolved={() => load(weekStart ?? undefined)}
        onOpenEvidence={onOpenEvidence}
        onCountChange={onAppealsCountChange}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => weekStart && load(shiftWeek(weekStart, -1))}
          disabled={!weekStart || loading}
          className="btn btn-ghost !px-3 !py-1.5"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-heading text-lg font-semibold text-ink min-w-[260px] text-center">
          {weekStart ? formatWeekLabel(weekStart) : "Cargando..."}
        </span>
        <button
          type="button"
          onClick={() => weekStart && load(shiftWeek(weekStart, 1))}
          disabled={!weekStart || loading}
          className="btn btn-ghost !px-3 !py-1.5"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {isCurrentWeek && <span className="pill pill-info !text-xs !px-3 !py-1.5">Semana en curso</span>}
      </div>

      <section className="card p-6">
        {!data ? (
          <p className="text-ink-muted text-sm">Cargando...</p>
        ) : isPastWeek ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Estás viendo una semana pasada. Los puntos no se pueden cargar retroactivamente.
            </p>
            <button
              type="button"
              onClick={() => load(data.currentWeek)}
              className="btn btn-secondary !text-xs !py-1.5 !px-3"
            >
              Ir a la semana en curso
            </button>
          </div>
        ) : (
          <>
            {isFutureWeek && (
              <p className="text-sm text-ink-muted mb-4">
                Estás viendo una semana que todavía no llegó. Un punto cargado acá queda programado -- recién
                se le va a reflejar a la persona cuando esa semana empiece.
              </p>
            )}
            <SectionToggle
              icon={Plus}
              color={POINT_COLOR}
              title="Agregar punto"
              hint={isFutureWeek ? "Se programa para la semana que estás viendo" : "Se carga en la semana en curso"}
              open={formOpen}
              onToggle={() => setFormOpen((v) => !v)}
            />
            {formOpen && weekStart && (
              <AddPointForm
                members={data.members}
                weekStart={weekStart}
                isFutureWeek={isFutureWeek}
                onSaved={() => {
                  setFormOpen(false);
                  load(weekStart);
                }}
              />
            )}
          </>
        )}
      </section>

      <GuildWeek
        data={data}
        loading={loading}
        onOpenEvidence={onOpenEvidence}
        editable
        onEdited={() => load(weekStart ?? undefined)}
      />
    </div>
  );
}

function AppealsQueue({
  onResolved,
  onOpenEvidence,
  onCountChange,
}: {
  onResolved: () => void;
  onOpenEvidence: (url: string) => void;
  onCountChange?: (count: number) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [appeals, setAppeals] = useState<PendingAppeal[]>([]);
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/points/appeals");
    const data = await readJson<{ appeals: PendingAppeal[] }>(res);
    const list = data?.appeals ?? [];
    setAppeals(list);
    onCountChange?.(list.length);
  }, [onCountChange]);

  useEffect(() => {
    async function initialLoad() {
      await load();
    }
    initialLoad();
  }, [load]);

  async function decide(appeal: PendingAppeal, approve: boolean) {
    const confirmed = await confirm(
      approve
        ? `¿Aprobar la apelación de ${appeal.requesterName}? El punto queda revertido, deja de contar en su descuento y se le avisa en Discord.`
        : `¿Rechazar la apelación de ${appeal.requesterName}? El punto se mantiene tal como está y se le avisa en Discord.`,
      {
        title: approve ? "Aprobar apelación" : "Rechazar apelación",
        confirmLabel: approve ? "Aprobar" : "Rechazar",
        danger: !approve,
      }
    );
    if (!confirmed) return;

    setBusyId(appeal.id);
    setError("");
    try {
      const res = await fetch(
        `/api/points/appeals/${appeal.id}/${approve ? "approve" : "deny"}`,
        { method: "PATCH" }
      );
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo resolver la apelación.");
        toast.error("No se pudo resolver la apelación", data?.error);
      } else {
        toast.success(approve ? "Apelación aprobada" : "Apelación rechazada");
      }
      await load();
      onResolved();
    } finally {
      setBusyId(null);
    }
  }

  if (appeals.length === 0) return null;

  return (
    <section className="card p-6">
      <SectionToggle
        icon={MessageSquareWarning}
        color={POINT_COLOR}
        title="Apelaciones pendientes"
        hint={`${appeals.length} ${appeals.length === 1 ? "apelación espera" : "apelaciones esperan"} tu decisión`}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />

      {open && (
        <>
          {error && (
            <p className="text-xs mt-4" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5 items-start">
            {appeals.map((appeal, index) => (
              <AppealCard
                key={appeal.id}
                appeal={appeal}
                index={index}
                busy={busyId === appeal.id}
                onDecide={decide}
                onOpenEvidence={onOpenEvidence}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AppealCard({
  appeal,
  index,
  busy,
  onDecide,
  onOpenEvidence,
}: {
  appeal: PendingAppeal;
  index: number;
  busy: boolean;
  onDecide: (appeal: PendingAppeal, approve: boolean) => void;
  onOpenEvidence: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const point = appeal.point;
  const pointTitle = point.reason || (point.wclBossName ? `Run contra ${point.wclBossName}` : "Sin motivo anotado");

  return (
    <div
      className="cascade-item rounded-xl overflow-hidden"
      style={{
        ...cascadeStyle(index),
        backgroundColor: "var(--color-surface-2)",
        border: "1px solid var(--color-line)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 p-4 text-left hover-surface transition-colors"
      >
        <Avatar name={appeal.requesterName} avatarUrl={appeal.requesterAvatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-ink text-sm truncate">{appeal.requesterName}</p>
          <p className="text-xs text-ink-faint truncate">{pointTitle}</p>
        </div>
        <span
          className="text-xs font-semibold tabular-nums shrink-0"
          style={{ color: POINT_COLOR }}
        >
          {formatDiscount(point.points * point.percent)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-ink-faint shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4">
          <PointCard row={point} index={0} onOpenEvidence={onOpenEvidence} />

          <div className="mt-3">
            <p className="text-caption !text-ink-faint mb-1.5">Su motivo</p>
            <p className="text-sm text-ink break-words whitespace-pre-wrap">{appeal.reason}</p>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => onDecide(appeal, true)}
              disabled={busy}
              className="btn btn-primary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Aprobar
            </button>
            <button
              type="button"
              onClick={() => onDecide(appeal, false)}
              disabled={busy}
              className="btn btn-danger !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Rechazar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberPointsGroup({
  member,
  rows,
  scoped,
  index,
  onOpenEvidence,
  hideReason = false,
  editable = false,
  onEdited,
}: {
  member: Member;
  rows: PointRow[];
  scoped: ScopedTotals;
  index: number;
  onOpenEvidence: (url: string) => void;
  hideReason?: boolean;
  editable?: boolean;
  onEdited?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="cascade-item rounded-xl overflow-hidden"
      style={{
        ...cascadeStyle(index),
        backgroundColor: "var(--color-surface-2)",
        border: "1px solid var(--color-line)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-left hover-surface transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={`w-3.5 h-3.5 text-ink-faint shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
          <Avatar name={member.name} avatarUrl={member.avatarUrl} size={22} />
          <span className="font-heading font-semibold text-ink text-sm truncate">{member.name}</span>
          <span className="text-xs text-ink-faint shrink-0">
            {rows.length} {rows.length === 1 ? "punto" : "puntos"}
          </span>
        </div>
        <WeekSummary scoped={scoped} size="xs" />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-line">
          <WeekPointsList
            rows={rows}
            onOpenEvidence={onOpenEvidence}
            hideReason={hideReason}
            editable={editable}
            onEdited={onEdited}
          />
        </div>
      )}
    </div>
  );
}

function GuildWeek({
  data,
  loading,
  onOpenEvidence,
  hideReason = false,
  editable = false,
  onEdited,
}: {
  data: AdminData | null;
  loading: boolean;
  onOpenEvidence: (url: string) => void;
  hideReason?: boolean;
  editable?: boolean;
  onEdited?: () => void;
}) {
  if (loading && !data) return <p className="text-ink-muted text-sm">Cargando la semana...</p>;
  if (!data) return null;

  const rowsByUser = new Map<string, PointRow[]>();
  for (const row of data.rows) {
    const list = rowsByUser.get(row.userId) ?? [];
    list.push(row);
    rowsByUser.set(row.userId, list);
  }

  const withPoints = data.members.filter((m) => rowsByUser.has(m.id));
  const without = data.members.filter((m) => !rowsByUser.has(m.id));

  return (
    <>
      <section className="card p-6">
        <p className="text-caption !text-ink-faint mb-4">Con puntos esta semana</p>
        {withPoints.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nadie tiene puntos en esta semana. Al cargar uno aparece aquí con su motivo y su
            captura.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {withPoints.map((member, index) => {
              const rows = rowsByUser.get(member.id) ?? [];
              const scoped = data.totalsByUser[member.id] ?? {
                week: { totalPoints: 0, totalPercentValue: 0 },
                run: { totalPoints: 0, totalPercentValue: 0 },
              };
              return (
                <MemberPointsGroup
                  key={member.id}
                  member={member}
                  rows={rows}
                  scoped={scoped}
                  index={index}
                  onOpenEvidence={onOpenEvidence}
                  hideReason={hideReason}
                  editable={editable}
                  onEdited={onEdited}
                />
              );
            })}
          </div>
        )}
      </section>

      {without.length > 0 && (
        <section className="card p-6">
          <p className="text-caption !text-ink-faint mb-3">
            Sin puntos esta semana ({without.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {without.map((member) => (
              <span
                key={member.id}
                className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1"
                style={{ backgroundColor: "var(--color-surface-2)" }}
              >
                <Avatar name={member.name} avatarUrl={member.avatarUrl} size={22} />
                <span className="text-xs text-ink-muted">{member.name}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
