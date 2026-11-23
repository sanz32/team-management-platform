"use client";

export interface Member {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ResolvedFight {
  kind: "fight";
  reportCode: string;
  fightId: number;
  bossName: string;
  kill: boolean | null;
  difficulty: number | null;
  startTime: number;
}

export interface ResolvedReport {
  kind: "report";
  reportCode: string;
  bossCount: number;
  startTime: number | null;
}

export type ResolvedWcl = ResolvedFight | ResolvedReport;

const DIFFICULTY_LABELS: Record<number, string> = { 3: "Normal", 4: "Heroico", 5: "Mítico" };
export function difficultyLabel(difficulty: number | null): string {
  if (difficulty === null) return "-";
  return DIFFICULTY_LABELS[difficulty] ?? `Dificultad ${difficulty}`;
}

const WEEK_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatWeekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `Semana del ${WEEK_FORMATTER.format(start)} al ${WEEK_FORMATTER.format(end)}`;
}

export function wclFightUrl(reportCode: string, fightId: number | null): string {
  const base = `https://www.warcraftlogs.com/reports/${reportCode}`;
  return fightId !== null ? `${base}#fight=${fightId}` : base;
}

export function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

export function Avatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: "1px solid var(--color-line)" }}
      />
    );
  }
  return (
    <span
      className="rounded-full flex items-center justify-center font-heading font-bold shrink-0 text-ink-muted"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: "var(--color-surface-2)",
        border: "1px solid var(--color-line)",
      }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
