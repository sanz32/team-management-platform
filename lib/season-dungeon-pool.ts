import { parseKeystoneRaw } from "./sync-display";
import { findKeystoneDungeon } from "./mythic-plus-dungeons";

export const CURRENT_SEASON_DUNGEON_POOL: number[] = [
  584,
  585,
  586,
  587,
  588,
  249,
  250,
  399,
];

export interface WeeklyDungeonScore {
  challengeModeID: number;
  level: number;
  score: number;
  finishedSuccess: boolean;
}

export interface SeasonDungeonView {
  challengeModeID: number;
  name: string;
  abbr: string;
  status: "completed" | "keystone" | "no-data";
  keystoneLevel: number | null;
  weeklyScore?: number;
}

function ownedChallengeModeId(
  challengeModeID: number | null,
  mapId: number | null,
  pool: number[]
): number | null {
  if (challengeModeID !== null) {
    return pool.includes(challengeModeID) ? challengeModeID : null;
  }
  const byMap = findKeystoneDungeon(null, mapId);
  if (!byMap) return null;
  return pool.find((id) => findKeystoneDungeon(id, null) === byMap) ?? null;
}

export function resolveSeasonDungeons(
  keystone: unknown,
  pool: number[] = CURRENT_SEASON_DUNGEON_POOL,
  weeklyDungeons?: WeeklyDungeonScore[] | null
): SeasonDungeonView[] {
  const parsed = parseKeystoneRaw(keystone);
  const ownedId = parsed ? ownedChallengeModeId(parsed.challengeModeID, parsed.mapId, pool) : null;

  const weeklyByChallengeModeId = new Map<number, WeeklyDungeonScore>();
  for (const entry of weeklyDungeons ?? []) {
    if (typeof entry?.challengeModeID === "number" && entry.level > 0) {
      weeklyByChallengeModeId.set(entry.challengeModeID, entry);
    }
  }

  return pool.map((challengeModeID) => {
    const dungeon = findKeystoneDungeon(challengeModeID, null);
    const weekly = weeklyByChallengeModeId.get(challengeModeID);
    const isOwned = ownedId === challengeModeID;

    if (weekly) {
      return {
        challengeModeID,
        name: dungeon?.name ?? `Mazmorra ${challengeModeID}`,
        abbr: dungeon?.abbr ?? "??",
        status: "completed",
        keystoneLevel: weekly.level,
        weeklyScore: weekly.score,
      };
    }

    return {
      challengeModeID,
      name: dungeon?.name ?? `Mazmorra ${challengeModeID}`,
      abbr: dungeon?.abbr ?? "??",
      status: isOwned ? "keystone" : "no-data",
      keystoneLevel: isOwned && parsed ? parsed.level : null,
    };
  });
}
