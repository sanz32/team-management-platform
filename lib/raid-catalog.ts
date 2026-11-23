import { createServerSupabaseClient } from "@/lib/supabase-server";
import { RaidDef, RaidKey, Difficulty } from "@/lib/raids";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface RaidCatalog {
  raids: RaidDef[];
  encounterToBoss: Record<number, { raidKey: RaidKey; bossIndex: number }>;
  attemptBasedLockouts: { encounterId: number; difficulty: Difficulty }[];
  wclManualRefreshRaidKeys: RaidKey[];
}

const EMPTY_CATALOG: RaidCatalog = {
  raids: [],
  encounterToBoss: {},
  attemptBasedLockouts: [],
  wclManualRefreshRaidKeys: [],
};

interface RawBoss {
  id: string;
  name: string;
  order_index: number;
  wcl_encounter_id: number | null;
  attempt_based_difficulties: Difficulty[] | null;
  image_url: string | null;
}

interface RawSeasonRaid {
  id: string;
  raid_key: string;
  blizzard_instance_name: string | null;
  name: string;
  abbr: string;
  color: string;
  color_class: string;
  difficulties: Difficulty[] | null;
  lockout_source: "blizzard" | "wcl";
  force_wcl_manual_refresh: boolean;
  header_image_url: string | null;
  order_index: number;
  raid_bosses: RawBoss[] | null;
}

export async function getCurrentSeasonId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("raid_seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function getCurrentRaidCatalog(supabase: SupabaseClient): Promise<RaidCatalog> {
  const seasonId = await getCurrentSeasonId(supabase);
  if (!seasonId) return EMPTY_CATALOG;

  const { data, error } = await supabase
    .from("season_raids")
    .select(
      "id, raid_key, blizzard_instance_name, name, abbr, color, color_class, difficulties, lockout_source, force_wcl_manual_refresh, header_image_url, order_index, raid_bosses(id, name, order_index, wcl_encounter_id, attempt_based_difficulties, image_url)"
    )
    .eq("season_id", seasonId);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as RawSeasonRaid[]).slice().sort((a, b) => a.order_index - b.order_index);

  const raids: RaidDef[] = [];
  const encounterToBoss: RaidCatalog["encounterToBoss"] = {};
  const attemptBasedLockouts: RaidCatalog["attemptBasedLockouts"] = [];
  const wclManualRefreshRaidKeys: RaidKey[] = [];

  for (const raw of rows) {
    const bosses = (raw.raid_bosses ?? []).slice().sort((a, b) => a.order_index - b.order_index);

    raids.push({
      key: raw.raid_key,
      name: raw.name,
      abbr: raw.abbr,
      colorClass: raw.color_class,
      color: raw.color,
      bosses: bosses.map((b) => ({ name: b.name, imageUrl: b.image_url })),
      blizzardInstanceName: raw.blizzard_instance_name,
      difficulties: raw.difficulties ?? [],
      lockoutSource: raw.lockout_source,
      forceWclManualRefresh: raw.force_wcl_manual_refresh,
      headerImageUrl: raw.header_image_url,
    });

    if (raw.lockout_source === "wcl" || raw.force_wcl_manual_refresh) {
      wclManualRefreshRaidKeys.push(raw.raid_key);
    }

    bosses.forEach((boss, idx) => {
      const bossIndex = idx + 1;
      if (typeof boss.wcl_encounter_id === "number") {
        encounterToBoss[boss.wcl_encounter_id] = { raidKey: raw.raid_key, bossIndex };
      }
      for (const difficulty of boss.attempt_based_difficulties ?? []) {
        if (typeof boss.wcl_encounter_id === "number") {
          attemptBasedLockouts.push({ encounterId: boss.wcl_encounter_id, difficulty });
        }
      }
    });
  }

  return { raids, encounterToBoss, attemptBasedLockouts, wclManualRefreshRaidKeys };
}

export function findMissingEncounterMappings(catalog: RaidCatalog): string[] {
  const mapped = new Set(Object.values(catalog.encounterToBoss).map((m) => `${m.raidKey}-${m.bossIndex}`));
  const missing: string[] = [];
  for (const raid of catalog.raids) {
    raid.bosses.forEach((boss, index) => {
      if (!mapped.has(`${raid.key}-${index + 1}`)) missing.push(`${raid.name}: ${boss.name}`);
    });
  }
  return missing;
}

export function normalizeBossName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveOrCacheWclEncounterId(
  supabase: SupabaseClient,
  encounterId: number,
  bossName: string
): Promise<string | null> {
  const { data: byWclId } = await supabase
    .from("raid_bosses")
    .select("id")
    .eq("wcl_encounter_id", encounterId)
    .maybeSingle();
  if (byWclId) return byWclId.id;

  const { data: candidates } = await supabase.from("raid_bosses").select("id, name");
  const target = normalizeBossName(bossName);
  const match = (candidates ?? []).find((b) => normalizeBossName(b.name as string) === target);
  if (!match) return null;

  await supabase.from("raid_bosses").update({ wcl_encounter_id: encounterId }).eq("id", match.id);
  return match.id;
}
