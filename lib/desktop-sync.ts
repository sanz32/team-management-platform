import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { normalizeName, foldRealmForMatch } from "@/lib/wcl";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function resolveUserIdFromToken(
  supabase: SupabaseClient,
  rawToken: string
): Promise<string | null> {
  const tokenHash = hashToken(rawToken);

  const { data, error } = await supabase
    .from("sync_tokens")
    .select("id, user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Error consultando sync_tokens: ${error.message}`);
  }
  if (!data) return null;

  await supabase
    .from("sync_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data.user_id as string;
}

export interface SyncVaultSlot {
  type: string;
  index: number;
  threshold: number | null;
  progress: number | null;
  level: number | null;
  itemLink?: string | null;
  itemLevel?: number | null;
}

export interface SyncCurrency {
  currencyID: number;
  name: string | null;
  quantity: number;
  currencyType: string | null;
  totalEarned?: number | null;
  maxQuantity?: number | null;
  useTotalEarnedForMaxQty?: boolean | null;
  maxWeeklyQuantity?: number | null;
  quantityEarnedThisWeek?: number | null;
}

export interface SyncDungeonScore {
  challengeModeID: number;
  level: number;
  score: number;
  finishedSuccess: boolean;
}

export interface SyncBounty {
  itemID: number;
  bagCount: number;
  fluteBagCount: number;
  hasBuff: boolean;
  weeklyQuestClaimed: boolean;
  delveCompletionsThisWeek: number;
}

export interface SyncCharacterPayload {
  info: { name: string; realm: string };
  guid?: number;
  money?: number;
  mythicplus?: {
    rating?: number;
    bestSeasonScore?: number;
    keystone?: unknown;
    dungeons?: SyncDungeonScore[];
  };
  vault?: {
    hasAvailableRewards?: boolean;
    slots?: SyncVaultSlot[];
  };
  currencies?: SyncCurrency[];
  bounty?: SyncBounty;
  source?: "own" | "gg-relay";
  ts?: number;
}

export interface CharacterRef {
  id: string;
  name: string;
  realm_slug: string;
  realm_name: string | null;
  blizzard_character_id: number | null;
  gg_observed_at: string | null;
}

export interface MatchResult {
  matched: { character: SyncCharacterPayload; characterId: string; ggObservedAt: string | null }[];
  unmatched: SyncCharacterPayload[];
}

export function matchCharactersAgainstPool(pool: CharacterRef[], incoming: SyncCharacterPayload[]): MatchResult {
  const byGuid = new Map<number, string>();
  const exactByKey = new Map<string, string>();
  const foldedByKey = new Map<string, string[]>();

  const exactKey = (name: string, realm: string) =>
    `${name.trim().normalize("NFC").toLowerCase()}@${foldRealmForMatch(realm)}`;

  const ggObservedAtById = new Map<string, string | null>();

  for (const c of pool) {
    ggObservedAtById.set(c.id, c.gg_observed_at);
    if (typeof c.blizzard_character_id === "number") {
      byGuid.set(c.blizzard_character_id, c.id);
    }
    exactByKey.set(exactKey(c.name, c.realm_slug), c.id);

    const foldedNameKey = normalizeName(c.name);
    for (const realmVariant of [c.realm_slug, c.realm_name].filter(Boolean) as string[]) {
      const foldedKey = `${foldedNameKey}@${foldRealmForMatch(realmVariant)}`;
      const bucket = foldedByKey.get(foldedKey);
      if (bucket) {
        if (!bucket.includes(c.id)) bucket.push(c.id);
      } else {
        foldedByKey.set(foldedKey, [c.id]);
      }
    }
  }

  const matched: MatchResult["matched"] = [];
  const unmatched: SyncCharacterPayload[] = [];

  const pending: SyncCharacterPayload[] = [];
  const claimed = new Set<string>();

  for (const character of incoming) {
    if (typeof character.guid === "number") {
      const byId = byGuid.get(character.guid);
      if (byId) {
        matched.push({ character, characterId: byId, ggObservedAt: ggObservedAtById.get(byId) ?? null });
        claimed.add(byId);
        continue;
      }
    }
    pending.push(character);
  }

  for (const character of pending) {
    const { name, realm } = character.info;
    if (!name || !realm) {
      unmatched.push(character);
      continue;
    }

    const exactId = exactByKey.get(exactKey(name, realm));
    if (exactId) {
      if (claimed.has(exactId)) unmatched.push(character);
      else matched.push({ character, characterId: exactId, ggObservedAt: ggObservedAtById.get(exactId) ?? null });
      continue;
    }

    const foldedKey = `${normalizeName(name)}@${foldRealmForMatch(realm)}`;
    const bucket = foldedByKey.get(foldedKey);
    if (bucket && bucket.length === 1 && !claimed.has(bucket[0])) {
      matched.push({ character, characterId: bucket[0], ggObservedAt: ggObservedAtById.get(bucket[0]) ?? null });
    } else {
      unmatched.push(character);
    }
  }

  return { matched, unmatched };
}

export async function matchSyncCharacters(
  supabase: SupabaseClient,
  userId: string,
  incoming: SyncCharacterPayload[]
): Promise<MatchResult> {
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, realm_slug, realm_name, blizzard_character_id, gg_observed_at")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Error consultando characters del usuario: ${error.message}`);
  }

  return matchCharactersAgainstPool((data ?? []) as CharacterRef[], incoming);
}

