"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Gauge, History, Pencil, Target, Trash2, Users, X } from "lucide-react";
import { capitalize } from "@/lib/format";
import { readJsonBody } from "@/lib/read-json";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { GUILD_TIMEZONE } from "@/lib/guild-day";
import { shiftDateKey, zonedDateKey } from "@/lib/timezone";
import {
  countCharactersForGoal,
  computeAverageIlvl,
  goalDeadlineOffsetFromZoned,
  goalDeadlineZonedParts,
  ilvlGoalUsesMains,
  ilvlGoalTopN,
  GOAL_TYPE_LABELS,
  MAX_DEADLINE_DAY_INDEX,
  MINUTES_PER_WEEK,
  type GoalTarget,
  currentValueForRules,
  describeGoalRules,
  type GoalCloseSummary,
  type MemberGoalDebt,
} from "@/lib/goal-progress";
import GoalDebtBadge, { goalDebtTooltip } from "@/app/components/GoalDebtBadge";
import GoalDeadlineNote from "@/app/components/GoalDeadlineNote";
import IconAction from "@/app/components/IconAction";
import IconBadge from "@/app/components/dashboard/IconBadge";
import PillToggle from "@/app/components/PillToggle";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import MemberAvatar from "./MemberAvatar";
import type { OwnerGroup } from "./CharactersClient";

const GOAL_META: {
  key: GoalTarget["goalType"];
  label: string;
  icon: typeof Users;
  color: string;
  unit: string;
}[] = [
  { key: "characters", label: "Personajes", icon: Users, color: "var(--color-secondary)", unit: "personajes" },
  { key: "avg_ilvl", label: "ilvl promedio", icon: Gauge, color: "var(--color-epic)", unit: "de ilvl" },
];



const DEADLINE_DAY_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  timeZone: "UTC",
});

function formatGoalDeadline(offsetMinutes: number | null): string {
  if (offsetMinutes == null) return "al terminar la semana";
  const { time, dateKey } = goalDeadlineZonedParts(getLockoutWeekStart("us"), offsetMinutes);
  const day = DEADLINE_DAY_FORMATTER.format(new Date(`${dateKey}T12:00:00Z`));
  return `el ${day} a las ${time}`;
}

function currentWeekProgressPct(): number {
  const weekStart = getLockoutWeekStart("us").getTime();
  const elapsed = (Date.now() - weekStart) / (MINUTES_PER_WEEK * 60 * 1000);
  return Math.min(100, Math.max(0, elapsed * 100));
}

interface GoalDraft {
  target: string;
  minIlvl: string;
  onlyMains: boolean;
  shortenWeek: boolean;
  deadlineDayIndex: number;
  deadlineTime: string;
}

const DEFAULT_DEADLINE_DAY_INDEX = 0;
const DEFAULT_DEADLINE_TIME = "22:00";

function buildGoalDrafts(rows: GoalTarget[]): Record<GoalTarget["goalType"], GoalDraft> {
  const weekStart = getLockoutWeekStart("us");

  function deadlineDraft(offsetMinutes: number | null | undefined) {
    if (offsetMinutes == null) {
      return {
        shortenWeek: false,
        deadlineDayIndex: DEFAULT_DEADLINE_DAY_INDEX,
        deadlineTime: DEFAULT_DEADLINE_TIME,
      };
    }
    const { dayIndex, time } = goalDeadlineZonedParts(weekStart, offsetMinutes);
    return { shortenWeek: true, deadlineDayIndex: dayIndex, deadlineTime: time };
  }

  const charRow = rows.find((r) => r.goalType === "characters");
  const avgRow = rows.find((r) => r.goalType === "avg_ilvl");
  return {
    characters: {
      target: charRow ? String(charRow.target) : "",
      minIlvl: charRow?.minIlvl != null ? String(charRow.minIlvl) : "",
      onlyMains: charRow?.onlyMains ?? false,
      ...deadlineDraft(charRow?.deadlineOffsetMinutes),
    },
    avg_ilvl: {
      target: avgRow ? String(avgRow.target) : "",
      minIlvl: "",
      onlyMains: false,
      ...deadlineDraft(avgRow?.deadlineOffsetMinutes),
    },
  };
}

