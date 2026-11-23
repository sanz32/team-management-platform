import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchCharacterData, fetchRaidLockouts, CharacterData } from "@/lib/blizzard";
import { getCurrentLockoutWeek, getLockoutWeekStart } from "@/lib/wow-reset";
import { RaidDef } from "@/lib/raids";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import { refreshArmorySnapshot } from "@/lib/character-armory";
import { refreshAutoMainClasses } from "@/lib/main-classes";

export type RefreshScope = "lockouts" | "armory" | "all";

function raidKeyFromBossKey(bossKey: string): string {
  return bossKey.split("-")[0];
}

interface CharacterRow {
  id: string;
  name: string;
  realm_slug: string;
  region: string;
  mythic_plus_rating?: number | null;
  owner_is_friend?: boolean;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function refreshCharacterCore(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  char: CharacterRow
): Promise<CharacterData> {
  const data = await fetchCharacterData(char.region, char.realm_slug, char.name);

  if (data.found) {
    const fields: Record<string, unknown> = {
      ilvl: data.ilvl,
      level: data.level,
      class: data.class,
      faction: data.faction,
      realm_name: data.realmName,
      last_updated: new Date().toISOString(),
    };
    if (typeof data.id === "number") fields.blizzard_character_id = data.id;

    await supabase.from("characters").update(fields).eq("id", char.id);
  }

  return data;
}

async function refreshCharacterLockouts(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  char: CharacterRow,
  raids: RaidDef[],
  wclRaidKeys: Set<string>
): Promise<void> {
  const lockouts = await fetchRaidLockouts(char.region, char.realm_slug, char.name, raids);
  if (!lockouts.found) return;

  const weekStart = getLockoutWeekStart(char.region).getTime();
  const lockoutWeek = getCurrentLockoutWeek(char.region);

  const raidKeysResolvedByWcl = char.owner_is_friend ? new Set<string>() : wclRaidKeys;

  const rows = lockouts.kills
    .filter((k) => !raidKeysResolvedByWcl.has(raidKeyFromBossKey(k.bossKey)))
    .filter((k) => k.lastKillTimestamp >= weekStart)
    .map((k) => ({
      character_id: char.id,
      boss_key: k.bossKey,
      lockout_week: lockoutWeek,
    }));

  if (rows.length > 0) {
    await supabase
      .from("boss_kills")
      .upsert(rows, {
        onConflict: "character_id,boss_key,lockout_week",
        ignoreDuplicates: true,
      });
  }
}

async function refreshOneCharacter(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  char: CharacterRow,
  scope: RefreshScope,
  raids: RaidDef[],
  wclRaidKeys: Set<string>
) {
  try {
    let coreData: CharacterData | undefined;

    if (scope === "lockouts" || scope === "all") {
      coreData = await refreshCharacterCore(supabase, char);

      try {
        await refreshCharacterLockouts(supabase, char, raids, wclRaidKeys);
      } catch (lockoutErr) {
        console.error(`Error consultando lockouts de ${char.name}:`, lockoutErr);
      }
    }

    if (scope === "armory" || scope === "all") {
      try {
        await refreshArmorySnapshot(supabase, char, coreData);
      } catch (armoryErr) {
        console.error(`Error refrescando Armory de ${char.name}:`, armoryErr);
      }
    }

    return { id: char.id, name: char.name, ...(coreData ?? {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return { id: char.id, name: char.name, error: message };
  }
}

export async function refreshCharacters(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characters: CharacterRow[],
  scope: RefreshScope = "all"
) {
  const raids = scope === "armory" ? [] : (await getCurrentRaidCatalog(supabase)).raids;
  const wclRaidKeys = new Set<string>(raids.filter((r) => r.lockoutSource === "wcl").map((r) => r.key));

  const results = await mapWithConcurrency(characters, 5, (char) =>
    refreshOneCharacter(supabase, char, scope, raids, wclRaidKeys)
  );

  if (scope !== "armory") {
    try {
      await refreshAutoMainClasses(supabase);
    } catch (err) {
      console.error("Error recalculando clases main:", err);
    }
  }

  return results;
}