const GUILD_MATCH_PAGE_SIZE = 1000;

export async function matchGuildCharacters(
  supabase: SupabaseClient,
  incoming: SyncCharacterPayload[]
): Promise<MatchResult> {
  if (incoming.length === 0) return { matched: [], unmatched: [] };

  const pool: CharacterRef[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("characters")
      .select("id, name, realm_slug, realm_name, blizzard_character_id, gg_observed_at")
      .range(from, from + GUILD_MATCH_PAGE_SIZE - 1);

    if (error) throw new Error(`Error consultando characters del guild: ${error.message}`);

    pool.push(...((data ?? []) as CharacterRef[]));
    if (!data || data.length < GUILD_MATCH_PAGE_SIZE) break;
    from += GUILD_MATCH_PAGE_SIZE;
  }

  return matchCharactersAgainstPool(pool, incoming);
}

export function filterFreshForeignCharacters(
  matched: MatchResult["matched"]
): MatchResult["matched"] {
  return matched.filter(({ character, ggObservedAt }) => {
    if (typeof character.ts !== "number") return false;
    if (!ggObservedAt) return true;
    return character.ts * 1000 >= new Date(ggObservedAt).getTime();
  });
}

export interface MatchedCharacter {
  character: SyncCharacterPayload;
  characterId: string;
}

export function dedupeMatchedPreferOwn(matched: MatchedCharacter[]): MatchedCharacter[] {
  const byId = new Map<string, MatchedCharacter>();
  for (const entry of matched) {
    const existing = byId.get(entry.characterId);
    if (!existing) {
      byId.set(entry.characterId, entry);
      continue;
    }
    const entryIsOwn = entry.character.source !== "gg-relay";
    const existingIsOwn = existing.character.source !== "gg-relay";
    if (entryIsOwn && !existingIsOwn) {
      byId.set(entry.characterId, entry);
    }
  }
  return Array.from(byId.values());
}

export async function upsertVaultAndCurrencies(
  supabase: SupabaseClient,
  matched: MatchedCharacter[]
): Promise<void> {
  const nowIso = new Date().toISOString();

  const vaultRows = matched.flatMap(({ characterId, character }) =>
    (character.vault?.slots ?? []).map((slot) => ({
      character_id: characterId,
      slot_type: slot.type,
      slot_index: slot.index,
      threshold: slot.threshold ?? null,
      progress: slot.progress ?? null,
      level: slot.level ?? null,
      has_available_rewards: character.vault?.hasAvailableRewards ?? false,
      updated_at: nowIso,
    }))
  );

  const characterIdsWithVaultData = Array.from(
    new Set(
      matched
        .filter(({ character }) => (character.vault?.slots?.length ?? 0) > 0)
        .map(({ characterId }) => characterId)
    )
  );

  if (characterIdsWithVaultData.length > 0) {
    const { data: existingRows, error: selectError } = await supabase
      .from("character_vault")
      .select("id, character_id, slot_type, slot_index")
      .in("character_id", characterIdsWithVaultData);
    if (selectError) {
      throw new Error(`Error leyendo character_vault para podar huérfanas: ${selectError.message}`);
    }

    const currentKeys = new Set(vaultRows.map((r) => `${r.character_id}:${r.slot_type}:${r.slot_index}`));
    const orphanedIds = (existingRows ?? [])
      .filter((r) => !currentKeys.has(`${r.character_id}:${r.slot_type}:${r.slot_index}`))
      .map((r) => r.id as string);

    if (orphanedIds.length > 0) {
      const { error: deleteError } = await supabase.from("character_vault").delete().in("id", orphanedIds);
      if (deleteError) throw new Error(`Error podando character_vault: ${deleteError.message}`);
    }
  }

  if (vaultRows.length > 0) {
    const { error } = await supabase
      .from("character_vault")
      .upsert(vaultRows, { onConflict: "character_id,slot_type,slot_index" });
    if (error) throw new Error(`Error guardando character_vault: ${error.message}`);
  }

  const itemRows = matched.flatMap(({ characterId, character }) =>
    (character.vault?.slots ?? [])
      .filter((slot) => slot.itemLink === null || (typeof slot.itemLink === "string" && slot.itemLink.length > 0))
      .map((slot) => ({
        character_id: characterId,
        slot_type: slot.type,
        slot_index: slot.index,
        item_link: slot.itemLink,
        item_level: slot.itemLevel ?? null,
        updated_at: nowIso,
      }))
  );

  if (itemRows.length > 0) {
    const { error } = await supabase
      .from("character_vault")
      .upsert(itemRows, { onConflict: "character_id,slot_type,slot_index" });
    if (error) throw new Error(`Error guardando el ítem del vault: ${error.message}`);
  }

  const currencyRows = matched.flatMap(({ characterId, character }) => {
    const seenCurrencyIds = new Set<number>();
    return (character.currencies ?? [])
      .filter((currency) => {
        if (seenCurrencyIds.has(currency.currencyID)) return false;
        seenCurrencyIds.add(currency.currencyID);
        return true;
      })
      .map((currency) => ({
        character_id: characterId,
        currency_id: currency.currencyID,
        name: currency.name ?? null,
        quantity: currency.quantity ?? 0,
        currency_type: currency.currencyType,
        total_earned: currency.totalEarned ?? null,
        max_quantity: currency.maxQuantity ?? null,
        use_total_earned_for_max_qty: currency.useTotalEarnedForMaxQty ?? null,
        max_weekly_quantity: currency.maxWeeklyQuantity ?? null,
        quantity_earned_this_week: currency.quantityEarnedThisWeek ?? null,
        updated_at: nowIso,
      }));
  });

  if (currencyRows.length > 0) {
    const { error } = await supabase
      .from("character_currencies")
      .upsert(currencyRows, { onConflict: "character_id,currency_id" });
    if (error) throw new Error(`Error guardando character_currencies: ${error.message}`);
  }
}

