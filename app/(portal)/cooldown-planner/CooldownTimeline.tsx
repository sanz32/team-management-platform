"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatTimelineClock } from "@/lib/cooldown-planner/format";
import { CATEGORY_LABELS, CATEGORY_ORDER, CooldownCategory } from "@/lib/cooldown-planner/types";
import {
  phaseBandsFromTransitions,
  groupBossEvents,
  groupCastsByPerson,
  TimelinePersonGroup,
  PhaseTransitionLike,
} from "@/lib/cooldown-planner/timeline-groups";

export interface TimelineBossEvent {
  id: string;
  spellName: string;
  timestampMs: number;
  iconUrl: string | null;
}

export interface TimelineCastMarker {
  id: string;
  spellId: number;
  spellName: string;
  iconUrl: string | null;
  durationSeconds: number | null;
  timestampMs: number;
  personLabel: string;
  personRoleLabel: string;
  casterClass: string | null;
  laneColor: string;
  category: CooldownCategory | null;
  action?: React.ReactNode;
}

const GRID_INTERVAL_MS = 30_000;
const MAX_GRID_LINES = 24;
const MINUTE_MS = 60_000;

const LABEL_WIDTH = 216;
const TRACK_TAIL = 56;
const PX_PER_STEP = 112;

const BOSS_ABILITY_COLORS = [
  "#f2555a",
  "#facc15",
  "#a855f7",
  "#4fa6ff",
  "#3fcb6b",
  "#ff7d0a",
  "#f472b6",
  "#22d3ee",
];

function gridStep(durationMs: number): number {
  return Math.max(GRID_INTERVAL_MS, Math.ceil(durationMs / MAX_GRID_LINES / 1000) * 1000);
}

function gridTimestamps(durationMs: number, step: number): number[] {
  const marks: number[] = [];
  for (let t = 0; t <= durationMs; t += step) marks.push(t);
  return marks;
}

