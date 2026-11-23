"use client";

import { useEffect, useState } from "react";
import { Clock, CheckCircle2, Users, Coffee, Palmtree, Sparkles, PartyPopper } from "lucide-react";
import IconBadge from "./dashboard/IconBadge";
import GradientBorderCard from "./dashboard/GradientBorderCard";
import { formatDayLabel } from "@/lib/format";
import {
  ACTIVITY_ENTRY_TIME,
  ACTIVITY_EXIT_TIME,
  DAY_MS,
  getGuildToday,
  guildDateKey,
  guildTimeAsUtc,
} from "@/lib/guild-day";
import { readJsonBody } from "@/lib/read-json";

const URGENT_THRESHOLD_MINUTES = 15;
const BREAK_POLL_MS = 30_000;

interface ActiveBreakInfo {
  endsAt: string;
}

interface DayOffStreak {
  count: number;
  returnsOn: string;
}

function nextDayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDayOffStreak(todayKey: string, daysOff: Set<string>): DayOffStreak | null {
  if (!daysOff.has(todayKey)) return null;
  let count = 0;
  let cursor = todayKey;
  while (daysOff.has(cursor)) {
    count++;
    cursor = nextDayKey(cursor);
  }
  return { count, returnsOn: cursor };
}

function formatClock(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getActivityState(
  now: Date,
  endedSessionDates: Set<string>
): { active: boolean; msUntilEntry: number } {
  const todayKey = guildDateKey(now);
  const entryToday = guildTimeAsUtc(todayKey, ACTIVITY_ENTRY_TIME);
  const exitThisMorning = guildTimeAsUtc(todayKey, ACTIVITY_EXIT_TIME);
  const entryYesterday = new Date(entryToday.getTime() - DAY_MS);
  const exitTomorrowMorning = new Date(exitThisMorning.getTime() + DAY_MS);
  const yesterdayKey = guildDateKey(new Date(now.getTime() - DAY_MS));

  const active =
    (now >= entryYesterday && now <= exitThisMorning && !endedSessionDates.has(yesterdayKey)) ||
    (now >= entryToday && now <= exitTomorrowMorning && !endedSessionDates.has(todayKey));

  const nextEntry = now < entryToday ? entryToday : new Date(entryToday.getTime() + DAY_MS);

  return { active, msUntilEntry: nextEntry.getTime() - now.getTime() };
}

export default function NextActivityCard({ canManage = false }: { canManage?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const [activeBreak, setActiveBreak] = useState<ActiveBreakInfo | null>(null);
  const [breakFormOpen, setBreakFormOpen] = useState(false);
  const [breakMinutesInput, setBreakMinutesInput] = useState("15");
  const [breakBusy, setBreakBusy] = useState(false);

  const [endedSessionDates, setEndedSessionDates] = useState<Set<string>>(new Set());
  const [endSessionBusy, setEndSessionBusy] = useState(false);

  const [myDaysOff, setMyDaysOff] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/days-off");
        if (res.ok && !cancelled) {
          const data = await readJsonBody(res);
          const dates = (data.daysOff ?? []) as { date: string }[];
          setMyDaysOff(new Set(dates.map((d) => d.date)));
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleNext() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(check, BREAK_POLL_MS);
    }

    async function check() {
      try {
        const [breakRes, sessionRes] = await Promise.all([
          fetch("/api/activity/break"),
          fetch("/api/activity/session"),
        ]);
        if (!cancelled) {
          if (breakRes.ok) {
            const breakData = await breakRes.json();
            setActiveBreak(breakData.active ?? null);
          }
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            setEndedSessionDates(new Set(sessionData.endedDates ?? []));
          }
        }
      } catch {
      }
      scheduleNext();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        check();
      } else if (timer) {
        clearTimeout(timer);
      }
    }

    check();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function startBreakManually() {
    const minutes = Number(breakMinutesInput);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    setBreakBusy(true);
    try {
      const res = await fetch("/api/activity/break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      if (res.ok) {
        const data = await readJsonBody(res);
        setActiveBreak(data.active ?? null);
        setBreakFormOpen(false);
      }
    } finally {
      setBreakBusy(false);
    }
  }

  async function cancelBreakManually() {
    setBreakBusy(true);
    try {
      const res = await fetch("/api/activity/break", { method: "DELETE" });
      if (res.ok) setActiveBreak(null);
    } finally {
      setBreakBusy(false);
    }
  }

  async function endSessionManually() {
    setEndSessionBusy(true);
    try {
      const res = await fetch("/api/activity/session", { method: "POST" });
      if (res.ok) {
        const data = await readJsonBody(res);
        if (data.sessionDate) {
          setEndedSessionDates((prev) => new Set(prev).add(data.sessionDate));
        }
      }
    } finally {
      setEndSessionBusy(false);
    }
  }

  const state = now ? getActivityState(now, endedSessionDates) : null;
  const urgent = state !== null && !state.active && state.msUntilEntry <= URGENT_THRESHOLD_MINUTES * 60_000;
  const clock = now ? formatClock(now) : null;

  const breakMsRemaining = activeBreak && now ? new Date(activeBreak.endsAt).getTime() - now.getTime() : null;
  const breakActive = breakMsRemaining !== null && breakMsRemaining > 0;

  const todayKey = now ? getGuildToday(now) : null;
  const dayOffStreak = todayKey && myDaysOff ? getDayOffStreak(todayKey, myDaysOff) : null;

  return (
    <GradientBorderCard
      className="card hero-glow p-7 sm:p-8 h-full flex flex-col"
      gradient="linear-gradient(90deg, var(--color-secondary), var(--color-epic))"
      style={{ "--hero-glow-tint": "rgba(79, 166, 255, 0.12)" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5 mb-6">
        <IconBadge icon={Clock} color="var(--color-secondary)" size="lg" />
        <p className="text-caption">Hora actual</p>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-5">
        <p className="text-display-2xl font-data font-bold text-ink">{clock}</p>
        {dayOffStreak ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Palmtree className="w-5 h-5 shrink-0" style={{ color: "var(--color-success)" }} />
              <p className="text-display-lg font-data" style={{ color: "var(--color-success)" }}>
                Tienes {dayOffStreak.count > 1 ? "días libres" : "día libre"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--color-success)" }} />
              <p className="text-xs font-medium" style={{ color: "var(--color-success)" }}>
                Nos vemos el {formatDayLabel(dayOffStreak.returnsOn)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <PartyPopper className="w-3.5 h-3.5 shrink-0 text-ink-muted" />
              <p className="text-ink-muted text-xs">
                Disfruta {dayOffStreak.count > 1 ? "tus días libres" : "tu día libre"}
              </p>
            </div>
          </div>
        ) : breakActive ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Coffee className="w-5 h-5 shrink-0" style={{ color: "var(--color-warning)" }} />
              <p className="text-display-lg font-data" style={{ color: "var(--color-warning)" }}>
                Break
              </p>
            </div>
            <p className="text-ink-muted text-xs">Vuelven en {formatCountdown(breakMsRemaining as number)}</p>
          </div>
        ) : (
          state !== null && (
            <div>
              {state.active ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "var(--color-success)" }} />
                    <p className="text-display-lg font-data" style={{ color: "var(--color-success)" }}>
                      Activo
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 shrink-0 text-ink-muted" />
                    <p className="text-ink-muted text-xs">Pide party a un RL</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-1">Entras en</p>
                  <p
                    className="text-display-lg font-data"
                    style={{ color: urgent ? "var(--color-success)" : "var(--color-ink)" }}
                  >
                    {formatCountdown(state.msUntilEntry)}
                  </p>
                </>
              )}
            </div>
          )
        )}
      </div>

      {canManage && (
        <div className="pt-4 mt-4 border-t border-line flex items-center gap-4 flex-wrap">
          {breakActive ? (
            <button
              type="button"
              onClick={cancelBreakManually}
              disabled={breakBusy}
              className="text-xs font-medium hover:opacity-80 transition-opacity"
              style={{ color: "var(--color-danger)" }}
            >
              {breakBusy ? "Cancelando..." : "Cancelar break"}
            </button>
          ) : breakFormOpen ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                value={breakMinutesInput}
                onChange={(e) => setBreakMinutesInput(e.target.value)}
                className="input px-2 py-1 text-xs w-14"
              />
              <span className="text-xs text-ink-faint">min</span>
              <button
                type="button"
                onClick={startBreakManually}
                disabled={breakBusy || !breakMinutesInput}
                className="text-xs font-medium hover:opacity-80 transition-opacity"
                style={{ color: "var(--color-secondary)" }}
              >
                {breakBusy ? "..." : "Iniciar"}
              </button>
              <button
                type="button"
                onClick={() => setBreakFormOpen(false)}
                className="text-xs text-ink-faint hover:text-ink transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setBreakFormOpen(true)}
                className="text-xs font-medium hover:opacity-80 transition-opacity"
                style={{ color: "var(--color-secondary)" }}
              >
                + Iniciar break
              </button>
              {state?.active && (
                <button
                  type="button"
                  onClick={endSessionManually}
                  disabled={endSessionBusy}
                  className="text-xs font-medium hover:opacity-80 transition-opacity"
                  style={{ color: "var(--color-danger)" }}
                >
                  {endSessionBusy ? "Finalizando..." : "Finalizar jornada"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </GradientBorderCard>
  );
}
