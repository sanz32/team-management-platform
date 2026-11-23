import { RaidDef, RaidKey } from "./raids";
import type { RaidCatalog } from "./raid-catalog";

export type RunNamingCatalog = Pick<RaidCatalog, "raids" | "encounterToBoss">;

function bossCountByRaid(raids: RaidDef[]): Record<RaidKey, number> {
  return Object.fromEntries(raids.map((r) => [r.key, r.bosses.length]));
}

function raidAbbr(raids: RaidDef[], raidKey: RaidKey): string {
  return raids.find((r) => r.key === raidKey)!.abbr;
}

function queldanasPartialLabel(bosses: Set<number>): string {
  const hasBelloren = bosses.has(1);
  const hasMidnightFalls = bosses.has(2);
  if (hasBelloren && hasMidnightFalls) return "MQ";
  if (hasBelloren) return "Belloren";
  return "Lura";
}

export interface FightForNaming {
  encounterId: number;
  difficulty: number | null;
}

export interface RunNameResult {
  name: string | null;
  error: string | null;
}

export function buildRunName(fights: FightForNaming[], catalog: RunNamingCatalog): RunNameResult {
  if (fights.length === 0) return { name: null, error: null };

  const difficulties = new Set(fights.map((f) => f.difficulty));
  if (difficulties.size > 1) {
    return { name: null, error: "Elige peleas de una sola dificultad (no mezcles Heroico y Mítico)." };
  }

  const raidOrder: RaidKey[] = catalog.raids.map((r) => r.key);
  const bossCount = bossCountByRaid(catalog.raids);
  const totalBossesAllRaids = raidOrder.reduce((sum, k) => sum + bossCount[k], 0);

  const byRaid = new Map<RaidKey, Set<number>>();
  const unmapped: number[] = [];

  for (const f of fights) {
    const mapped = catalog.encounterToBoss[f.encounterId];
    if (!mapped) {
      unmapped.push(f.encounterId);
      continue;
    }
    if (!byRaid.has(mapped.raidKey)) byRaid.set(mapped.raidKey, new Set());
    byRaid.get(mapped.raidKey)!.add(mapped.bossIndex);
  }

  if (unmapped.length > 0) {
    return {
      name: null,
      error: "No se reconoce alguna de las peleas elegidas para nombrar la run automáticamente.",
    };
  }

  const difficulty = fights[0].difficulty;
  const difficultySuffix = difficulty === 4 ? " H" : difficulty === 5 ? " M" : "";

  const totalSelected = Array.from(byRaid.values()).reduce((sum, s) => sum + s.size, 0);
  const allRaidsFull = raidOrder.every((k) => (byRaid.get(k)?.size ?? 0) === bossCount[k]);
  if (allRaidsFull && totalSelected === totalBossesAllRaids && raidOrder.length > 1) {
    return {
      name: `all ${raidOrder.length} (${totalBossesAllRaids}/${totalBossesAllRaids})${difficultySuffix}`,
      error: null,
    };
  }

  const parts: string[] = [];
  for (const raidKey of raidOrder) {
    const bosses = byRaid.get(raidKey);
    if (!bosses || bosses.size === 0) continue;
    const total = bossCount[raidKey];

    if (bosses.size === total) {
      parts.push(raidAbbr(catalog.raids, raidKey));
    } else if (raidKey === "queldanas") {
      parts.push(queldanasPartialLabel(bosses));
    } else {
      parts.push(`${bosses.size}/${total}`);
    }
  }

  if (parts.length === 0) return { name: null, error: null };

  return { name: parts.join("+") + difficultySuffix, error: null };
}