export async function updateCharacterScalarFields(
  supabase: SupabaseClient,
  characterId: string,
  character: SyncCharacterPayload
): Promise<void> {
  const scalarFields: Record<string, unknown> = {};
  if (character.source !== "gg-relay") {
    scalarFields.desktop_synced_at = new Date().toISOString();
  }
  if (typeof character.ts === "number") {
    scalarFields.gg_observed_at = new Date(character.ts * 1000).toISOString();
  }
  if (typeof character.money === "number") scalarFields.gold = character.money / 10000;
  if (typeof character.mythicplus?.rating === "number") {
    scalarFields.mythic_plus_rating = character.mythicplus.rating;
  }
  if (typeof character.mythicplus?.bestSeasonScore === "number") {
    scalarFields.mythic_plus_best_season_score = character.mythicplus.bestSeasonScore;
  }
  if (character.mythicplus?.keystone) {
    scalarFields.mythic_plus_keystone = character.mythicplus.keystone;
  }
  if (Array.isArray(character.mythicplus?.dungeons) && character.mythicplus.dungeons.length > 0) {
    scalarFields.mythic_plus_dungeons = character.mythicplus.dungeons;
  }
  if (character.bounty) {
    scalarFields.delve_bounty = character.bounty;
  }

  if (Object.keys(scalarFields).length === 0) return;

  const { error } = await supabase.from("characters").update(scalarFields).eq("id", characterId);
  if (error) throw new Error(`Error actualizando characters: ${error.message}`);
}

export interface SyncSeason {
  id: number;
  currencyIds: number[];
}

export async function pruneCurrenciesOutsideSeason(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characterIds: string[],
  season: SyncSeason
): Promise<void> {
  if (characterIds.length === 0 || season.currencyIds.length === 0) return;

  const { error } = await supabase
    .from("character_currencies")
    .delete()
    .in("character_id", characterIds)
    .not("currency_id", "in", `(${season.currencyIds.join(",")})`);

  if (error) throw new Error(`Error limpiando monedas de temporadas viejas: ${error.message}`);
}

export async function autoTrackSeasonCurrencies(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  season: SyncSeason
): Promise<boolean> {
  if (season.currencyIds.length === 0) return false;

  const { data: claimed, error: claimError } = await supabase
    .from("currency_autotrack")
    .upsert({ season_id: season.id }, { onConflict: "season_id", ignoreDuplicates: true })
    .select("season_id");

  if (claimError) throw new Error(`Error reclamando el auto-marcado: ${claimError.message}`);
  if (!claimed || claimed.length === 0) return false;

  const rows = season.currencyIds.map((currency_id) => ({ currency_id }));
  const { error } = await supabase
    .from("tracked_currencies")
    .upsert(rows, { onConflict: "currency_id", ignoreDuplicates: true });

  if (error) throw new Error(`Error marcando las monedas de la temporada: ${error.message}`);

  const { error: cleanupError } = await supabase
    .from("tracked_currencies")
    .delete()
    .not("currency_id", "in", `(${season.currencyIds.join(",")})`);

  if (cleanupError) {
    throw new Error(`Error desmarcando monedas de temporadas viejas: ${cleanupError.message}`);
  }

  return true;
}

export async function getLatestSyncedSeasonId(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<number | null> {
  const { data, error } = await supabase
    .from("currency_autotrack")
    .select("season_id")
    .order("season_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error leyendo la temporada sincronizada:", error.message);
    return null;
  }
  return (data?.season_id as number | undefined) ?? null;
}
