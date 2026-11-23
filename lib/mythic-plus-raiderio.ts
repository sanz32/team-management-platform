const RAIDER_IO_BASE = "https://raider.io/api/v1";
const USER_AGENT = "Mozilla/5.0";

export interface RaiderIoRecentRun {
  keystoneRunId: number;
  dungeon: string;
  mythicLevel: number;
  completedAt: string;
  clearTimeMs: number;
  numKeystoneUpgrades: number;
  seasonSlug: string | null;
}

export interface RaiderIoRunRosterMember {
  characterName: string;
  realmSlug: string;
  regionSlug: string | null;
  className: string | null;
  role: string | null;
  itemLevelEquipped: number | null;
}

export interface RaiderIoRunDetails {
  keystoneRunId: number;
  dungeon: string;
  mythicLevel: number;
  completedAt: string;
  clearTimeMs: number;
  numChests: number;
  roster: RaiderIoRunRosterMember[];
}

function extractSeasonSlugFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/\/mythic-plus-runs\/([^/]+)\//);
  return match ? match[1] : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function parseRecentRunsResponse(json: unknown): RaiderIoRecentRun[] {
  const root = asRecord(json);
  const rawRuns = Array.isArray(root.mythic_plus_recent_runs) ? root.mythic_plus_recent_runs : [];

  const runs: RaiderIoRecentRun[] = [];
  for (const raw of rawRuns) {
    const r = asRecord(raw);
    if (
      typeof r.keystone_run_id !== "number" ||
      typeof r.dungeon !== "string" ||
      typeof r.mythic_level !== "number" ||
      typeof r.completed_at !== "string" ||
      typeof r.clear_time_ms !== "number"
    ) {
      continue;
    }
    runs.push({
      keystoneRunId: r.keystone_run_id,
      dungeon: r.dungeon,
      mythicLevel: r.mythic_level,
      completedAt: r.completed_at,
      clearTimeMs: r.clear_time_ms,
      numKeystoneUpgrades: typeof r.num_keystone_upgrades === "number" ? r.num_keystone_upgrades : 0,
      seasonSlug: extractSeasonSlugFromUrl(r.url),
    });
  }
  return runs;
}

function parseRosterMember(raw: unknown): RaiderIoRunRosterMember | null {
  const entry = asRecord(raw);
  const character = asRecord(entry.character);
  const name = character.name;
  const realm = asRecord(character.realm);
  const realmSlug = realm.slug;
  if (typeof name !== "string" || typeof realmSlug !== "string") return null;

  const region = asRecord(character.region);
  const characterClass = asRecord(character.class);
  const items = asRecord(entry.items);
  const role = entry.role;

  return {
    characterName: name,
    realmSlug,
    regionSlug: typeof region.slug === "string" ? region.slug : null,
    className: typeof characterClass.name === "string" ? characterClass.name : null,
    role: typeof role === "string" ? role : null,
    itemLevelEquipped: typeof items.item_level_equipped === "number" ? items.item_level_equipped : null,
  };
}

export function parseRunDetailsResponse(json: unknown): RaiderIoRunDetails | null {
  const root = asRecord(json);
  const dungeon = asRecord(root.dungeon);
  const dungeonName = dungeon.name;

  if (
    typeof root.keystone_run_id !== "number" ||
    typeof dungeonName !== "string" ||
    typeof root.mythic_level !== "number" ||
    typeof root.completed_at !== "string" ||
    typeof root.clear_time_ms !== "number" ||
    !Array.isArray(root.roster)
  ) {
    return null;
  }

  const roster = root.roster.map(parseRosterMember).filter((m): m is RaiderIoRunRosterMember => m !== null);

  return {
    keystoneRunId: root.keystone_run_id,
    dungeon: dungeonName,
    mythicLevel: root.mythic_level,
    completedAt: root.completed_at,
    clearTimeMs: root.clear_time_ms,
    numChests: typeof root.num_chests === "number" ? root.num_chests : 0,
    roster,
  };
}

export async function fetchRecentRuns(
  region: string,
  realmSlug: string,
  characterName: string
): Promise<RaiderIoRecentRun[]> {
  const params = new URLSearchParams({
    region,
    realm: realmSlug,
    name: characterName,
    fields: "mythic_plus_recent_runs",
  });
  const res = await fetch(`${RAIDER_IO_BASE}/characters/profile?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return [];
  return parseRecentRunsResponse(await res.json());
}

export async function fetchRunDetails(seasonSlug: string, runId: number): Promise<RaiderIoRunDetails | null> {
  const params = new URLSearchParams({ season: seasonSlug, id: String(runId) });
  const res = await fetch(`${RAIDER_IO_BASE}/mythic-plus/run-details?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  return parseRunDetailsResponse(await res.json());
}
