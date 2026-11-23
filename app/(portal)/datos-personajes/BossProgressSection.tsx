"use client";

import { Check } from "lucide-react";
import BossThumb from "@/app/components/BossThumb";
import { cascadeStyle } from "@/lib/cascade";
import {
  characterBossProgressByRaid,
  type CharacterRaidDifficultyRow,
  type CharacterRaidProgress,
} from "@/lib/character-boss-progress";
import { raidHeaderImagePosition, type Difficulty, type RaidDef } from "@/lib/raids";

const DIFFICULTY_LABEL: Partial<Record<Difficulty, string>> = {
  world: "Mundo",
  normal: "Normal",
  heroic: "Heroico",
  mythic: "Mítico",
};

function BossRow({ boss }: { boss: CharacterRaidDifficultyRow["bosses"][number] }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div style={{ opacity: boss.killed ? 1 : 0.45 }}>
        <BossThumb imageUrl={boss.imageUrl} width={48} height={24} />
      </div>
      <span
        className="min-w-0 flex-1 truncate text-xs"
        style={{ color: boss.killed ? "var(--color-ink)" : "var(--color-ink-muted)" }}
        title={boss.name}
      >
        {boss.name}
      </span>
      <span
        className="shrink-0 w-5 h-5 rounded-md inline-flex items-center justify-center"
        title={boss.killed ? "Matado esta semana" : "Todavía sin matar"}
        style={
          boss.killed
            ? {
                backgroundColor: "color-mix(in srgb, var(--color-success) 16%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-success) 45%, transparent)",
                color: "var(--color-success)",
              }
            : { border: "1px dashed var(--color-line-strong)", color: "var(--color-ink-faint)" }
        }
      >
        {boss.killed ? <Check className="w-3 h-3" /> : null}
      </span>
    </div>
  );
}

function DifficultyBlock({ row, color }: { row: CharacterRaidDifficultyRow; color: string }) {
  const complete = row.killedCount === row.totalCount && row.totalCount > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint">
          {DIFFICULTY_LABEL[row.difficulty] ?? row.difficulty}
        </span>
        <span
          className="font-data text-xs font-bold"
          style={{ color: complete ? color : "var(--color-ink-muted)" }}
        >
          {row.killedCount}/{row.totalCount}
        </span>
      </div>
      <div
        className="h-1 rounded-full overflow-hidden mb-1.5"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${row.totalCount > 0 ? (row.killedCount / row.totalCount) * 100 : 0}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div className="divide-y divide-line">
        {row.bosses.map((boss) => (
          <BossRow key={boss.bossIndex} boss={boss} />
        ))}
      </div>
    </div>
  );
}

function RaidProgressCard({ entry }: { entry: CharacterRaidProgress }) {
  const raid = entry.raid;
  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
    >
      <div
        className="h-24 relative flex items-end p-3"
        style={{
          backgroundImage: raid.headerImageUrl
            ? `linear-gradient(180deg, rgba(10,10,14,0.15) 0%, rgba(10,10,14,0.82) 100%), url(${raid.headerImageUrl})`
            : `linear-gradient(160deg, color-mix(in srgb, ${raid.color} 35%, var(--color-surface-2)), var(--color-surface))`,
          backgroundSize: "cover",
          backgroundPosition: raidHeaderImagePosition(raid.key),
        }}
      >
        <h4
          className="font-heading text-sm font-bold leading-tight"
          style={{ color: raid.color, textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
        >
          {raid.name}
        </h4>
      </div>
      <div
        className="p-3.5 grid gap-x-4"
        style={{ gridTemplateColumns: `repeat(${entry.difficulties.length}, minmax(0, 1fr))` }}
      >
        {entry.difficulties.map((row) => (
          <DifficultyBlock key={row.difficulty} row={row} color={raid.color} />
        ))}
      </div>
    </div>
  );
}

export default function BossProgressSection({
  character,
  raids,
}: {
  character: { kills: string[] };
  raids: RaidDef[];
}) {
  const progress = characterBossProgressByRaid(character, raids);

  return (
    <section className="card p-5">
      <header className="mb-4">
        <h3 className="font-heading text-base font-bold text-ink">Progreso de jefes</h3>
        <p className="text-ink-faint text-xs mt-1">
          Lo que este personaje mató esta semana, jefe por jefe.
        </p>
      </header>

      {progress.length === 0 ? (
        <p className="text-ink-faint text-sm py-6 text-center">
          Todavía no hay raids cargadas para esta temporada.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {progress.map((entry, index) => (
            <div key={entry.raid.key} style={cascadeStyle(index)} className="cascade-item w-full">
              <RaidProgressCard entry={entry} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
