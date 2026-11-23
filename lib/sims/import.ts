import { createServerSupabaseClient } from "../supabase-server";
import { normalizeName, foldRealmForMatch } from "../wcl";
import { normalizeBossName, roleMismatchesProvider } from "../wishlist";
import { resolveWishlistItems } from "../wishlist-items";
import { resolveSpecFromProviderString } from "../wow-specializations";
import { NormalizedSim, SimProvider2, MetricType } from "./types";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface CharacterRow {
  id: string;
  user_id: string;
  name: string;
  realm_slug: string;
  realm_name: string | null;
  role: string | null;
  class: string | null;
  region: string;
}

export class CharacterNotFoundError extends Error {}
export class CharacterNotOwnedError extends Error {}
export class SpecNotResolvedError extends Error {}

export function matchCharacter(
  characters: CharacterRow[],
  simCharacterName: string,
  simRealmName: string | null
): CharacterRow | null {
  if (!simRealmName) {
    const candidates = characters.filter(
      (c) => c.name.trim().normalize("NFC").toLowerCase() === simCharacterName.trim().normalize("NFC").toLowerCase()
    );
    return candidates.length === 1 ? candidates[0] : null;
  }

  const foldedRealm = foldRealmForMatch(simRealmName);
  const exact = characters.find(
    (c) =>
      c.name.trim().normalize("NFC").toLowerCase() === simCharacterName.trim().normalize("NFC").toLowerCase() &&
      foldRealmForMatch(c.realm_name ?? c.realm_slug) === foldedRealm
  );
  if (exact) return exact;

  const foldedName = normalizeName(simCharacterName);
  return (
    characters.find(
      (c) => normalizeName(c.name) === foldedName && foldRealmForMatch(c.realm_name ?? c.realm_slug) === foldedRealm
    ) ?? null
  );
}

export function canImportForCharacter(character: { user_id: string }, requestingUserId: string, isAdmin: boolean): boolean {
  return character.user_id === requestingUserId || isAdmin;
}

export interface ImportResult {
  character: { id: string; name: string; class: string | null; role: string | null };
  roleMismatchWarning: boolean;
  unmatchedBossCount: number;
  sim: {
    id: string;
    provider: SimProvider2;
    metricType: MetricType;
    spec: string | null;
    specIconUrl: string | null;
    fightStyle: string | null;
    importedAt: string;
    baselineOutput: number | null;
  };
  bosses: {
    bossId: string;
    bossName: string;
    orderIndex: number;
    upgrades: {
      itemId: number;
      itemName: string | null;
      itemIconUrl: string | null;
      ilvl: number;
      difficulty: string;
      upgradePct: number;
      upgradeAbsolute: number | null;
      priority: number | null;
      isTierPiece: boolean;
      source: string;
    }[];
  }[];
}

