"use client";

import { KeyRound, Check } from "lucide-react";
import { resolveSeasonDungeons, type WeeklyDungeonScore } from "@/lib/season-dungeon-pool";
import { cascadeStyle } from "@/lib/cascade";
import SyncCta from "./SyncCta";

export default function DungeonPoolSection({
  keystone,
  dungeons: weeklyDungeons,
  hasSynced,
  isOwner,
}: {
  keystone: unknown;
  dungeons?: WeeklyDungeonScore[] | null;
  hasSynced: boolean;
  isOwner: boolean;
}) {
  const dungeons = resolveSeasonDungeons(keystone, undefined, weeklyDungeons);

  if (!hasSynced) {
    return (
      <section className="card p-5 h-full flex flex-col">
        <header className="mb-4">
          <h3 className="font-heading text-base font-bold text-ink">Mazmorras de la semana</h3>
          <p className="text-ink-faint text-xs mt-1">
            El pool de mazmorras de Mítica+ de la temporada, con el mejor nivel completado esta
            semana en cada una.
          </p>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <SyncCta
            isOwner={isOwner}
            message="Este personaje todavía no subió sus Mazmorras de la semana."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5 h-full flex flex-col">
      <header className="mb-4">
        <h3 className="font-heading text-base font-bold text-ink">Mazmorras de la semana</h3>
        <p className="text-ink-faint text-xs mt-1">
          El pool de mazmorras de Mítica+ de la temporada, con el mejor nivel completado esta
          semana en cada una.
        </p>
      </header>

      <div className="flex-1 grid gap-2 grid-cols-1 sm:grid-cols-2 [grid-auto-rows:1fr]">
        {dungeons.map((dungeon, index) => {
          const completed = dungeon.status === "completed";
          const owned = dungeon.status === "keystone";
          const highlighted = completed || owned;
          const accent = completed ? "var(--color-success)" : "var(--color-primary)";
          return (
            <div
              key={dungeon.challengeModeID}
              style={{
                ...cascadeStyle(index),
                backgroundColor: "var(--color-surface-2)",
                border: `1px solid ${
                  highlighted ? `color-mix(in srgb, ${accent} 40%, transparent)` : "var(--color-line)"
                }`,
              }}
              className="cascade-item flex items-center gap-2.5 rounded-lg px-3 py-2.5"
            >
              <span
                className="shrink-0 font-data text-micro font-bold px-1.5 py-1 rounded"
                style={{
                  backgroundColor: highlighted
                    ? `color-mix(in srgb, ${accent} 18%, transparent)`
                    : "var(--color-surface)",
                  color: highlighted ? accent : "var(--color-ink-faint)",
                }}
              >
                {dungeon.abbr}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: highlighted ? "var(--color-ink)" : "var(--color-ink-muted)" }}
                title={dungeon.name}
              >
                {dungeon.name}
              </span>
              {highlighted ? (
                <span
                  className="shrink-0 inline-flex items-center gap-1 font-data text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
                    color: accent,
                  }}
                  title={
                    completed
                      ? `Mejor nivel completado esta semana${
                          dungeon.weeklyScore != null ? ` -- ${dungeon.weeklyScore} pts` : ""
                        }`
                      : "Llave que lleva en la bolsa"
                  }
                >
                  {completed ? <Check className="w-3 h-3" /> : <KeyRound className="w-3 h-3" />}+
                  {dungeon.keystoneLevel}
                </span>
              ) : (
                <span className="shrink-0 font-data text-xs text-ink-faint">—</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