function draftAsGoalTarget(goalType: GoalTarget["goalType"], draft: GoalDraft): GoalTarget | null {
  const target = Number(draft.target.trim());
  if (!draft.target.trim() || !Number.isFinite(target) || target < 1) return null;
  const minIlvl = Number(draft.minIlvl.trim());
  return {
    goalType,
    target: Math.round(target),
    minIlvl: goalType === "characters" && draft.minIlvl.trim() && Number.isFinite(minIlvl) ? Math.round(minIlvl) : null,
    onlyMains: goalType === "characters" ? draft.onlyMains : false,
    deadlineOffsetMinutes: draftDeadlineOffset(draft),
  };
}

function draftDeadlineOffset(draft: GoalDraft): number | null {
  if (!draft.shortenWeek) return null;
  const offset = goalDeadlineOffsetFromZoned(
    getLockoutWeekStart("us"),
    draft.deadlineDayIndex,
    draft.deadlineTime
  );
  return offset > 0 && offset < MINUTES_PER_WEEK ? offset : null;
}

function previewMemberFit(
  members: OwnerGroup[],
  goal: GoalTarget,
  mainClassesByUser: Record<string, string[]>,
  useMainsForIlvl: boolean,
  topNForIlvl?: number
): { userId: string; name: string; avatarUrl: string | null; current: number; meets: boolean }[] {
  return members.map((member) => {
    const mainClasses = new Set(mainClassesByUser[member.user_id] ?? []);
    const current =
      goal.goalType === "characters"
        ? countCharactersForGoal(member.characters, goal, mainClasses)
        : computeAverageIlvl(member.characters, useMainsForIlvl ? mainClasses : undefined, topNForIlvl);
    return {
      userId: member.user_id,
      name: member.discord_username,
      avatarUrl: member.avatar_url,
      current,
      meets: current >= goal.target,
    };
  });
}

