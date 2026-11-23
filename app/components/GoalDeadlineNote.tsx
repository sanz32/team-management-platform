"use client";

import { useSyncExternalStore } from "react";
import { CalendarClock } from "lucide-react";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { resolveGoalDeadline } from "@/lib/goal-progress";
import { GUILD_TIMEZONE } from "@/lib/guild-day";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

const DEADLINE_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: GUILD_TIMEZONE,
});

function nextGoalDeadline(offsetMinutes: number | null, now: number): Date {
  const weekStart = getLockoutWeekStart("us");
  const thisWeek = resolveGoalDeadline(weekStart, offsetMinutes);
  if (thisWeek.getTime() > now) return thisWeek;
  return resolveGoalDeadline(new Date(weekStart.getTime() + MS_PER_WEEK), offsetMinutes);
}

function formatRemaining(ms: number): string {
  if (ms < MS_PER_MINUTE) return "menos de 1 min";
  const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function formatDeadline(date: Date): string {
  const parts = Object.fromEntries(
    DEADLINE_FORMATTER.formatToParts(date).map((p) => [p.type, p.value])
  );
  return `el ${parts.weekday} ${parts.day}/${parts.month} a las ${parts.hour}:${parts.minute}`;
}

function subscribeToMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, MS_PER_MINUTE);
  return () => clearInterval(timer);
}

function getMinute(): number {
  return Math.floor(Date.now() / MS_PER_MINUTE);
}

function getServerMinute(): null {
  return null;
}

export default function GoalDeadlineNote({
  offsetMinutes,
  className = "",
  showIcon = true,
}: {
  offsetMinutes: number | null;
  className?: string;
  showIcon?: boolean;
}) {
  const minute = useSyncExternalStore(subscribeToMinute, getMinute, getServerMinute);
  if (minute === null) return null;

  const now = minute * MS_PER_MINUTE;
  const deadline = nextGoalDeadline(offsetMinutes, now);
  const restante = formatRemaining(deadline.getTime() - now);

  return (
    <span className={`inline-flex items-center gap-1.5 text-label text-ink-muted ${className}`}>
      {showIcon && <CalendarClock className="w-3.5 h-3.5 shrink-0 text-ink-faint" />}
      <span>
        Cierra {formatDeadline(deadline)}
        <span className="text-ink-faint"> · faltan {restante}</span>
      </span>
    </span>
  );
}
