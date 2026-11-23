"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarX2, ChevronLeft, ChevronRight, UserCheck, X } from "lucide-react";
import { cascadeStyle } from "@/lib/cascade";
import { getGuildToday } from "@/lib/guild-day";
import RoleIcon from "../../components/RoleIcon";
import { useConfirm } from "../../components/ConfirmDialogProvider";

interface DayOffEntry {
  id: string;
  date: string;
}

interface MemberDaysOff {
  user_id: string;
  discord_username: string;
  daysOff: DayOffEntry[];
  dominantRoles?: string[];
}

interface DragPayload {
  userId: string;
  sourceDate?: string;
  entryId?: string;
}

function tuesdayOf(reference: Date): Date {
  const day = reference.getUTCDay();
  const diff = day >= 2 ? day - 2 : day + 5;
  return new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - diff)
  );
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const KEY = (d: Date) => d.toISOString().slice(0, 10);

const WEEKDAY = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" });
const DAY_NUM = new Intl.DateTimeFormat("es-ES", { day: "numeric", timeZone: "UTC" });
const RANGE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });

interface DayCell {
  key: string;
  date: Date;
  isToday: boolean;
  isPast: boolean;
  off: MemberDaysOff[];
  available: number;
  roleCounts: Record<string, number>;
}

export default function CalendarioView({
  members,
  onAdd,
  onRemove,
}: {
  members: MemberDaysOff[];
  onAdd: (userId: string, date: string) => Promise<boolean>;
  onRemove: (userId: string, id: string) => Promise<void> | void;
}) {
  const confirm = useConfirm();
  const [weekOffset, setWeekOffset] = useState(0);
  const [rosterSearch, setRosterSearch] = useState("");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const todayKey = getGuildToday();
  const weekStart = useMemo(
    () => addDays(tuesdayOf(new Date(`${todayKey}T00:00:00Z`)), weekOffset * 7),
    [todayKey, weekOffset]
  );

  const days: DayCell[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const key = KEY(date);
      const off = members.filter((m) => m.daysOff.some((d) => d.date === key));
      const roleCounts: Record<string, number> = {};
      for (const m of off) {
        for (const role of m.dominantRoles ?? []) {
          roleCounts[role] = (roleCounts[role] ?? 0) + 1;
        }
      }
      return {
        key,
        date,
        isToday: key === todayKey,
        isPast: key < todayKey,
        off,
        available: members.length - off.length,
        roleCounts,
      };
    });
  }, [weekStart, members, todayKey]);

  const weekKeys = days.map((d) => d.key);
  const withoutDayOff = members.filter(
    (m) => !m.daysOff.some((d) => weekKeys.includes(d.date))
  );
  const withExtra = members
    .map((m) => ({ member: m, count: m.daysOff.filter((d) => weekKeys.includes(d.date)).length }))
    .filter((x) => x.count > 1);

  const maxOff = Math.max(0, ...days.filter((d) => !d.isPast).map((d) => d.off.length));

  const rosterMembers = members.filter((m) =>
    m.discord_username.toLowerCase().includes(rosterSearch.trim().toLowerCase())
  );

  async function handleRemove(member: MemberDaysOff, dayKey: string) {
    const entry = member.daysOff.find((d) => d.date === dayKey);
    if (!entry) return;
    const ok = await confirm(
      `¿Quitar el día libre de ${member.discord_username}?`,
      { danger: true, confirmLabel: "Quitar" }
    );
    if (!ok) return;
    await onRemove(member.user_id, entry.id);
  }

  function startDrag(e: React.DragEvent, payload: DragPayload, dragKey: string) {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = payload.sourceDate ? "move" : "copy";
    setDraggingKey(dragKey);
  }

  function endDrag() {
    setDraggingKey(null);
  }

  function handleDragOver(e: React.DragEvent, day: DayCell) {
    if (day.isPast) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
    if (dragOverKey !== day.key) setDragOverKey(day.key);
  }

  function handleDragLeave(e: React.DragEvent, day: DayCell) {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    if (dragOverKey === day.key) setDragOverKey(null);
  }

  async function handleDrop(e: React.DragEvent, day: DayCell) {
    e.preventDefault();
    setDragOverKey(null);
    if (day.isPast) return;

    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.sourceDate === day.key) return;

    const created = await onAdd(payload.userId, day.key);
    if (created && payload.sourceDate && payload.entryId) {
      await onRemove(payload.userId, payload.entryId);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((v) => v - 1)}
            className="btn btn-secondary !px-2 !py-1.5"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="btn btn-ghost !px-3 !py-1.5 text-xs"
          >
            Esta semana
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((v) => v + 1)}
            className="btn btn-secondary !px-2 !py-1.5"
            title="Semana siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <p className="font-data text-sm text-ink ml-1">
            {RANGE.format(weekStart)} — {RANGE.format(addDays(weekStart, 6))}
          </p>
        </div>
        <p className="text-ink-muted text-xs">
          <span className="font-data font-bold text-ink">{members.length}</span> miembros en total
        </p>
      </div>

      <div className="card p-3 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <p className="text-caption !text-ink-faint">Arrastra un nombre sobre un día para asignarlo</p>
          <input
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Buscar..."
            className="input px-2.5 py-1 text-xs w-40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
          {rosterMembers.map((m) => {
            const dragKey = `roster-${m.user_id}`;
            return (
              <div
                key={m.user_id}
                draggable
                onDragStart={(e) => startDrag(e, { userId: m.user_id }, dragKey)}
                onDragEnd={endDrag}
                title="Arrastra sobre un día para asignarlo"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-label cursor-grab active:cursor-grabbing select-none transition-opacity"
                style={{
                  backgroundColor: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                  opacity: draggingKey === dragKey ? 0.4 : 1,
                }}
              >
                {(m.dominantRoles ?? []).slice(0, 1).map((role) => (
                  <RoleIcon key={role} role={role} size={13} />
                ))}
                <span className="text-ink truncate max-w-[110px]">{m.discord_username}</span>
                {m.daysOff.length > 0 && (
                  <span className="font-data text-micro font-bold text-ink-faint">
                    {m.daysOff.length}
                  </span>
                )}
              </div>
            );
          })}
          {rosterMembers.length === 0 && (
            <p className="text-ink-faint text-xs py-1">Sin resultados.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 mb-6">
        {days.map((day, index) => {
          const isBusiest = !day.isPast && maxOff > 0 && day.off.length === maxOff;
          const isDropTarget = dragOverKey === day.key;
          return (
            <div
              key={day.key}
              onDragEnter={(e) => handleDragOver(e, day)}
              onDragOver={(e) => handleDragOver(e, day)}
              onDragLeave={(e) => handleDragLeave(e, day)}
              onDrop={(e) => handleDrop(e, day)}
              className="hud-panel p-2.5 flex flex-col cascade-item transition-colors"
              style={{
                ...cascadeStyle(index),
                opacity: day.isPast ? 0.55 : 1,
                backgroundColor: isDropTarget
                  ? "color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))"
                  : undefined,
                borderTopColor: isDropTarget
                  ? "var(--color-primary)"
                  : day.isToday
                    ? "var(--color-primary)"
                    : isBusiest
                      ? "var(--color-warning)"
                      : undefined,
                borderRightColor: isDropTarget ? "var(--color-primary)" : undefined,
                borderBottomColor: isDropTarget ? "var(--color-primary)" : undefined,
                borderLeftColor: isDropTarget ? "var(--color-primary)" : undefined,
              }}
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span
                  className="text-label font-semibold uppercase tracking-wide"
                  style={{ color: day.isToday ? "var(--color-primary)" : "var(--color-ink-muted)" }}
                >
                  {WEEKDAY.format(day.date).replace(".", "")} {DAY_NUM.format(day.date)}
                </span>
                {day.isToday && <span className="pill pill-accent !text-micro !py-0">hoy</span>}
              </div>

              {day.isPast ? (
                <div className="mb-2">
                  <span className="font-data text-2xl font-bold text-ink-faint leading-none">—</span>
                  <p className="text-micro mt-0.5 text-ink-faint">sin registro</p>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-data text-2xl font-bold text-ink leading-none">
                      {day.available}
                    </span>
                    <span className="text-ink-faint text-micro">disponibles</span>
                  </div>
                  <p
                    className="text-micro mt-0.5 mb-2"
                    style={{ color: isBusiest ? "var(--color-warning)" : "var(--color-ink-faint)" }}
                  >
                    {day.off.length === 0
                      ? "nadie libre"
                      : `${day.off.length} libre${day.off.length === 1 ? "" : "s"}`}
                  </p>
                </>
              )}

              {day.off.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2 pb-2 border-b border-line">
                  {["tank", "heal", "dps"].map((role) =>
                    day.roleCounts[role] ? (
                      <span key={role} className="inline-flex items-center gap-0.5">
                        <RoleIcon role={role} size={14} />
                        <span className="font-data text-micro font-bold text-ink-muted">
                          {day.roleCounts[role]}
                        </span>
                      </span>
                    ) : null
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1 flex-1">
                {day.off.map((m) => {
                  const entry = m.daysOff.find((d) => d.date === day.key)!;
                  const dragKey = `${day.key}-${m.user_id}`;
                  return (
                    <div
                      key={m.user_id}
                      draggable
                      onDragStart={(e) =>
                        startDrag(e, { userId: m.user_id, sourceDate: day.key, entryId: entry.id }, dragKey)
                      }
                      onDragEnd={endDrag}
                      title={`Arrastra a otro día para mover a ${m.discord_username}`}
                      className="group flex items-center gap-1 rounded px-1.5 py-1 cursor-grab active:cursor-grabbing select-none transition-opacity"
                      style={{
                        backgroundColor: "var(--color-surface-2)",
                        border: "1px solid var(--color-line)",
                        opacity: draggingKey === dragKey ? 0.4 : 1,
                      }}
                    >
                      {(m.dominantRoles ?? []).slice(0, 1).map((role) => (
                        <RoleIcon key={role} role={role} size={13} />
                      ))}
                      <span className="text-label text-ink truncate flex-1">{m.discord_username}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(m, day.key);
                        }}
                        title={`Quitar el día libre de ${m.discord_username}`}
                        className="shrink-0 text-ink-faint hover:text-[color:var(--color-danger)] transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExceptionCard
          icon={CalendarX2}
          color="var(--color-secondary)"
          title="Sin día libre esta semana"
          count={withoutDayOff.length}
          empty="Todos tienen al menos un día libre."
        >
          {withoutDayOff.map((m, i) => {
            const dragKey = `exception-${m.user_id}`;
            return (
              <div
                key={m.user_id}
                draggable
                onDragStart={(e) => startDrag(e, { userId: m.user_id }, dragKey)}
                onDragEnd={endDrag}
                title="Arrastra sobre un día para asignarlo"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-label cascade-item cursor-grab active:cursor-grabbing select-none transition-opacity"
                style={{
                  backgroundColor: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                  opacity: draggingKey === dragKey ? 0.4 : 1,
                  ...cascadeStyle(i),
                }}
              >
                {(m.dominantRoles ?? []).slice(0, 1).map((role) => (
                  <RoleIcon key={role} role={role} size={13} />
                ))}
                <span className="text-ink">{m.discord_username}</span>
              </div>
            );
          })}
        </ExceptionCard>

        <ExceptionCard
          icon={AlertTriangle}
          color="var(--color-warning)"
          title="Con más de un día libre"
          count={withExtra.length}
          empty="Nadie tiene más de un día libre esta semana."
        >
          {withExtra.map(({ member, count }, i) => (
            <span
              key={member.user_id}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-label cascade-item"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)",
                ...cascadeStyle(i),
              }}
            >
              <span className="text-ink">{member.discord_username}</span>
              <span className="font-data font-bold" style={{ color: "var(--color-warning)" }}>
                {count}
              </span>
            </span>
          ))}
        </ExceptionCard>
      </div>
    </div>
  );
}

function ExceptionCard({
  icon: Icon,
  color,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 shrink-0" style={{ color: count > 0 ? color : "var(--color-ink-faint)" }} />
        <p className="text-caption">{title}</p>
        <span className="font-data text-sm font-bold" style={{ color: count > 0 ? color : "var(--color-ink-faint)" }}>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-ink-faint text-xs inline-flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5" />
          {empty}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      )}
    </div>
  );
}