function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, var(--color-surface))`;
}

const ROW_DIVIDER = "1px solid color-mix(in srgb, var(--color-line) 65%, transparent)";

export default function CooldownTimeline({
  title,
  durationMs,
  bossEvents,
  casts,
  emptyLabel,
  phaseTransitions = [],
  renderPersonAction,
}: {
  title: string;
  durationMs: number;
  bossEvents: TimelineBossEvent[];
  casts: TimelineCastMarker[];
  emptyLabel: string;
  phaseTransitions?: PhaseTransitionLike[];
  renderPersonAction?: (person: TimelinePersonGroup<TimelineCastMarker>) => React.ReactNode;
}) {
  const [collapsedPeople, setCollapsedPeople] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<CooldownCategory | null>(null);

  const togglePerson = (person: string) => {
    setCollapsedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(person)) next.delete(person);
      else next.add(person);
      return next;
    });
  };

  const safeDuration = durationMs > 0 ? durationMs : 1;
  const step = gridStep(safeDuration);
  const marks = gridTimestamps(safeDuration, step);
  const trackWidth = Math.max(720, Math.ceil(safeDuration / step) * PX_PER_STEP);

  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / safeDuration) * 100))}%`;
  const widthPct = (ms: number) => `${Math.min(100, Math.max(0, (ms / safeDuration) * 100))}%`;

  const fineGrid = `${(step / safeDuration) * 100}% 100%`;
  const trackGrid =
    step >= MINUTE_MS
      ? {
          backgroundImage: "linear-gradient(90deg, var(--color-line-strong) 1px, transparent 1px)",
          backgroundSize: fineGrid,
        }
      : {
          backgroundImage:
            "linear-gradient(90deg, var(--color-line-strong) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
          backgroundSize: `${(MINUTE_MS / safeDuration) * 100}% 100%, ${fineGrid}`,
        };

  const categoryCounts = new Map<CooldownCategory, number>();
  for (const cast of casts) {
    if (cast.category) categoryCounts.set(cast.category, (categoryCounts.get(cast.category) ?? 0) + 1);
  }

  const visibleCasts = category ? casts.filter((c) => c.category === category) : casts;
  const people = groupCastsByPerson(visibleCasts);
  const bossRows = groupBossEvents(bossEvents, BOSS_ABILITY_COLORS);
  const phases = phaseBandsFromTransitions(phaseTransitions, safeDuration);

  const shownCategories = CATEGORY_ORDER.filter((c) => categoryCounts.has(c));

  const timeAxis = (
    <div className="flex items-end" style={{ height: 22 }}>
      <div
        className="sticky left-0 z-10 shrink-0 h-full flex items-end"
        style={{ width: LABEL_WIDTH, backgroundColor: "var(--color-surface)" }}
      >
        <span className="text-micro uppercase tracking-[0.14em] text-ink-faint pb-0.5">Tiempo</span>
      </div>
      <div className="relative flex-1 min-w-0 h-full">
        {marks.map((t) => (
          <span
            key={t}
            className="absolute bottom-0 font-data text-micro text-ink-faint pl-1 border-l"
            style={{
              left: pct(t),
              borderLeftColor: "var(--color-line-strong)",
              lineHeight: "12px",
            }}
          >
            {formatTimelineClock(t)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h3 className="font-heading font-semibold text-ink">{title}</h3>
          <p className="text-xs text-ink-faint mt-0.5">
            <span className="font-data">{formatTimelineClock(durationMs)}</span> · {bossRows.length} habilidades del
            jefe · {casts.length} cooldowns de {people.length === 0 ? 0 : new Set(casts.map((c) => c.personLabel)).size}{" "}
            jugadores
          </p>
        </div>

        {shownCategories.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <CategoryTab active={category === null} count={casts.length} onClick={() => setCategory(null)}>
              Todos
            </CategoryTab>
            {shownCategories.map((c) => (
              <CategoryTab
                key={c}
                active={category === c}
                count={categoryCounts.get(c) ?? 0}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {CATEGORY_LABELS[c]}
              </CategoryTab>
            ))}
          </div>
        )}
      </div>

      {bossEvents.length === 0 && casts.length === 0 ? (
        <p className="text-sm text-ink-faint">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: LABEL_WIDTH + trackWidth + TRACK_TAIL, paddingRight: TRACK_TAIL }}>
            {phases.length > 0 && (
              <div className="flex items-stretch" style={{ height: 24 }}>
                <div
                  className="sticky left-0 z-10 shrink-0"
                  style={{ width: LABEL_WIDTH, backgroundColor: "var(--color-surface)" }}
                />
                <div className="relative flex-1 min-w-0">
                  {phases.map((phase) => (
                    <div
                      key={`${phase.label}-${phase.startMs}`}
                      className="absolute inset-y-0 flex items-center pl-2 text-label font-semibold overflow-hidden whitespace-nowrap"
                      style={{
                        left: pct(phase.startMs),
                        width: widthPct(phase.endMs - phase.startMs),
                        borderLeft: `2px solid ${phase.isIntermission ? "var(--color-warning)" : "var(--color-line-strong)"}`,
                        backgroundColor: phase.isIntermission
                          ? "color-mix(in srgb, var(--color-warning) 12%, var(--color-surface-2))"
                          : "var(--color-surface-2)",
                        backgroundImage: phase.isIntermission
                          ? "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-warning) 20%, transparent) 0 4px, transparent 4px 10px)"
                          : undefined,
                        color: phase.isIntermission ? "var(--color-warning)" : "var(--color-ink-muted)",
                      }}
                      title={phase.label}
                    >
                      {phase.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timeAxis}

            <SectionHeading>Jefe</SectionHeading>
            {bossRows.map((row) => (
              <div key={row.spellName} className="flex items-stretch" style={{ height: 30, borderBottom: ROW_DIVIDER }}>
                <div
                  className="sticky left-0 z-10 shrink-0 flex items-center gap-2 pr-3"
                  style={{ width: LABEL_WIDTH, backgroundColor: "var(--color-surface)" }}
                  title={row.spellName}
                >
                  <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                  <SpellIcon iconUrl={row.iconUrl} color={row.color} size={18} />
                  <span className="text-xs font-medium truncate" style={{ color: row.color }}>
                    {row.spellName}
                  </span>
                  <span className="font-data text-micro text-ink-faint ml-auto shrink-0">{row.events.length}</span>
                </div>
                <div className="relative flex-1 min-w-0" style={trackGrid}>
                  {row.events.map((event) => (
                    <span
                      key={event.id}
                      className="absolute top-1/2 -translate-y-1/2 font-data text-micro leading-none pl-1 pr-1.5 py-1 rounded-r-[3px] whitespace-nowrap"
                      style={{
                        left: pct(event.timestampMs),
                        borderLeft: `2px solid ${row.color}`,
                        backgroundColor: `color-mix(in srgb, ${row.color} 16%, var(--color-surface))`,
                        color: row.color,
                      }}
                    >
                      {formatTimelineClock(event.timestampMs)}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <SectionHeading>Cooldowns</SectionHeading>
            {timeAxis}

            {people.length === 0 ? (
              category ? (
                <p className="text-xs text-ink-faint py-3">Ningún cooldown de esta categoría en este pull.</p>
              ) : (
                <p className="text-xs text-ink-faint py-3">
                  Ningún cast de este pull coincide con spells ya categorizados en la librería de cooldowns --
                  categoriza algunos en{" "}
                  <a href="/cooldown-planner/admin" className="underline">
                    Librería de cooldowns
                  </a>{" "}
                  y vuelve a abrir este log.
                </p>
              )
            ) : (
              people.map((person) => {
                const open = !collapsedPeople.has(person.personLabel);
                const headerBg = tint(person.color, 14);
                const rowBg = tint(person.color, 6);
                return (
                  <div key={person.personLabel}>
                    <div className="flex items-stretch w-full" style={{ height: 34, borderBottom: ROW_DIVIDER }}>
                      <div
                        className="sticky left-0 z-10 shrink-0 flex items-center gap-1.5 pr-3"
                        style={{
                          width: LABEL_WIDTH,
                          backgroundColor: headerBg,
                          borderLeft: `3px solid ${person.color}`,
                          paddingLeft: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => togglePerson(person.personLabel)}
                          aria-expanded={open}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                        >
                          <ChevronDown
                            className="w-3.5 h-3.5 shrink-0 text-ink-faint transition-transform"
                            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                          />
                          <span className="min-w-0">
                            <span
                              className="block text-xs font-semibold leading-tight truncate"
                              style={{ color: person.color }}
                            >
                              {person.displayLabel}
                            </span>
                            <span className="block text-micro text-ink-faint leading-tight truncate">
                              {person.personLabel}
                            </span>
                          </span>
                        </button>
                        <span className="font-data text-micro text-ink-faint shrink-0">{person.castCount}</span>
                        {renderPersonAction?.(person)}
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePerson(person.personLabel)}
                        aria-expanded={open}
                        className="relative flex-1 min-w-0 text-left"
                        style={{ backgroundColor: headerBg }}
                      >
                        {!open &&
                          person.rows.flatMap((row) =>
                            row.casts.map((cast) => (
                              <span
                                key={cast.id}
                                className="absolute top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-full"
                                style={{ left: pct(cast.timestampMs), backgroundColor: person.color, opacity: 0.75 }}
                              />
                            ))
                          )}
                      </button>
                    </div>

                    {open &&
                      person.rows.map((row) => (
                        <div
                          key={row.spellId}
                          className="flex items-stretch"
                          style={{ height: 32, borderBottom: ROW_DIVIDER }}
                        >
                          <div
                            className="sticky left-0 z-10 shrink-0 flex items-center gap-2 pr-3"
                            style={{
                              width: LABEL_WIDTH,
                              backgroundColor: rowBg,
                              borderLeft: `3px solid color-mix(in srgb, ${person.color} 45%, transparent)`,
                              paddingLeft: 14,
                            }}
                            title={row.spellName}
                          >
                            <SpellIcon iconUrl={row.iconUrl} color={person.color} size={18} />
                            <span className="text-xs text-ink-muted truncate">{row.spellName}</span>
                          </div>
                          <div className="relative flex-1 min-w-0" style={{ ...trackGrid, backgroundColor: rowBg }}>
                            {row.casts.map((cast) => (
                              <CastMarker
                                key={cast.id}
                                cast={cast}
                                left={pct(cast.timestampMs)}
                                barWidth={
                                  cast.durationSeconds
                                    ? widthPct(
                                        Math.min(cast.durationSeconds * 1000, safeDuration - cast.timestampMs)
                                      )
                                    : null
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky left-0 text-micro font-semibold uppercase tracking-[0.14em] text-ink-faint pt-3 pb-1"
      style={{ width: LABEL_WIDTH }}
    >
      {children}
    </div>
  );
}

function CategoryTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
      style={{
        backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 16%, transparent)" : "var(--color-surface-2)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: active ? "color-mix(in srgb, var(--color-primary) 50%, transparent)" : "var(--color-line)",
        color: active ? "var(--color-primary)" : "var(--color-ink-muted)",
      }}
    >
      {children}
      <span className="font-data text-micro opacity-70">{count}</span>
    </button>
  );
}

function SpellIcon({ iconUrl, color, size }: { iconUrl: string | null; color: string; size: number }) {
  return (
    <span
      className="rounded-[3px] shrink-0 overflow-hidden block"
      style={{
        width: size,
        height: size,
        backgroundColor: `color-mix(in srgb, ${color} 28%, var(--color-surface-2))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, transparent)`,
      }}
    >
      {iconUrl && <img src={iconUrl} alt="" className="w-full h-full object-cover" />}
    </span>
  );
}

function CastMarker({
  cast,
  left,
  barWidth,
}: {
  cast: TimelineCastMarker;
  left: string;
  barWidth: string | null;
}) {
  return (
    <>
      {barWidth && (
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-r-[3px] pointer-events-none"
          style={{
            left,
            width: barWidth,
            height: 22,
            backgroundColor: `color-mix(in srgb, ${cast.laneColor} 26%, transparent)`,
            borderLeft: `2px solid ${cast.laneColor}`,
          }}
        />
      )}
      <div
        className="absolute top-1/2 -translate-y-1/2 group flex items-center gap-1 pl-0.5 pr-1.5 rounded-[4px]"
        style={{
          left,
          height: 22,
          backgroundColor: "color-mix(in srgb, var(--color-canvas) 82%, transparent)",
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${cast.laneColor} 60%, transparent)`,
        }}
        title={`${cast.spellName} · ${formatTimelineClock(cast.timestampMs)} · ${cast.personLabel}`}
      >
        <SpellIcon iconUrl={cast.iconUrl} color={cast.laneColor} size={18} />
        <span className="font-data text-micro leading-none" style={{ color: cast.laneColor }}>
          {formatTimelineClock(cast.timestampMs)}
        </span>
        {cast.action}
      </div>
    </>
  );
}