function WeekDeadlineTrack({
  offsetMinutes,
  color,
  invalid = false,
}: {
  offsetMinutes: number | null;
  color: string;
  invalid?: boolean;
}) {
  const pct = invalid ? 0 : offsetMinutes == null ? 100 : (offsetMinutes / MINUTES_PER_WEEK) * 100;
  const nowPct = currentWeekProgressPct();
  return (
    <div className="pt-4">
      <div className="relative h-1.5 rounded-full" style={{ backgroundColor: "var(--color-canvas)" }}>
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 30%, transparent), ${color})`,
          }}
        />
        <span
          aria-hidden
          className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded-full"
          style={{ left: `${nowPct}%`, backgroundColor: "var(--color-ink)" }}
        />
        <span
          className="absolute -top-[19px] -translate-x-1/2 font-data text-micro font-bold uppercase tracking-[0.1em] text-ink whitespace-nowrap"
          style={{ left: `${nowPct}%` }}
        >
          Hoy
        </span>
        {!invalid && (
          <span
            className="absolute -top-[5px] h-[16px] w-[3px] rounded-full transition-[left] duration-300"
            style={{ left: `calc(${pct}% - 1.5px)`, backgroundColor: color }}
          />
        )}
      </div>
      <div className="flex justify-between mt-2 font-data text-micro uppercase tracking-[0.12em] text-ink-muted">
        <span>Reinicio</span>
        <span>Reinicio siguiente</span>
      </div>
    </div>
  );
}

function MemberFitAvatar({
  row,
  target,
  size = 16,
}: {
  row: { userId: string; name: string; avatarUrl: string | null; current: number; meets: boolean };
  target: number;
  size?: number;
}) {
  return (
    <span
      title={`${row.name} — ${row.current}/${target}`}
      className="shrink-0 rounded-full bg-cover bg-center inline-flex items-center justify-center font-heading font-bold transition-[filter,box-shadow] duration-300"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        color: "var(--color-ink-faint)",
        backgroundColor: "var(--color-surface-2)",
        backgroundImage: row.avatarUrl ? `url(${row.avatarUrl})` : undefined,
        filter: row.meets ? "none" : "grayscale(1) opacity(0.55)",
        boxShadow: row.meets
          ? "0 0 0 2px var(--color-success)"
          : "0 0 0 1px var(--color-line-strong)",
      }}
    >
      {!row.avatarUrl && row.name.charAt(0).toUpperCase()}
    </span>
  );
}

function MemberFitMeter({
  rows,
  target,
  unit,
}: {
  rows: { userId: string; name: string; avatarUrl: string | null; current: number; meets: boolean }[];
  target: number;
  unit: string;
}) {
  const meeting = rows.filter((r) => r.meets).length;
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {rows.map((row) => (
          <MemberFitAvatar key={row.userId} row={row} target={target} />
        ))}
      </div>
      <p className="text-label text-ink-muted mt-2.5">
        <span className="font-data font-bold text-ink">{meeting}</span> de {rows.length} miembro
        {rows.length === 1 ? "" : "s"} ya llegan a {target} {unit} hoy
      </p>
    </div>
  );
}

function GoalStreakHistory({
  members,
  debts,
  mainClassesByUser,
}: {
  members: OwnerGroup[];
  debts: MemberGoalDebt[];
  mainClassesByUser: Record<string, string[]>;
}) {
  const cards = useMemo(() => {
    const byId = new Map(members.map((m) => [m.user_id, m]));
    const byUser = new Map<
      string,
      {
        member: OwnerGroup;
        entries: { debt: MemberGoalDebt; current: number }[];
      }
    >();
    for (const debt of debts) {
      const member = byId.get(debt.userId);
      if (!member) continue;
      const mainClasses = new Set(mainClassesByUser[member.user_id] ?? []);
      const current = currentValueForRules(debt.goalType, member.characters, debt, mainClasses);
      if (!byUser.has(debt.userId)) byUser.set(debt.userId, { member, entries: [] });
      byUser.get(debt.userId)!.entries.push({ debt, current });
    }
    return Array.from(byUser.values()).sort(
      (a, b) =>
        Math.max(...b.entries.map((e) => e.debt.weeks)) -
        Math.max(...a.entries.map((e) => e.debt.weeks))
    );
  }, [members, debts, mainClassesByUser]);

  if (cards.length === 0) {
    return (
      <p className="text-ink-faint text-xs">
        Nadie arrastra semanas sin cumplir. Cuando alguien no llegue a un objetivo antes de que
        cierre la semana, aparece acá.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {cards.map(({ member, entries }) => (
        <div
          key={member.user_id}
          className="flex flex-col items-center gap-2.5 rounded-lg p-3 text-center"
          style={{ backgroundColor: "var(--color-surface-2)" }}
        >
          <MemberAvatar group={member} size={36} />
          <span className="block w-full truncate text-meta font-semibold text-ink leading-tight">
            {member.discord_username}
          </span>
          <div className="flex flex-col gap-1.5 w-full">
            {entries.map(({ debt, current }) => (
              <div
                key={debt.goalType}
                className="flex items-center justify-between gap-1.5"
                title={goalDebtTooltip(debt, current)}
              >
                <span className="text-micro text-ink-faint truncate">{GOAL_TYPE_LABELS[debt.goalType]}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="font-data text-micro text-ink-muted">
                    <span className="text-ink font-bold">{current}</span>/{debt.target}
                  </span>
                  <GoalDebtBadge debt={debt} size="sm" current={current} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function deadlineDayOptions(): { value: number; label: string }[] {
  const resetDateKey = zonedDateKey(getLockoutWeekStart("us"), GUILD_TIMEZONE);
  return Array.from({ length: MAX_DEADLINE_DAY_INDEX + 1 }, (_, i) => {
    const dateKey = shiftDateKey(resetDateKey, i);
    return {
      value: i,
      label: capitalize(DEADLINE_DAY_FORMATTER.format(new Date(`${dateKey}T12:00:00Z`))),
    };
  });
}

export default function AdminGoalsPanel({
  goals,
  goalsLoaded,
  onSaved,
  members,
  goalDebts,
  onGoalDebtsUpdated,
  mainClassesByUser,
}: {
  goals: GoalTarget[];
  goalsLoaded: boolean;
  onSaved: (goals: GoalTarget[]) => void;
  members: OwnerGroup[];
  goalDebts: MemberGoalDebt[];
  onGoalDebtsUpdated: (debts: MemberGoalDebt[]) => void;
  mainClassesByUser: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<GoalTarget["goalType"], GoalDraft>>(() =>
    buildGoalDrafts(goals)
  );
  const [syncedGoals, setSyncedGoals] = useState(goals);

  if (goals !== syncedGoals) {
    setSyncedGoals(goals);
    setDrafts(buildGoalDrafts(goals));
  }

  function handleOpen() {
    setOpen(true);
  }

  async function handleSave() {
    setError("");
    if (!goalsLoaded) {
      setError("Todavía se están cargando los objetivos actuales, espera un segundo.");
      return;
    }
    const payload = GOAL_META.map(({ key }) => {
      const draft = drafts[key];
      const rawTarget = draft.target.trim();
      const rawMinIlvl = draft.minIlvl.trim();
      return {
        goalType: key,
        target: rawTarget === "" ? null : Number(rawTarget),
        minIlvl: key === "characters" && rawMinIlvl !== "" ? Number(rawMinIlvl) : null,
        onlyMains: key === "characters" ? draft.onlyMains : false,
        deadline: draft.shortenWeek
          ? { dayIndex: draft.deadlineDayIndex, time: draft.deadlineTime }
          : null,
      };
    });

    const invalidTarget = payload.find(
      (g) => g.target !== null && (!Number.isFinite(g.target) || g.target < 1)
    );
    if (invalidTarget) {
      setError("La meta debe ser un número mayor a 0 (o déjala vacía para sacarla del dashboard).");
      return;
    }
    const invalidIlvl = payload.find(
      (g) => g.minIlvl !== null && (!Number.isFinite(g.minIlvl) || g.minIlvl < 1)
    );
    if (invalidIlvl) {
      setError("El ilvl mínimo debe ser un número mayor a 0 (o déjalo vacío para no exigir ninguno).");
      return;
    }
    const invalidDeadline = GOAL_META.find(
      ({ key }) => drafts[key].shortenWeek && draftDeadlineOffset(drafts[key]) === null
    );
    if (invalidDeadline) {
      setError(
        `El horario de cierre de "${invalidDeadline.label}" cae antes del reinicio semanal. Elige uno más tarde.`
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: payload }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo guardar.");
        return;
      }
      const updated: GoalTarget[] = data.goals ?? [];
      setDrafts(buildGoalDrafts(updated));
      onSaved(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setDrafts(buildGoalDrafts(goals));
    setError("");
    setEditing(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors mb-5"
      >
        <Target className="w-3.5 h-3.5" />
        Configurar objetivos
      </button>
    );
  }

  const dayOptions = deadlineDayOptions();

  return (
    <div className="card p-5 mb-5 w-full">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Target} color="var(--color-gold)" size="sm" />
          <div>
            <h3 className="font-heading text-sm font-bold text-ink">Objetivos personales del guild</h3>
            <p className="text-ink-faint text-xs">
              Una misma meta para todos, con su propio cierre semanal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            handleCancelEdit();
          }}
          title="Cerrar"
          aria-label="Cerrar"
          className="text-ink-faint hover:text-ink transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!goalsLoaded ? (
        <p className="text-ink-faint text-xs py-2">Cargando...</p>
      ) : editing ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {GOAL_META.map(({ key, label, icon, color, unit }) => {
              const draft = drafts[key];
              const previewGoal = draftAsGoalTarget(key, draft);
              const offset = draftDeadlineOffset(draft);
              const badHour = draft.shortenWeek && offset === null;
              const charactersDraftTarget = draftAsGoalTarget("characters", drafts.characters)?.target;
              return (
                <div
                  key={key}
                  className="rounded-xl border border-line p-4 flex flex-col gap-4"
                  style={{ backgroundColor: "var(--color-surface-2)" }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconBadge icon={icon} color={color} size="sm" />
                      <span className="font-heading text-sm font-bold text-ink truncate">{label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-data text-micro uppercase tracking-[0.12em] text-ink-muted">
                        Meta
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={draft.target}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], target: e.target.value } }))
                        }
                        placeholder="—"
                        aria-label={`Meta de ${label}`}
                        className="input px-2.5 py-1.5 w-20 text-right font-data font-bold text-base"
                      />
                    </div>
                  </div>

                  {key === "avg_ilvl" && (
                    <p className="pt-4 border-t border-line text-label text-ink-muted">
                      {drafts.characters.onlyMains ? (
                        <>
                          Promedia solo las clases main de cada miembro -- comparte el filtro del
                          objetivo &quot;Personajes&quot;.
                        </>
                      ) : (
                        <>
                          Promedia todos los personajes de cada miembro, sin piso de ilvl ni filtro
                          de clase main.
                        </>
                      )}
                    </p>
                  )}

                  {key === "characters" && (
                    <div className="pt-4 border-t border-line flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ink-muted">ilvl mínimo</span>
                          <input
                            type="number"
                            min={1}
                            value={draft.minIlvl}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                characters: { ...prev.characters, minIlvl: e.target.value },
                              }))
                            }
                            placeholder="Sin piso"
                            aria-label="ilvl mínimo para que un personaje cuente"
                            className="input px-2.5 py-1.5 text-sm w-24 font-data"
                          />
                        </div>
                        <PillToggle
                          checked={draft.onlyMains}
                          onChange={(v) =>
                            setDrafts((prev) => ({ ...prev, characters: { ...prev.characters, onlyMains: v } }))
                          }
                          label="Solo clases main"
                        />
                      </div>
                      {draft.onlyMains && (
                        <p className="text-label text-ink-muted">
                          También cambia el objetivo &quot;ilvl promedio&quot;: va a promediar solo
                          las clases main de cada miembro, no todos sus personajes.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t border-line">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                      <span className="flex items-center gap-1.5 font-data text-micro uppercase tracking-[0.12em] text-ink-muted">
                        <CalendarClock className="w-3.5 h-3.5" />
                        {draft.shortenWeek ? "Cierre personalizado" : "Cierre con el reinicio semanal"}
                      </span>
                      <PillToggle
                        checked={draft.shortenWeek}
                        onChange={(v) =>
                          setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], shortenWeek: v } }))
                        }
                        label="Cierre personalizado"
                      />
                      {draft.shortenWeek && (
                        <div className="flex items-center gap-2">
                          <select
                            value={draft.deadlineDayIndex}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], deadlineDayIndex: Number(e.target.value) },
                              }))
                            }
                            aria-label={`Día de cierre de ${label}`}
                            className="input px-2.5 py-1.5 text-sm"
                          >
                            {dayOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={draft.deadlineTime}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], deadlineTime: e.target.value },
                              }))
                            }
                            aria-label={`Hora de cierre de ${label}`}
                            className="input px-2.5 py-1.5 text-sm font-data"
                          />
                          <span className="text-label text-ink-faint">hora EST</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3.5">
                      <WeekDeadlineTrack offsetMinutes={offset} color={color} invalid={badHour} />
                    </div>

                    <p className="text-label text-ink-muted mt-2.5">
                      {badHour ? (
                        <span style={{ color: "var(--color-danger)" }}>
                          Ese horario cae antes del reinicio semanal. Elige uno más tarde.
                        </span>
                      ) : (
                        <>Cierra {formatGoalDeadline(offset)}.</>
                      )}
                    </p>
                  </div>

                  <div className="mt-auto pt-4 border-t border-line">
                    {previewGoal ? (
                      <MemberFitMeter
                        rows={previewMemberFit(
                          members,
                          previewGoal,
                          mainClassesByUser,
                          drafts.characters.onlyMains,
                          charactersDraftTarget
                        )}
                        target={previewGoal.target}
                        unit={unit}
                      />
                    ) : (
                      <p className="text-label text-ink-faint">
                        Sin meta: este objetivo no aparece en el dashboard de nadie.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="text-xs mt-4" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={handleCancelEdit} disabled={saving} className="btn btn-secondary">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? "Guardando..." : "Guardar objetivos"}
            </button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {GOAL_META.map(({ key, label, icon, color, unit }) => {
            const row = goals.find((g) => g.goalType === key) ?? null;
            const useMainsForIlvl = ilvlGoalUsesMains(goals);
            return (
              <div
                key={key}
                className="rounded-xl border border-line p-4 flex flex-col gap-4"
                style={{ backgroundColor: "var(--color-surface-2)" }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <IconBadge icon={icon} color={color} size="sm" />
                    <span className="font-heading text-sm font-bold text-ink truncate">{label}</span>
                  </div>
                  <IconAction
                    icon={Pencil}
                    label={row ? `Editar ${label}` : `Agregar ${label}`}
                    onClick={() => setEditing(true)}
                  />
                </div>

                {row ? (
                  <>
                    <p className="font-data text-2xl font-bold text-ink">
                      {row.target}
                      <span className="text-sm font-normal text-ink-faint ml-1.5">{unit}</span>
                    </p>
                    {key === "characters" && (row.minIlvl != null || row.onlyMains) && (
                      <p className="text-label text-ink-muted">
                        {row.minIlvl != null && `ilvl mínimo ${row.minIlvl}`}
                        {row.minIlvl != null && row.onlyMains && " · "}
                        {row.onlyMains && "Solo clases main"}
                      </p>
                    )}
                    <GoalDeadlineNote offsetMinutes={row.deadlineOffsetMinutes} />
                    <div className="mt-auto pt-4 border-t border-line">
                      <MemberFitMeter
                        rows={previewMemberFit(members, row, mainClassesByUser, useMainsForIlvl, ilvlGoalTopN(goals))}
                        target={row.target}
                        unit={unit}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-label text-ink-faint">
                    Sin meta configurada: este objetivo no aparece en el dashboard de nadie.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!editing && goalsLoaded && goals.length > 0 && <CloseWeekNow members={members} onGoalDebtsUpdated={onGoalDebtsUpdated} />}

      {goalsLoaded && (
        <div className="mt-5 pt-5 border-t border-line">
          <div className="flex items-center gap-2.5 mb-3">
            <IconBadge icon={History} color="var(--color-danger)" size="sm" />
            <div>
              <h4 className="font-heading text-sm font-bold text-ink">Historial de incumplimiento</h4>
              <p className="text-ink-faint text-xs">Semanas seguidas sin cumplir el objetivo.</p>
            </div>
          </div>
          <GoalStreakHistory
            members={members}
            debts={goalDebts}
            mainClassesByUser={mainClassesByUser}
          />
        </div>
      )}

      {goalsLoaded && <GoalHistoryManager onGoalDebtsUpdated={onGoalDebtsUpdated} />}
    </div>
  );
}

function CloseWeekNow({
  members,
  onGoalDebtsUpdated,
}: {
  members: OwnerGroup[];
  onGoalDebtsUpdated: (debts: MemberGoalDebt[]) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [alreadyClosed, setAlreadyClosed] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await fetch("/api/goals/close");
      const data = await readJsonBody(res);
      if (vivo && res.ok) setAlreadyClosed(Boolean(data.alreadyClosed));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  function nombresDe(userIds: string[]): string {
    const byId = new Map(members.map((m) => [m.user_id, m.discord_username]));
    const nombres = userIds.map((id) => byId.get(id) ?? "?");
    if (nombres.length <= 6) return nombres.join(", ");
    return nombres.slice(0, 6).join(", ") + " y " + (nombres.length - 6) + " más";
  }

  async function handleClose() {
    setClosing(true);
    try {
      const previewRes = await fetch("/api/goals/close");
      const preview = await readJsonBody(previewRes);
      if (!previewRes.ok) {
        toast.error("No se pudo preparar el cierre", preview.error);
        return;
      }
      if (preview.alreadyClosed) {
        setAlreadyClosed(true);
        toast.info("Esta semana ya estaba cerrada", "El objetivo siguiente arranca en el próximo reinicio.");
        return;
      }

      const summary = preview.summary as GoalCloseSummary | null;
      if (!summary || summary.goals.length === 0) {
        toast.error("No hay ningún objetivo configurado para cerrar.");
        return;
      }

      const detalle = summary.goals
        .map((g) => {
          const faltan = g.total - g.met;
          if (faltan === 0) return GOAL_TYPE_LABELS[g.goalType] + ": lo cumplen todos.";
          return (
            GOAL_TYPE_LABELS[g.goalType] +
            " (" +
            describeGoalRules(g.goalType, g) +
            "): " +
            faltan +
            " de " +
            g.total +
            " no llegan — " +
            nombresDe(g.unmetUserIds) +
            "."
          );
        })
        .join("\n");

      const ok = await confirm(
        "Cerrar la semana ahora evalúa a los " +
          summary.evaluated +
          " miembros con la meta de esta semana y les reparte la marca de incumplimiento en el acto, sin esperar al martes.\n\n" +
          detalle +
          "\n\nEl ciclo siguiente arranca solo en el próximo reinicio. Si te equivocas, se corrige desde \"Historial de objetivos\".",
        { confirmLabel: "Cerrar la semana ahora", danger: true }
      );
      if (!ok) return;

      const res = await fetch("/api/goals/close", { method: "POST" });
      const data = await readJsonBody(res);
      if (!res.ok) {
        toast.error("No se pudo cerrar la semana", data.error);
        return;
      }
      setAlreadyClosed(true);
      onGoalDebtsUpdated(data.goalDebts ?? []);
      const cerrado = (data.summary as GoalCloseSummary | null)?.goals ?? [];
      const marcados = cerrado.reduce((max, g) => Math.max(max, g.total - g.met), 0);
      toast.success(
        "Semana cerrada",
        marcados === 0
          ? "La cumplieron todos: nadie quedó marcado."
          : marcados + " miembro" + (marcados === 1 ? "" : "s") + " quedaron marcados."
      );
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          {alreadyClosed ? "Esta semana ya está cerrada" : "¿Terminar la semana antes de tiempo?"}
        </p>
        <p className="text-label text-ink-muted mt-0.5">
          {alreadyClosed
            ? "Los resultados ya están en el historial. El objetivo siguiente arranca en el próximo reinicio."
            : "Evalúa a todo el guild con la meta de esta semana y reparte las marcas ahora mismo, sin esperar al reinicio."}
        </p>
      </div>
      <button
        type="button"
        onClick={handleClose}
        disabled={closing || alreadyClosed === true}
        className="btn btn-secondary shrink-0"
      >
        {closing ? "Cerrando..." : "Cerrar ahora"}
      </button>
    </div>
  );
}

function GoalHistoryManager({
  onGoalDebtsUpdated,
}: {
  onGoalDebtsUpdated: (debts: MemberGoalDebt[]) => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weeks, setWeeks] = useState<GoalHistoryWeek[] | null>(null);
  const [error, setError] = useState("");
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/goal-history");
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo cargar el historial.");
        return;
      }
      setWeeks(data.weeks ?? []);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && weeks === null) load();
  }

  async function handleDismiss(weekStart: string) {
    const label = WEEK_LABEL_FORMATTER.format(new Date(`${weekStart}T12:00:00Z`));
    const confirmed = await confirm(
      `¿Marcar la semana del ${label} como cumplida para todos? No se puede borrar el registro (se regeneraría solo, con los mismos datos de hoy, la próxima vez que alguien entre a Personajes) -- marcarla como cumplida es lo que hace que deje de contar como una falla en la racha de cada miembro.`,
      { confirmLabel: "Marcar como cumplida" }
    );
    if (!confirmed) return;

    setDismissing(weekStart);
    setError("");
    try {
      const res = await fetch("/api/admin/goal-history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar.");
        return;
      }
      setWeeks((prev) =>
        (prev ?? []).map((w) =>
          w.weekStart === weekStart ? { ...w, goals: w.goals.map((g) => ({ ...g, met: g.total })) } : w
        )
      );
      onGoalDebtsUpdated(data.goalDebts ?? []);
    } finally {
      setDismissing(null);
    }
  }

  async function handleDelete(weekStart: string) {
    const label = WEEK_LABEL_FORMATTER.format(new Date(`${weekStart}T12:00:00Z`));
    const confirmed = await confirm(
      `¿Eliminar el registro de la semana del ${label} para todos? Esta acción no se puede deshacer.`,
      { danger: true, confirmLabel: "Eliminar" }
    );
    if (!confirmed) return;

    setDeleting(weekStart);
    setError("");
    try {
      const res = await fetch("/api/admin/goal-history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar.");
        return;
      }
      setWeeks((prev) => (prev ?? []).filter((w) => w.weekStart !== weekStart));
      onGoalDebtsUpdated(data.goalDebts ?? []);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mt-5 pt-5 border-t border-line">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors"
      >
        <History className="w-3.5 h-3.5" />
        Historial de objetivos
      </button>

      {open && (
        <div className="mt-3">
          {loading && <p className="text-ink-faint text-xs py-2">Cargando...</p>}
          {error && (
            <p className="text-xs mb-2" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
          {!loading && weeks && weeks.length === 0 && (
            <p className="text-ink-faint text-xs py-2">Todavía no se cerró ninguna semana.</p>
          )}
          {!loading && weeks && weeks.length > 0 && (
            <div className="flex flex-col gap-2">
              {weeks.map((week) => {
                const label = WEEK_LABEL_FORMATTER.format(new Date(`${week.weekStart}T12:00:00Z`));
                const hasUnmet = week.goals.some((g) => g.met < g.total);
                return (
                  <div
                    key={week.weekStart}
                    className="rounded-lg border border-line p-3 flex items-center justify-between gap-4"
                    style={{ backgroundColor: "var(--color-surface-2)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">Semana del {label}</p>
                      <div className="mt-1 flex flex-col gap-0.5">
                        {week.goals.map((g) => (
                          <p key={g.goalType} className="text-label text-ink-muted">
                            <span className="text-ink-faint">{describeGoalRules(g.goalType, g)}</span>
                            {" — "}
                            <span className={g.met < g.total ? "text-[color:var(--color-alert)]" : ""}>
                              {g.met}/{g.total} cumplió
                            </span>
                          </p>
                        ))}
                      </div>
                      {!week.deletable && !hasUnmet && (
                        <p className="text-label text-ink-faint mt-0.5">
                          Es la semana actual o la anterior -- se podrá eliminar después del próximo reinicio.
                        </p>
                      )}
                    </div>
                    {week.deletable ? (
                      <IconAction
                        icon={Trash2}
                        label={`Eliminar la semana del ${label}`}
                        onClick={() => handleDelete(week.weekStart)}
                        disabled={deleting === week.weekStart}
                        className="hover:text-[color:var(--color-danger)]"
                      />
                    ) : (
                      hasUnmet && (
                        <IconAction
                          icon={Check}
                          label={`Marcar la semana del ${label} como cumplida`}
                          onClick={() => handleDismiss(week.weekStart)}
                          disabled={dismissing === week.weekStart}
                          className="hover:text-[color:var(--color-success)]"
                        />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GoalHistoryWeek {
  weekStart: string;
  goals: {
    goalType: GoalTarget["goalType"];
    target: number;
    minIlvl: number | null;
    onlyMains: boolean;
    topN: number | null;
    met: number;
    total: number;
  }[];
  deletable: boolean;
}

const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

