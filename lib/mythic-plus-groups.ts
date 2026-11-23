export const GROUP_SIZE = 5;

export const MIN_MATCH_TO_STORE = 1;

export interface MythicPlusRunRosterEntry {
  userId: string;
  displayName: string;
  characterName: string;
  characterClass: string | null;
  realm: string;
  itemLevel: number | null;
}

export type MythicPlusRunSource = "raiderio" | "wcl";

export interface MythicPlusGroupRun {
  id: string;
  groupId: string;
  source: MythicPlusRunSource;
  sourceRunId: string;
  dungeonName: string | null;
  keystoneLevel: number | null;
  keystoneUpgrades: number;
  clearTimeMs: number | null;
  completedAt: string;
  matchedCount: number;
  roster: MythicPlusRunRosterEntry[];
  avgIlvl: number | null;
}

export function computeMatchedCount(rosterUserIds: (string | null)[], groupMemberIds: Set<string>): number {
  let count = 0;
  for (const id of rosterUserIds) {
    if (id !== null && groupMemberIds.has(id)) count++;
  }
  return count;
}

export function isFullMatch(run: Pick<MythicPlusGroupRun, "matchedCount">, groupSize = GROUP_SIZE): boolean {
  return run.matchedCount >= groupSize;
}

export type MythicPlusPeriod = "day" | "week";

export function filterRunsByPeriod<T extends { completedAt: string }>(
  runs: T[],
  period: MythicPlusPeriod,
  now: Date = new Date()
): T[] {
  const windowMs = (period === "day" ? 24 : 24 * 7) * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  return runs.filter((run) => new Date(run.completedAt).getTime() >= cutoff);
}

export interface MythicPlusLevelBreakdownEntry {
  label: string;
  count: number;
}

export interface MythicPlusLeaderboardEntry {
  groupId: string;
  confirmedCount: number;
  partialCount: number;
  avgKeystoneLevel: number | null;
  avgClearTimeMs: number | null;
  avgIlvl: number | null;
  lastActivityAt: string | null;
  levelBreakdown: MythicPlusLevelBreakdownEntry[];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const HIGHEST_INDIVIDUAL_LEVEL = 9;

function levelLabel(level: number): string {
  return level > HIGHEST_INDIVIDUAL_LEVEL ? "10+" : `+${level}`;
}

function buildLevelBreakdown(confirmedRuns: MythicPlusGroupRun[]): MythicPlusLevelBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const run of confirmedRuns) {
    if (run.keystoneLevel === null) continue;
    const label = levelLabel(run.keystoneLevel);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const order = [...Array.from({ length: HIGHEST_INDIVIDUAL_LEVEL - 1 }, (_, i) => `+${i + 2}`), "10+"];
  return order.filter((label) => counts.has(label)).map((label) => ({ label, count: counts.get(label)! }));
}

export function buildLeaderboardEntry(groupId: string, runs: MythicPlusGroupRun[]): MythicPlusLeaderboardEntry {
  const confirmed = runs.filter((r) => isFullMatch(r));
  const partial = runs.filter((r) => !isFullMatch(r));

  const sortedByDate = [...runs].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return {
    groupId,
    confirmedCount: confirmed.length,
    partialCount: partial.length,
    avgKeystoneLevel: average(confirmed.map((r) => r.keystoneLevel).filter((v): v is number => v !== null)),
    avgClearTimeMs: average(confirmed.map((r) => r.clearTimeMs).filter((v): v is number => v !== null)),
    avgIlvl: average(confirmed.map((r) => r.avgIlvl).filter((v): v is number => v !== null)),
    lastActivityAt: sortedByDate[0]?.completedAt ?? null,
    levelBreakdown: buildLevelBreakdown(confirmed),
  };
}

export function buildLeaderboard(
  groupIds: string[],
  runsByGroup: Map<string, MythicPlusGroupRun[]>
): MythicPlusLeaderboardEntry[] {
  return groupIds
    .map((groupId) => buildLeaderboardEntry(groupId, runsByGroup.get(groupId) ?? []))
    .sort((a, b) => b.confirmedCount - a.confirmedCount);
}

export function computeIndividualCounts(memberIds: string[], runs: MythicPlusGroupRun[]): Map<string, number> {
  const counts = new Map<string, number>(memberIds.map((id) => [id, 0]));
  for (const run of runs) {
    for (const entry of run.roster) {
      if (counts.has(entry.userId)) {
        counts.set(entry.userId, (counts.get(entry.userId) ?? 0) + 1);
      }
    }
  }
  return counts;
}