export async function importNormalizedSim(
  supabase: SupabaseClient,
  requestingUserId: string,
  isAdmin: boolean,
  providerId: SimProvider2,
  metricType: MetricType,
  simId: string,
  simUrl: string,
  rawJson: unknown,
  normalized: NormalizedSim
): Promise<ImportResult> {
  const { data: allCharacters, error: charsError } = await supabase
    .from("characters")
    .select("id, user_id, name, realm_slug, realm_name, role, class, region");
  if (charsError) throw new Error(charsError.message);

  const character = matchCharacter(
    (allCharacters ?? []) as CharacterRow[],
    normalized.characterName,
    normalized.realmName
  );

  if (!character) {
    throw new CharacterNotFoundError(
      "No encontramos un personaje con ese nombre en el roster, verifica que esté vinculado en tu perfil."
    );
  }

  if (!canImportForCharacter(character, requestingUserId, isAdmin)) {
    throw new CharacterNotOwnedError("Ese personaje no es tuyo -- solo puedes importar sims de tus propios personajes.");
  }

  if (!character.class || !normalized.spec) {
    throw new SpecNotResolvedError(
      "No pudimos determinar la especialización de esa sim -- verifica que el personaje tenga clase cargada en su perfil."
    );
  }

  const spec = await resolveSpecFromProviderString(supabase, character.region, character.class, normalized.spec);
  if (!spec) {
    throw new SpecNotResolvedError(
      `No reconocemos "${normalized.spec}" como una especialización de ${character.class}.`
    );
  }

  const { data: season } = await supabase.from("raid_seasons").select("id").eq("is_current", true).maybeSingle();
  if (!season) {
    throw new Error("No hay ninguna temporada de Wishlist sincronizada todavía -- avisa a un admin.");
  }

  const { data: bosses, error: bossesError } = await supabase
    .from("raid_bosses")
    .select("id, name, order_index")
    .eq("season_id", season.id);
  if (bossesError) throw new Error(bossesError.message);

  const bossByName = new Map((bosses ?? []).map((b) => [normalizeBossName(b.name), b]));

  const matchedUpgrades: { boss: { id: string; name: string; order_index: number }; upgrade: NormalizedSim["upgrades"][number] }[] = [];
  let unmatchedBossCount = 0;
  for (const upgrade of normalized.upgrades) {
    const boss = bossByName.get(normalizeBossName(upgrade.bossExternalName));
    if (!boss) {
      unmatchedBossCount += 1;
      continue;
    }
    matchedUpgrades.push({ boss, upgrade });
  }

  const iconHints = new Map<number, string>();
  for (const { upgrade } of matchedUpgrades) {
    if (upgrade.iconNameHint) iconHints.set(upgrade.itemId, upgrade.iconNameHint);
  }
  await resolveWishlistItems(
    supabase,
    character.region,
    matchedUpgrades.map((m) => m.upgrade.itemId),
    iconHints
  );

  const importedAt = new Date().toISOString();
  const { data: simRow, error: simError } = await supabase
    .from("character_sims")
    .upsert(
      {
        character_id: character.id,
        provider: providerId,
        metric_type: metricType,
        sim_id: simId,
        sim_url: simUrl,
        spec: normalized.spec,
        spec_id: spec.specId,
        fight_style: normalized.fightStyle,
        imported_at: importedAt,
        is_stale: false,
        raw_json: rawJson,
        baseline_output: normalized.baselineOutput,
      },
      { onConflict: "character_id,provider,spec_id" }
    )
    .select("id")
    .single();
  if (simError || !simRow) throw new Error(simError?.message ?? "No se pudo guardar la sim.");

  await supabase.from("character_wishlist_upgrades").delete().eq("sim_id", simRow.id);

  if (matchedUpgrades.length > 0) {
    const { error: insertError } = await supabase.from("character_wishlist_upgrades").insert(
      matchedUpgrades.map(({ boss, upgrade }) => ({
        sim_id: simRow.id,
        character_id: character.id,
        boss_id: boss.id,
        item_id: upgrade.itemId,
        source: upgrade.source,
        ilvl: upgrade.ilvl,
        difficulty: upgrade.difficulty,
        upgrade_pct: upgrade.upgradePct,
        upgrade_absolute: upgrade.upgradeAbsolute,
        priority: upgrade.priority,
        is_tier_piece: upgrade.isTierPiece,
      }))
    );
    if (insertError) throw new Error(insertError.message);
  }

  const { data: itemsMeta } = await supabase
    .from("wishlist_items")
    .select("item_id, name, icon_url")
    .in(
      "item_id",
      matchedUpgrades.map((m) => m.upgrade.itemId)
    );
  const itemMetaById = new Map((itemsMeta ?? []).map((i) => [i.item_id, i]));

  const byBoss = new Map<string, ImportResult["bosses"][number]>();
  for (const { boss, upgrade } of matchedUpgrades) {
    if (!byBoss.has(boss.id)) {
      byBoss.set(boss.id, { bossId: boss.id, bossName: boss.name, orderIndex: boss.order_index, upgrades: [] });
    }
    const meta = itemMetaById.get(upgrade.itemId);
    byBoss.get(boss.id)!.upgrades.push({
      itemId: upgrade.itemId,
      itemName: meta?.name ?? null,
      itemIconUrl: meta?.icon_url ?? null,
      ilvl: upgrade.ilvl,
      difficulty: upgrade.difficulty,
      upgradePct: upgrade.upgradePct,
      upgradeAbsolute: upgrade.upgradeAbsolute,
      priority: upgrade.priority,
      isTierPiece: upgrade.isTierPiece,
      source: upgrade.source,
    });
  }

  const bossesResult = Array.from(byBoss.values()).sort((a, b) => a.orderIndex - b.orderIndex);
  bossesResult.forEach((b) => b.upgrades.sort((a, b2) => b2.upgradePct - a.upgradePct));

  return {
    character: { id: character.id, name: character.name, class: character.class, role: character.role },
    roleMismatchWarning: roleMismatchesProvider(spec.role, providerId),
    unmatchedBossCount,
    sim: {
      id: simRow.id,
      provider: providerId,
      metricType,
      spec: spec.specName,
      specIconUrl: spec.iconUrl,
      fightStyle: normalized.fightStyle,
      importedAt,
      baselineOutput: normalized.baselineOutput,
    },
    bosses: bossesResult,
  };
}
