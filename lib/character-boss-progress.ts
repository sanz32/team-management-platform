import { bossKey, type Difficulty, type RaidDef } from "./raids";

export interface CharacterBossEntry {
  bossIndex: number;
  name: string;
  imageUrl: string | null;
  killed: boolean;
}

export interface CharacterRaidDifficultyRow {
  difficulty: Difficulty;
  bosses: CharacterBossEntry[];
  killedCount: number;
  totalCount: number;
}

export interface CharacterRaidProgress {
  raid: RaidDef;
  difficulties: CharacterRaidDifficultyRow[];
}

export const BOSS_PROGRESS_DIFFICULTIES: Difficulty[] = ["normal", "heroic", "mythic"];

export function characterBossProgressByRaid(
  character: { kills: string[] },
  raids: RaidDef[],
  difficulties: Difficulty[] = BOSS_PROGRESS_DIFFICULTIES
): CharacterRaidProgress[] {
  const killed = new Set(character.kills ?? []);
  const result: CharacterRaidProgress[] = [];

  for (const raid of raids) {
    if (raid.bosses.length === 0) continue;

    const rows: CharacterRaidDifficultyRow[] = [];
    for (const difficulty of difficulties) {
      if (!raid.difficulties.includes(difficulty)) continue;

      const bosses = raid.bosses.map((boss, index) => ({
        bossIndex: index + 1,
        name: boss.name,
        imageUrl: boss.imageUrl,
        killed: killed.has(bossKey(raid.key, difficulty, index + 1)),
      }));

      rows.push({
        difficulty,
        bosses,
        killedCount: bosses.filter((b) => b.killed).length,
        totalCount: bosses.length,
      });
    }

    if (rows.length === 0) continue;

    result.push({ raid, difficulties: rows });
  }

  return result;
}
